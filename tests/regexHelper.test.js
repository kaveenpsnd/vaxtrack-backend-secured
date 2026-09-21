import { escapeRegex } from "../src/helpers/regexHelper.js";

describe("Regex Helper - escapeRegex (Finding #3)", () => {
  test("should escape standard regex metacharacters", () => {
    const input = ".*+?^${}()|[]\\";
    const escaped = escapeRegex(input);
    expect(escaped).toBe("\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\");
  });

  test("should neutralize ReDoS pathological patterns", () => {
    const redosPayload = "(a+)+$";
    const escaped = escapeRegex(redosPayload);
    expect(escaped).toBe("\\(a\\+\\)\\+\\$");

    // Compiling with the escaped pattern treats characters literally
    const reg = new RegExp(escaped);
    expect(reg.test("(a+)+$")).toBe(true);
    expect(reg.test("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa!")).toBe(false);
  });

  test("should handle empty strings and non-string inputs safely", () => {
    expect(escapeRegex("")).toBe("");
    expect(escapeRegex(null)).toBe("");
    expect(escapeRegex(undefined)).toBe("");
    expect(escapeRegex(123)).toBe("");
  });

  test("should leave regular alphanumeric characters untouched", () => {
    const safeInput = "PfizerBioNTech2026";
    expect(escapeRegex(safeInput)).toBe("PfizerBioNTech2026");
  });

  test("should escape dots and dashes in queries like emails or NIC numbers", () => {
    const nicQuery = "991234567V.";
    expect(escapeRegex(nicQuery)).toBe("991234567V\\.");
  });
});
