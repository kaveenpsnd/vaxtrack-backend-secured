# VaxTrack Backend — Security Fixes Report

**Project:** `vaxtrack-backend-secured` (Express 5 / MongoDB, deployed on Render)
**Baseline:** snapshot of [MiniduTH/vaxtrack-backend](https://github.com/MiniduTH/vaxtrack-backend) imported at commit `02bb88d`
**Report date:** 2026-09-22
**Status:** 2 of 3 assigned vulnerabilities remediated and merged to `dev`

## Summary

| # | Vulnerability | OWASP | Severity | Issue | PR | Status |
|---|---|---|---|---|---|---|
| 1 | Privilege escalation via client-supplied `role` at registration | A01: Broken Access Control | Critical | #1 | #2 | ✅ Merged to `dev` |
| 2 | No rate limiting on authentication endpoints (brute-force) | A07: Identification & Auth Failures | High | #3 | #7 | ✅ Merged to `dev` |
| 4 | Client-controlled MIME-type file validation (arbitrary upload) | A04: Insecure Design | Medium | #5 | — | ⏳ Open |

> **Note on numbering:** GitHub issues and pull requests share one number sequence, so "Vulnerability #N" in the report does not equal GitHub issue #N. The mapping above is authoritative.
>
> **Scope:** This report covers Vulnerabilities #1, #2 and #4 only. Vulnerability #3 (ReDoS in search filters, issue #4 / PR #6) was remediated separately by another team member and is out of scope here.

---

## Vulnerability #1 — Privilege escalation via client-supplied role

**Issue:** #1 · **PR:** #2 · **Branch:** `fix/registration-privilege-escalation` · **Commit:** `0bb7ea8`
**Severity:** Critical · **OWASP:** A01 Broken Access Control

### Problem

`POST /api/users` (public registration) read `role` directly from `req.body` and passed it to `User.create()`. Any unauthenticated client could register with `"role": "Admin"` (or `Staff`) and immediately obtain elevated privileges across the API.

### Fix

`role` is no longer destructured from the request body in `registerUser`. The controller sets it as a server-side literal:

```js
// src/controllers/authController.js
const { name, email, password, nic, phone, address, dependents } = req.body; // no `role`
...
role: "Public", // Forced server-side; ignores any role sent by the client
```

Any `role` value supplied by the client is silently ignored. Role promotion must now happen through a privileged, authenticated path.

### Files changed

- `src/controllers/authController.js`
- `tests/auth.test.js` — regression test asserting a request with `role: "Admin"` is stored as `Public`

### Verification

- Registering with `{"role":"Admin"}` creates a user whose stored role is `Public`.
- `tests/auth.test.js` passes.

---

## Vulnerability #2 — No rate limiting on authentication endpoints

**Issue:** #3 · **PR:** #7 · **Branch:** `fix/rate-limiting` · **Commits:** `a1d4068`, `031ffcd`
**Severity:** High · **OWASP:** A07 Identification & Authentication Failures

### Problem

`POST /api/users/login` accepted unlimited rapid attempts: 300 consecutive failed logins via ZAP fuzzer all returned `401` with no throttling; 100 sequential attempts completed in ~16.7 s. This enabled online password brute-forcing. `POST /api/users` (registration) was likewise unprotected against mass account creation. Source review confirmed no rate-limiting middleware existed anywhere in the codebase.

### Fix

**Commit `a1d4068` — route-level rate limiters**

Added `express-rate-limit@^8.7.0` and a new middleware module with two per-IP limiters, applied **only** to the two auth routes (no global `app.use()`; no controller changes):

| Route | Limit | Window |
|---|---|---|
| `POST /api/users/login` | 5 requests / IP | 15 minutes |
| `POST /api/users` (register) | 20 requests / IP | 1 hour |

When exceeded, the limiter short-circuits with `429 Too Many Requests` and the app's standard error body:

```json
{ "success": false, "message": "Too many login attempts from this IP. Please try again after 15 minutes." }
```

`standardHeaders` is enabled so `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset` and `RateLimit-Policy` are sent on every response from those routes; legacy `X-RateLimit-*` headers are disabled.

```js
// src/routes/authRoutes.js
router.post('/', registerLimiter, registerUser);
router.post('/login', loginLimiter, authUser);
```

**Commit `031ffcd` — trust proxy**

The app runs behind Render's reverse proxy. Without `trust proxy`, `req.ip` resolves to the proxy's address, so every user would share a single rate-limit bucket (5 failed logins by anyone would lock out everyone) and `express-rate-limit` logs `ERR_ERL_UNEXPECTED_X_FORWARDED_FOR`. Added:

```js
// src/server.js
app.set("trust proxy", 1);
```

Value `1` trusts only the last `X-Forwarded-For` hop (the one Render appends), so clients cannot spoof their address by sending their own header. Local development without a proxy is unaffected.

### Files changed

- `package.json`, `package-lock.json` — add `express-rate-limit`
- `src/middleware/rateLimitMiddleware.js` — new; exports `loginLimiter`, `registerLimiter`
- `src/routes/authRoutes.js` — wire limiters onto the two routes
- `src/server.js` — `app.set("trust proxy", 1)`

### Verification (against the running server on `localhost:5001`)

Login brute-force loop (8 failed attempts):

```
attempt 1: 401  remaining=4
attempt 2: 401  remaining=3
attempt 3: 401  remaining=2
attempt 4: 401  remaining=1
attempt 5: 401  remaining=0
attempt 6: 429  remaining=0
attempt 7: 429  remaining=0
attempt 8: 429  remaining=0
```

429 response headers observed: `RateLimit-Policy: 5;w=900`, `RateLimit-Limit: 5`, `RateLimit-Remaining: 0`, `RateLimit-Reset: 851`, `Retry-After: 851`, plus body `{"success":false,"message":"Too many login attempts from this IP. Please try again after 15 minutes."}`.

Scope check: `GET /api/users/profile` returns no `RateLimit-*` headers — other routes are unaffected.

Trust-proxy check (simulated clients via `X-Forwarded-For`):

```
A (10.0.0.1) #1–#5: 401    A #6: 429
B (10.0.0.2) #1:    401    (separate bucket, unaffected by A's lockout)
```

Registration: requests 1–20 pass through to the controller; 21+ return `429`.

Existing test suite: `tests/auth.test.js` passes. (8 pre-existing failures in `appointment`, `record` and `sideEffect` tests fail identically on clean `dev` and are unrelated to this change.)

### Operational notes

- The limiter uses an in-memory store; counters reset on server restart. To re-test without waiting for the window, restart the server or use a different source IP (`127.0.0.1` vs `::1`). `RateLimit-Reset` reports seconds until the window reopens.
- On a multi-instance deployment, the in-memory store is per-process; a shared store (e.g. `rate-limit-redis`) would be needed for a consistent global limit.

---

