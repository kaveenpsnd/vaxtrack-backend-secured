import { jest } from '@jest/globals';
import express from 'express';
import jwt from 'jsonwebtoken';

// Route-level authorization tests for /api/records (Vulnerability #5).
// The controller is mocked, so these tests only check who can reach it.

process.env.JWT_SECRET = 'test-secret';

const users = {
  'aaaaaaaaaaaaaaaaaaaaaaaa': { _id: 'aaaaaaaaaaaaaaaaaaaaaaaa', name: 'Pat Public', role: 'Public' },
  'bbbbbbbbbbbbbbbbbbbbbbbb': { _id: 'bbbbbbbbbbbbbbbbbbbbbbbb', name: 'Sam Staff', role: 'HospitalStaff' },
  'cccccccccccccccccccccccc': { _id: 'cccccccccccccccccccccccc', name: 'Ada Admin', role: 'Admin' },
};

// ── Mock Setup ──────────────────────────────────────────────
const mockUserFindById = jest.fn((id) => ({
  select: () => Promise.resolve(users[id] || null),
}));

jest.unstable_mockModule('../src/models/User.js', () => ({
  default: { findById: mockUserFindById },
}));

const handler = (status) => jest.fn((req, res) => res.status(status).json({ success: true }));
const mockCreateRecord = handler(201);
const mockGetMyRecords = handler(200);

jest.unstable_mockModule('../src/controllers/recordController.js', () => ({
  createRecord: mockCreateRecord,
  getMyRecords: mockGetMyRecords,
  getHistory: handler(200),
  getDueRecords: handler(200),
  getRecordById: handler(200),
  updateRecord: handler(200),
  deleteRecord: handler(200),
  getAllRecords: handler(200),
}));

const { default: recordRoutes } = await import('../src/routes/recordRoutes.js');
const { protect, staffOnly } = await import('../src/middleware/authMiddleware.js');

// ── Test app ────────────────────────────────────────────────
const app = express();
app.use(express.json());
// Minimal stand-in for cookie-parser, so requests authenticate whether
// protect reads the Bearer header or the httpOnly `jwt` cookie.
app.use((req, res, next) => {
  req.cookies = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) req.cookies[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  next();
});
app.use('/api/records', recordRoutes);
// Same status logic as the global error handler in src/server.js
app.use((err, req, res, next) => {
  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  res.status(statusCode).json({ success: false, message: err.message });
});

let server;
let baseUrl;

beforeAll(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api/records`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

beforeEach(() => {
  jest.clearAllMocks();
});

const tokenFor = (id) => jwt.sign({ id, role: users[id].role }, process.env.JWT_SECRET);

const request = (method, path, id, body) => {
  const headers = { 'Content-Type': 'application/json' };
  if (id) {
    const token = tokenFor(id);
    headers.Authorization = `Bearer ${token}`;
    headers.Cookie = `jwt=${token}`;
  }
  return fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
};

const recordBody = {
  patientId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
  vaccineId: '60d21b4667d0d8992e610c85',
  batchId: '60d21b4667d0d8992e610c86',
  hospitalId: '665a1b2c3d4e5f6a7b8c9d0e',
};

// ── Tests ───────────────────────────────────────────────────
describe('Record creation authorization (Vulnerability #5)', () => {
  test('POST /api/records runs protect then staffOnly before the controller', () => {
    const layer = recordRoutes.stack.find(
      (l) => l.route && l.route.path === '/' && l.route.methods.post
    );
    const chain = layer.route.stack.map((l) => l.handle);

    expect(chain).toEqual([protect, staffOnly, mockCreateRecord]);
  });

  test('rejects a Public user with 403 and never reaches the controller', async () => {
    const res = await request('POST', '/', 'aaaaaaaaaaaaaaaaaaaaaaaa', recordBody);
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.message).toBe('Not authorized as hospital staff');
    expect(mockCreateRecord).not.toHaveBeenCalled();
  });

  test('rejects a Public user forging a record for another patient', async () => {
    const res = await request('POST', '/', 'aaaaaaaaaaaaaaaaaaaaaaaa', {
      ...recordBody,
      patientId: 'dddddddddddddddddddddddd',
    });

    expect(res.status).toBe(403);
    expect(mockCreateRecord).not.toHaveBeenCalled();
  });

  test('allows HospitalStaff to create a record', async () => {
    const res = await request('POST', '/', 'bbbbbbbbbbbbbbbbbbbbbbbb', recordBody);

    expect(res.status).toBe(201);
    expect(mockCreateRecord).toHaveBeenCalledTimes(1);
  });

  test('allows Admin to create a record', async () => {
    const res = await request('POST', '/', 'cccccccccccccccccccccccc', recordBody);

    expect(res.status).toBe(201);
    expect(mockCreateRecord).toHaveBeenCalledTimes(1);
  });

  test('rejects an unauthenticated request with 401', async () => {
    const res = await request('POST', '/', null, recordBody);

    expect(res.status).toBe(401);
    expect(mockCreateRecord).not.toHaveBeenCalled();
  });

  test('still lets a Public user read their own records', async () => {
    const res = await request('GET', '/my', 'aaaaaaaaaaaaaaaaaaaaaaaa');

    expect(res.status).toBe(200);
    expect(mockGetMyRecords).toHaveBeenCalledTimes(1);
  });
});
