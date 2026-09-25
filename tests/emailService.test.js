import { jest } from "@jest/globals";
import net from "node:net";

// Regression tests for src/services/emailService.js against the real
// nodemailer package (no mocks). A minimal in-process SMTP server records
// what nodemailer actually sends, so a nodemailer upgrade that changes the
// SMTP conversation, authentication or message encoding fails here.

const { sendVaccinationConfirmation, sendNotificationAlert } = await import(
  "../src/services/emailService.js"
);

// ── Minimal SMTP server ──
// Supports EHLO/HELO, AUTH PLAIN, MAIL, RCPT, DATA, RSET, NOOP and QUIT.
const startSmtpServer = () =>
  new Promise((resolve) => {
    const messages = [];

    const server = net.createServer((socket) => {
      socket.setEncoding("utf8");
      const reply = (line) => socket.write(`${line}\r\n`);
      let buffer = "";
      let inData = false;
      let session = { auth: null, from: null, to: [], data: "" };

      reply("220 test.local ESMTP");

      socket.on("data", (chunk) => {
        buffer += chunk;
        let end;
        while ((end = buffer.indexOf("\r\n")) !== -1) {
          const line = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);

          if (inData) {
            if (line === ".") {
              inData = false;
              messages.push(session);
              session = { auth: session.auth, from: null, to: [], data: "" };
              reply("250 OK: queued");
            } else {
              // Undo SMTP dot-stuffing
              session.data += `${line.startsWith("..") ? line.slice(1) : line}\r\n`;
            }
            continue;
          }

          const [verb, ...args] = line.split(" ");
          switch (verb.toUpperCase()) {
            case "EHLO":
              socket.write("250-test.local\r\n250-AUTH PLAIN\r\n250 8BITMIME\r\n");
              break;
            case "HELO":
              reply("250 test.local");
              break;
            case "AUTH": {
              const [, user, pass] = Buffer.from(args[1] || "", "base64").toString().split("\0");
              session.auth = { user, pass };
              reply("235 Authentication successful");
              break;
            }
            case "MAIL":
              session.from = line.match(/<([^>]*)>/)?.[1];
              reply("250 OK");
              break;
            case "RCPT":
              session.to.push(line.match(/<([^>]*)>/)?.[1]);
              reply("250 OK");
              break;
            case "DATA":
              inData = true;
              reply("354 End data with <CR><LF>.<CR><LF>");
              break;
            case "RSET":
            case "NOOP":
              reply("250 OK");
              break;
            case "QUIT":
              reply("221 Bye");
              socket.end();
              break;
            default:
              reply("502 Command not implemented");
          }
        }
      });
    });

    server.listen(0, "127.0.0.1", () => resolve({ server, messages, port: server.address().port }));
  });

// ── Message decoding (RFC 2047 headers, quoted-printable / base64 bodies) ──
const decodeWords = (value) =>
  value
    .replace(/\?=\s+=\?/g, "?==?")
    .replace(/=\?([^?]+)\?([QB])\?([^?]*)\?=/gi, (_m, _charset, enc, text) =>
      enc.toUpperCase() === "B"
        ? Buffer.from(text, "base64").toString("utf8")
        : Buffer.from(
            text.replace(/_/g, " ").replace(/=([0-9A-F]{2})/gi, (_x, h) => String.fromCharCode(parseInt(h, 16))),
            "latin1"
          ).toString("utf8")
    );

const parseMessage = (raw) => {
  const split = raw.indexOf("\r\n\r\n");
  const headerBlock = raw.slice(0, split).replace(/\r\n[ \t]+/g, " ");
  let body = raw.slice(split + 4);

  const headers = {};
  for (const line of headerBlock.split("\r\n")) {
    const i = line.indexOf(":");
    headers[line.slice(0, i).toLowerCase()] = decodeWords(line.slice(i + 1).trim());
  }

  const encoding = (headers["content-transfer-encoding"] || "").toLowerCase();
  if (encoding === "quoted-printable") {
    body = Buffer.from(
      body.replace(/=\r\n/g, "").replace(/=([0-9A-F]{2})/gi, (_x, h) => String.fromCharCode(parseInt(h, 16))),
      "latin1"
    ).toString("utf8");
  } else if (encoding === "base64") {
    body = Buffer.from(body.replace(/\s+/g, ""), "base64").toString("utf8");
  }

  return { headers, body };
};

// ────────────────────────────────────────────────────────
// ██  EMAIL SERVICE TESTS (nodemailer regression)
// ────────────────────────────────────────────────────────

describe("Email Service (real nodemailer over SMTP)", () => {
  let smtp;
  const savedEnv = {};
  const ENV = {
    EMAIL_HOST: "127.0.0.1",
    EMAIL_USER: "vaxtrack-smtp-user",
    EMAIL_PASS: "smtp-app-password",
    EMAIL_FROM: "noreply@vaxtrack.lk",
  };

  beforeAll(async () => {
    smtp = await startSmtpServer();
    for (const key of [...Object.keys(ENV), "EMAIL_PORT"]) savedEnv[key] = process.env[key];
    Object.assign(process.env, ENV, { EMAIL_PORT: String(smtp.port) });
  });

  afterAll(async () => {
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await new Promise((resolve) => smtp.server.close(resolve));
  });

  beforeEach(() => {
    smtp.messages.length = 0;
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => jest.restoreAllMocks());

  describe("sendVaccinationConfirmation", () => {
    const details = {
      patientEmail: "kavya@example.com",
      patientName: "Kavya Perera",
      vaccineName: "Pfizer-BioNTech",
      hospitalName: "Colombo General Hospital",
      dateAdministered: "2026-09-01T09:00:00Z",
      nextDoseDate: "2026-10-01T09:00:00Z",
      dependentName: null,
    };

    test("sends one message over SMTP and reports success with a message ID", async () => {
      const result = await sendVaccinationConfirmation(details);

      expect(result.success).toBe(true);
      expect(result.messageId).toMatch(/^<.+@.+>$/);
      expect(smtp.messages).toHaveLength(1);
    });

    test("authenticates with EMAIL_USER / EMAIL_PASS", async () => {
      await sendVaccinationConfirmation(details);

      expect(smtp.messages[0].auth).toEqual({ user: ENV.EMAIL_USER, pass: ENV.EMAIL_PASS });
    });

    test("uses EMAIL_FROM as the envelope sender and the patient as recipient", async () => {
      await sendVaccinationConfirmation(details);

      const [message] = smtp.messages;
      expect(message.from).toBe(ENV.EMAIL_FROM);
      expect(message.to).toEqual([details.patientEmail]);
    });

    test("sets the From, To and (UTF-8) Subject headers", async () => {
      await sendVaccinationConfirmation(details);

      const { headers } = parseMessage(smtp.messages[0].data);
      expect(headers.from).toBe(`VaxTrack <${ENV.EMAIL_FROM}>`);
      expect(headers.to).toBe(details.patientEmail);
      expect(headers.subject).toBe("Vaccination Confirmed — Pfizer-BioNTech for Kavya Perera");
      expect(headers["content-type"]).toMatch(/^text\/html; charset=utf-8/i);
    });

    test("renders the patient, vaccine, hospital and next-dose details into the HTML body", async () => {
      await sendVaccinationConfirmation(details);

      const { body } = parseMessage(smtp.messages[0].data);
      expect(body).toContain("💉 VaxTrack");
      expect(body).toContain("Kavya Perera");
      expect(body).toContain("Pfizer-BioNTech");
      expect(body).toContain("Colombo General Hospital");
      expect(body).toContain("Next Dose Due");
    });

    test("addresses the dependent when the record is for a dependent", async () => {
      await sendVaccinationConfirmation({ ...details, dependentName: "Nimal Perera", nextDoseDate: null });

      const { headers, body } = parseMessage(smtp.messages[0].data);
      expect(headers.subject).toBe("Vaccination Confirmed — Pfizer-BioNTech for Nimal Perera");
      expect(body).toContain("your dependent <strong>Nimal Perera</strong>");
      expect(body).not.toContain("Next Dose Due");
    });
  });

  describe("sendNotificationAlert", () => {
    test("sends the alert with the prefixed subject and the message in the body", async () => {
      const result = await sendNotificationAlert({
        patientEmail: "kavya@example.com",
        patientName: "Kavya Perera",
        subject: "Second dose overdue",
        message: "Your second dose was due on 1 October 2026.",
      });

      expect(result.success).toBe(true);
      const [message] = smtp.messages;
      expect(message.to).toEqual(["kavya@example.com"]);

      const { headers, body } = parseMessage(message.data);
      expect(headers.from).toBe(`VaxTrack Alerts <${ENV.EMAIL_FROM}>`);
      expect(headers.subject).toBe("VaxTrack Alert — Second dose overdue");
      expect(body).toContain("Dear <strong>Kavya Perera</strong>");
      expect(body).toContain("Your second dose was due on 1 October 2026.");
    });
  });

  describe("failure handling", () => {
    test("returns success: false instead of throwing when the SMTP server is unreachable", async () => {
      // Grab a free port, then close it so the connection is refused
      const closed = net.createServer();
      await new Promise((resolve) => closed.listen(0, "127.0.0.1", resolve));
      const port = closed.address().port;
      await new Promise((resolve) => closed.close(resolve));
      process.env.EMAIL_PORT = String(port);

      const result = await sendNotificationAlert({
        patientEmail: "kavya@example.com",
        patientName: "Kavya Perera",
        subject: "Test",
        message: "Test",
      });

      process.env.EMAIL_PORT = String(smtp.port);
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/ECONNREFUSED|connect/i);
    });
  });
});
