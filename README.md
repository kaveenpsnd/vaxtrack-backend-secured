# VaxTrack Backend

A RESTful API backend for **VaxTrack** — a national vaccination tracking and management system built for Sri Lanka. It handles vaccine supply chain management, clinic scheduling, appointment booking, patient records, and family (dependent) management.

## 🔗 Live URLs

| Service                         | URL                                            |
| ------------------------------- | ---------------------------------------------- |
| **Frontend App**                | https://vaxtrackweb.netlify.app                |
| **Backend API**                 | https://vaxtrack-backend.onrender.com          |
| **API Documentation (Swagger)** | https://vaxtrack-backend.onrender.com/api-docs |

---

## Tech Stack

| Layer        | Technology                    |
| ------------ | ----------------------------- |
| Runtime      | Node.js 20+                   |
| Framework    | Express 5                     |
| Database     | MongoDB (Mongoose 9 ODM)      |
| Auth         | JWT (jsonwebtoken + bcryptjs) |
| File Uploads | Multer + Cloudinary           |
| Geocoding    | LocationIQ                    |
| Email        | Nodemailer (SMTP)             |
| API Docs     | Swagger UI (OpenAPI 3)        |
| Testing      | Jest 30 + Supertest           |
| Perf Testing | Artillery 2                   |
| CI           | GitHub Actions                |

## Project Structure

```
src/
├── server.js              # App entry point
├── config/
│   ├── db.js              # MongoDB connection
│   └── cloudinary.js      # Cloudinary config
├── controllers/           # Route handlers / business logic
├── middleware/
│   ├── authMiddleware.js   # JWT verification & role guards
│   └── uploadMiddleware.js # Multer file upload
├── models/                # Mongoose schemas
├── routes/                # Express route definitions
├── services/              # External service integrations
│   ├── cloudinaryService.js
│   ├── emailService.js
│   └── geocodingService.js
├── helpers/
└── validators/
tests/                     # Jest test suites
```

## Getting Started

### Prerequisites

- **Node.js** >= 20
- **MongoDB** (Atlas or local instance)
- API keys for **Cloudinary**, **LocationIQ**, and an SMTP provider

### Installation

```bash
git clone <repository-url>
cd vaxtrack-backend
npm install
```

### Environment Variables

Copy the example env file and fill in your values:

```bash
cp .env.example .env
```

| Variable             | Description                                          |
| -------------------- | ---------------------------------------------------- |
| `PORT`               | Server port (default: `5000`)                        |
| `NODE_ENV`           | `development` or `production`                        |
| `MONGODB_URL`        | MongoDB connection string                            |
| `JWT_SECRET`         | Secret key for signing JWTs                          |
| `CORS_ORIGINS`       | Allowed browser origins (CSV)                        |
| `CLOUDINARY_URL`     | Cloudinary credentials URL                           |
| `LOCATIONIQ_API_KEY` | LocationIQ geocoding API key                         |
| `EMAIL_HOST`         | SMTP host (e.g. `smtp.gmail.com`)                    |
| `EMAIL_PORT`         | SMTP port (e.g. `587`)                               |
| `EMAIL_USER`         | SMTP username                                        |
| `EMAIL_PASS`         | SMTP password / app key                              |
| `EMAIL_FROM`         | Default sender address                               |
| `WSO2_BASE`          | WSO2 Identity Server root URL (single sign-on)       |
| `WSO2_CLIENT_ID`     | Client ID of the VaxTrack app in WSO2                |
| `WSO2_CLIENT_SECRET` | Client secret of the VaxTrack app in WSO2            |
| `WSO2_REDIRECT_URI`  | Callback URL registered in WSO2                      |
| `FRONTEND_URL`       | Frontend origin the browser returns to after sign-in |
| `COOKIE_SECRET`      | Secret for signing the short-lived SSO login cookie  |

#### Allowed Browser Origins (`CORS_ORIGINS`)

Only the origins listed here may call the API from a browser. Give a comma-separated list with no trailing slash:

```bash
CORS_ORIGINS=https://vaxtrackweb.netlify.app,http://localhost:5173
```

If the variable is unset, the deployed frontend (`https://vaxtrackweb.netlify.app`) and the local Vite dev server (`http://localhost:5173`) are allowed. A request from any other origin gets no `Access-Control-Allow-Origin` header, so the browser blocks the response. Deploying the frontend to a new URL means adding that URL here, otherwise its requests fail in the browser.

Note that CORS is enforced by browsers only. It does not restrict curl, Postman or server-to-server calls, and it is not a substitute for authentication, authorization or rate limiting.

#### Single Sign-On (WSO2 Identity Server)

Users can also sign in through WSO2 Identity Server, using OpenID Connect (Authorization Code flow with PKCE). The backend is the OAuth client: it keeps the client secret, talks to WSO2 server-to-server, and then issues the normal VaxTrack session cookie. The browser never sees the client secret or WSO2's tokens.

To set it up:

1. In the WSO2 Console, register VaxTrack as a **Traditional Web Application** using OpenID Connect (a confidential client with a client secret).
2. Allow the **Authorization Code** grant only, since it is the only one VaxTrack uses. Set the callback URL to the backend's `/api/auth/wso2/callback`, and make PKCE mandatory (S256).
3. Allow the `openid`, `profile` and `email` scopes, and make sure the user's `email` is released in the ID token or userinfo.
4. Put the app's values in `.env` (never commit the secrets):

```bash
WSO2_BASE=https://your-wso2-host      # server root, no trailing path
WSO2_CLIENT_ID=...
WSO2_CLIENT_SECRET=...
WSO2_REDIRECT_URI=http://localhost:5001/api/auth/wso2/callback   # must match WSO2 exactly
FRONTEND_URL=http://localhost:5173    # also added to the CORS allowlist
COOKIE_SECRET=...                     # long random string, e.g. openssl rand -hex 32
```

The flow and its endpoints are described under [Sign in with WSO2](#sign-in-with-wso2-single-sign-on).

### Running the Server

```bash
# Development (with hot reload)
npm run dev

# Production
npm start
```

The server starts at `http://localhost:5000`. A health check is available at the root (`GET /`).

### API Documentation

Interactive Swagger UI is served at:

```
http://localhost:5000/api-docs
```

## API Endpoint Documentation

All routes are prefixed with `/api`. Protected routes require a `Bearer` JWT token:

```
Authorization: Bearer <jwt_token>
```

Tokens are signed with `JWT_SECRET` and expire after **30 days**.

### Role Levels

| Role            | Description                                                                     |
| --------------- | ------------------------------------------------------------------------------- |
| `Public`        | Default user (patient) — manages own profile, dependents, appointments, records |
| `HospitalStaff` | Manages clinics, creates vaccination records, views inventory                   |
| `Admin`         | Full system access — hospitals, vaccines, batches, all records, all users       |

### HTTP Status Codes

| Code | Meaning                                        |
| ---- | ---------------------------------------------- |
| 200  | OK                                             |
| 201  | Created                                        |
| 400  | Bad request / validation error                 |
| 401  | Missing or invalid JWT                         |
| 403  | Authenticated but insufficient role            |
| 404  | Resource not found                             |
| 409  | Conflict (duplicate booking, schedule overlap) |
| 500  | Internal server error                          |

---

### Authentication & User Management

#### Register

```
POST /api/users
```

**Access:** Public

**Request body:**

```json
{
  "name": "Kavya Perera",
  "email": "kavya@example.com",
  "password": "Pass@1234",
  "nic": "199012345678",
  "phone": "0771234567",
  "address": "123 Main Street, Colombo 03"
}
```

**Response `201`:**

```json
{
  "_id": "64abc123def456",
  "name": "Kavya Perera",
  "email": "kavya@example.com",
  "role": "Public",
  "profilePicture": null,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Errors:** `400 User already exists` | `400 Invalid user data`

---

#### Login

```
POST /api/users/login
```

**Access:** Public

**Request body:**

```json
{ "email": "kavya@example.com", "password": "Pass@1234" }
```

**Response `200`:** Same shape as Register response.

**Errors:** `401 Invalid email or password`

---

#### Sign in with WSO2 (single sign-on)

```
GET  /api/auth/wso2/login
GET  /api/auth/wso2/callback
POST /api/auth/wso2/logout
```

**Access:** Public

How a sign-in works:

1. The frontend sends the browser to `GET /api/auth/wso2/login`. The backend creates a random `state`, `nonce` and PKCE verifier, keeps them in a signed httpOnly cookie (`wso2_tx`, valid 5 minutes), and redirects to the WSO2 login page.
2. The user signs in on WSO2, which redirects the browser to `GET /api/auth/wso2/callback?code=...&state=...`.
3. The backend checks `state` against the cookie, then exchanges the code for tokens, sending the client secret and the PKCE verifier. It verifies the ID token: RS256 signature against WSO2's published keys, issuer, audience, expiry and `nonce`.
4. It finds or creates the user (new SSO users are always `Public`), sets the normal `jwt` session cookie, and redirects to `FRONTEND_URL/oauth/callback`.

If any step fails, the browser is redirected to `FRONTEND_URL/login?sso_error=<code>` with no session:

| `sso_error`  | Meaning                                                                                    |
| ------------ | ------------------------------------------------------------------------------------------ |
| `state`      | Login cookie missing, tampered or expired, or `state` does not match (possible CSRF)       |
| `denied`     | The user cancelled, or WSO2 refused the request                                            |
| `token`      | The code could not be exchanged (e.g. it was already used)                                 |
| `verify`     | The ID token failed verification, or userinfo was about a different user                   |
| `nonce`      | The ID token belongs to a different login                                                  |
| `email`      | WSO2 gave no usable email address                                                          |
| `unverified` | The email matches an existing account but WSO2 has not verified it, so they are not linked |
| `account`    | The email matches several accounts, or one already linked to another WSO2 identity         |
| `server`     | Unexpected server error                                                                    |

`POST /api/auth/wso2/logout` clears the session cookie and returns `{ "success": true, "logoutUrl": "..." }`. The frontend then sends the browser to `logoutUrl` to end the WSO2 session too.

---

#### Get Own Profile

```
GET /api/users/profile
```

**Access:** Patient / Staff / Admin

**Response `200`:**

```json
{
  "_id": "64abc123def456",
  "name": "Kavya Perera",
  "email": "kavya@example.com",
  "role": "Public",
  "nic": "199012345678",
  "phone": "0771234567",
  "address": "123 Main Street, Colombo 03",
  "profilePicture": "https://res.cloudinary.com/..."
}
```

---

#### Update Own Profile

```
PUT /api/users/profile
```

**Access:** Patient / Staff / Admin — `multipart/form-data` when uploading a photo

| Field            | Type        | Required |
| ---------------- | ----------- | -------- |
| `name`           | string      | No       |
| `phone`          | string      | No       |
| `address`        | string      | No       |
| `password`       | string      | No       |
| `profilePicture` | file(image) | No       |

**Response `200`:** Updated user object.

---

#### Search Patients

```
GET /api/users/search?q=<query>
```

**Access:** Staff / Admin — `q` can be name fragment, NIC, or MongoDB ObjectId

**Response `200`:**

```json
{
  "success": true,
  "count": 1,
  "data": [{ "_id": "...", "name": "Kavya Perera", "nic": "199012345678" }]
}
```

---

### Vaccines

#### Add a Vaccine

```
POST /api/vaccines
```

**Access:** Admin — `multipart/form-data`

| Field              | Type        | Required |
| ------------------ | ----------- | -------- |
| `name`             | string      | Yes      |
| `manufacturer`     | string      | Yes      |
| `dosesRequired`    | number      | Yes      |
| `daysBetweenDoses` | number      | No       |
| `description`      | string      | No       |
| `image`            | file(image) | No       |

**Response `201`:**

```json
{
  "success": true,
  "data": {
    "_id": "64v001",
    "name": "Pfizer-BioNTech COVID-19",
    "manufacturer": "Pfizer",
    "dosesRequired": 2,
    "daysBetweenDoses": 21,
    "image": "https://res.cloudinary.com/..."
  }
}
```

---

#### List All Vaccines

```
GET /api/vaccines
```

**Access:** Public

**Response `200`:** `{ "success": true, "count": 3, "data": [...] }`

---

#### Get Vaccine by ID

```
GET /api/vaccines/:id
```

**Access:** Public — **Error:** `404 Vaccine not found`

---

#### Delete Vaccine

```
DELETE /api/vaccines/:id
```

**Access:** Admin

---

### Batches (Stock)

#### Add a Batch

```
POST /api/batches
```

**Access:** Staff / Admin

**Request body:**

```json
{
  "vaccineId": "64v001",
  "batchNumber": "BN-2026-001",
  "quantity": 500,
  "expiryDate": "2027-12-31",
  "hospitalId": "64h001"
}
```

**Response `201`:**

```json
{
  "success": true,
  "data": {
    "_id": "64b001",
    "batchNumber": "BN-2026-001",
    "quantity": 500,
    "remaining": 500,
    "expiryDate": "2027-12-31T00:00:00.000Z"
  }
}
```

---

#### List Batches

```
GET /api/batches
```

**Access:** Staff / Admin — **Response `200`:** `{ "success": true, "count": 10, "data": [...] }`

---

### Hospitals

#### Register a Hospital

```
POST /api/hospitals
```

**Access:** Admin

**Request body:**

```json
{
  "name": "Colombo National Hospital",
  "address": "Regent Street, Colombo 08",
  "city": "Colombo",
  "district": "Colombo",
  "phone": "0112691111"
}
```

> The `address` is automatically geocoded via LocationIQ — `latitude` and `longitude` are stored automatically.

**Response `201`:**

```json
{
  "success": true,
  "data": {
    "_id": "64h001",
    "name": "Colombo National Hospital",
    "city": "Colombo",
    "latitude": 6.9271,
    "longitude": 79.8612
  }
}
```

---

#### List Hospitals

```
GET /api/hospitals
```

**Access:** Public — **Response `200`:** `{ "success": true, "count": 5, "data": [...] }`

---

### Clinics

#### Create a Clinic Session

```
POST /api/clinics
```

**Access:** Staff / Admin

**Request body:**

```json
{
  "hospital": "64h001",
  "date": "2026-05-01",
  "startTime": "09:00",
  "endTime": "17:00",
  "vaccineType": "Pfizer-BioNTech COVID-19",
  "capacity": 100
}
```

Time strings must be `HH:mm` 24-hour. `endTime` must be after `startTime`. `date` cannot be in the past.

**Response `201`:**

```json
{
  "success": true,
  "message": "Clinic session created successfully",
  "data": {
    "_id": "64c001",
    "hospital": {
      "_id": "64h001",
      "name": "Colombo National Hospital",
      "city": "Colombo"
    },
    "date": "2026-05-01T00:00:00.000Z",
    "startTime": "09:00",
    "endTime": "17:00",
    "vaccineType": "Pfizer-BioNTech COVID-19",
    "capacity": 100,
    "bookedCount": 0
  }
}
```

**Errors:** `400 Missing fields` | `400 Invalid time format` | `404 Hospital not found` | `409 Schedule conflict`

---

#### List / Search Clinics

```
GET /api/clinics
GET /api/clinics?city=Colombo
GET /api/clinics?vaccineType=Pfizer
GET /api/clinics?city=Kandy&vaccineType=Moderna
```

**Access:** Public

| Query param   | Description                                             |
| ------------- | ------------------------------------------------------- |
| `city`        | Filter by hospital city (case-insensitive)              |
| `vaccineType` | Filter by vaccine type (case-insensitive partial match) |

**Response `200`:** `{ "success": true, "count": 2, "data": [...] }`

---

#### Update Clinic

```
PUT /api/clinics/:id
```

**Access:** Staff / Admin — send any subset of fields to update.

---

#### Delete Clinic

```
DELETE /api/clinics/:id
```

**Access:** Admin

---

### Appointments

#### Book an Appointment

```
POST /api/appointments
```

**Access:** Patient

**Request body:**

```json
{ "clinicId": "64c001", "dependentId": null }
```

> Set `dependentId` to a dependent's `_id` to book for a family member; omit/`null` to book for yourself.

**Response `201`:**

```json
{
  "success": true,
  "message": "Appointment booked successfully",
  "data": {
    "_id": "64a001",
    "clinicId": {
      "date": "2026-05-01",
      "startTime": "09:00",
      "vaccineType": "Pfizer-BioNTech COVID-19"
    },
    "userId": "64abc123def456",
    "dependentId": null,
    "queueNumber": 1,
    "status": "Scheduled",
    "qrCodeUrl": "https://api.qrserver.com/v1/create-qr-code/?data=..."
  }
}
```

**Errors:** `400 clinicId required` | `404 Clinic not found` | `409 Fully booked` | `409 Already has active booking`

---

#### Get My Appointments

```
GET /api/appointments/my
```

**Access:** Patient — **Response `200`:** `{ "success": true, "count": 2, "data": [...] }`

---

#### Cancel / Update Appointment

```
PUT /api/appointments/:id
```

**Access:** Patient

**Request body:** `{ "status": "Cancelled" }`

**Response `200`:** Updated appointment. Clinic `bookedCount` is decremented automatically.

---

#### Get Clinic Attendee List

```
GET /api/appointments/clinic/:id
```

**Access:** Staff / Admin

**Response `200`:**

```json
{
  "success": true,
  "count": 20,
  "data": [
    {
      "_id": "64a001",
      "userId": { "name": "Kavya Perera" },
      "queueNumber": 1,
      "status": "Scheduled",
      "qrCodeUrl": "..."
    }
  ]
}
```

---

### Vaccination Records

#### Create a Record (Mark as Vaccinated)

```
POST /api/records
```

**Access:** Staff / Admin

**Request body:**

```json
{
  "patientId": "64abc123def456",
  "vaccineId": "64v001",
  "batchId": "64b001",
  "hospitalId": "64h001",
  "dependentName": null
}
```

> `dependentName`: string for a family member's name, or `null` for the patient themselves.

**Response `201`:**

```json
{
  "success": true,
  "message": "Vaccination record created successfully",
  "data": {
    "_id": "64r001",
    "patientId": "64abc123def456",
    "vaccineId": "64v001",
    "batchId": "64b001",
    "hospitalId": "64h001",
    "dependentName": null,
    "administeredBy": "64staff001",
    "dateAdministered": "2026-04-12T10:30:00.000Z"
  }
}
```

**Errors:** `404 Patient not found`

---

#### Get My Records

```
GET /api/records/my
```

**Access:** Patient

**Response `200`:**

```json
{
  "success": true,
  "count": 3,
  "data": [
    {
      "_id": "64r001",
      "vaccineId": { "name": "Pfizer-BioNTech COVID-19", "dosesRequired": 2 },
      "hospitalId": { "name": "Colombo National Hospital", "city": "Colombo" },
      "administeredBy": { "name": "Dr. Staff" },
      "dateAdministered": "2026-04-12T10:30:00.000Z",
      "dependentName": null
    }
  ]
}
```

---

#### Get Full Vaccination History (Self + Dependents)

```
GET /api/records/history
```

**Access:** Patient — same shape as above, includes records where `dependentName` is set.

---

#### Get Due / Upcoming Doses

```
GET /api/records/due
```

**Access:** Patient

**Response `200`:**

```json
{
  "success": true,
  "data": [
    {
      "vaccineName": "Pfizer-BioNTech COVID-19",
      "dosesReceived": 1,
      "dosesRequired": 2,
      "nextDoseDue": "2026-05-03"
    }
  ]
}
```

---

### Side Effects

#### Report a Side Effect

```
POST /api/side-effects
```

**Access:** Patient

**Request body:**

```json
{
  "recordId": "64r001",
  "symptoms": ["fever", "headache", "fatigue"],
  "severity": "Moderate"
}
```

> `severity` options: `"Mild"` | `"Moderate"` | `"Severe"` (default `"Mild"`).

**Response `201`:**

```json
{
  "success": true,
  "message": "Side effect reported successfully",
  "data": {
    "_id": "64se001",
    "recordId": {
      "vaccineId": "64v001",
      "dateAdministered": "2026-04-12T10:30:00.000Z"
    },
    "userId": "64abc123def456",
    "symptoms": ["fever", "headache", "fatigue"],
    "severity": "Moderate"
  }
}
```

**Errors:** `400 recordId and at least one symptom required` | `404 Record not found` | `403 Not your record`

---

#### List Side Effects

```
GET /api/side-effects
```

**Access:** Patient (own) / Staff / Admin (all)

---

### Inventory

#### Get Vaccine Inventory

```
GET /api/inventory
```

**Access:** Staff / Admin

**Response `200`:**

```json
{
  "success": true,
  "data": [
    {
      "vaccineName": "Pfizer-BioNTech COVID-19",
      "totalRemaining": 450,
      "batches": [
        {
          "batchNumber": "BN-2026-001",
          "remaining": 450,
          "expiryDate": "2027-12-31"
        }
      ]
    }
  ]
}
```

---

#### Get Low-Stock Alerts

```
GET /api/inventory/low-stock
```

**Access:** Public — **Response `200`:** `{ "success": true, "data": [{ "vaccineName": "AstraZeneca", "totalRemaining": 10 }] }`

---

### Dependents (Family Management)

#### Add a Dependent

```
POST /api/users/dependents
```

**Access:** Patient

**Request body:**

```json
{
  "name": "Asha Perera",
  "relationship": "Child",
  "nic": "20151234567V",
  "dateOfBirth": "2015-06-15"
}
```

**Response `201`:** Updated user object with `dependents` array populated.

---

#### List My Dependents

```
GET /api/users/dependents
```

**Access:** Patient — **Response `200`:** `{ "success": true, "data": [{ "_id": "64d001", "name": "Asha Perera", "relationship": "Child" }] }`

---

#### Update a Dependent

```
PUT /api/users/dependents/:id
```

**Access:** Patient — send any subset of fields.

---

#### Delete a Dependent

```
DELETE /api/users/dependents/:id
```

**Access:** Patient

---

### Notifications

```
GET /api/notifications
```

**Access:** Patient / Staff / Admin — returns unread notification messages for the logged-in user.

---

### Geocoding

```
GET /api/geocode?address=<address>
```

**Access:** Staff / Admin

**Response `200`:**

```json
{
  "success": true,
  "data": {
    "latitude": 6.9271,
    "longitude": 79.8612,
    "displayName": "Colombo National Hospital, Sri Lanka"
  }
}
```

## Testing

### Testing Environment Configuration

Create a dedicated test environment file before running any tests:

```bash
cp .env.example .env.test
```

Edit `.env.test`:

```env
NODE_ENV=test
PORT=5001
MONGODB_URL=mongodb://localhost:27017/vaxtrack_test
JWT_SECRET=test-secret-key-do-not-use-in-production
CLOUDINARY_URL=cloudinary://test:test@test
LOCATIONIQ_API_KEY=test-key
EMAIL_HOST=smtp.ethereal.email
EMAIL_PORT=587
EMAIL_USER=test@ethereal.email
EMAIL_PASS=testpassword
EMAIL_FROM=test@vaxtrack.lk
```

> Tests use **MongoDB Memory Server** (in-process). No separate MongoDB instance required — `MONGODB_URL` is overridden automatically.

---

### Unit & Integration Tests (Jest)

The test suite uses **Jest** with **Supertest** to spin up the real Express app against an in-memory MongoDB database, covering unit logic and full HTTP integration paths.

```bash
# Run all tests
npm test

# Run a specific file
npx jest tests/auth.test.js

# Verbose output
npm test -- --verbose

# Coverage report
npm test -- --coverage

# Watch mode
npx jest --watch
```

> `--experimental-vm-modules` is pre-configured in `package.json` for ESM support.

**CI:** GitHub Actions runs the full suite on every pull request to `main`.

#### Test File Coverage

| File                        | What it Tests                                                                   |
| --------------------------- | ------------------------------------------------------------------------------- |
| `tests/auth.test.js`        | Registration, login, duplicate email, invalid credentials, token generation     |
| `tests/appointment.test.js` | Booking, double-booking guard, quota enforcement, cancellation, queue numbering |
| `tests/clinic.test.js`      | Clinic CRUD, time format validation, overlap detection, capacity management     |
| `tests/hospital.test.js`    | Hospital CRUD, geocoding integration                                            |
| `tests/dependent.test.js`   | Dependent add / update / delete, ownership checks                               |
| `tests/record.test.js`      | Record creation, vaccination history, due doses                                 |
| `tests/sideEffect.test.js`  | Side effect reporting, severity filtering, ownership validation                 |
| `tests/vaccine.test.js`     | Vaccine CRUD, image upload                                                      |
| `tests/batch.test.js`       | Batch creation, expiry tracking, inventory decrement                            |
| `tests/inventory.test.js`   | Inventory aggregation, low-stock threshold alerts                               |
| `tests/geocoding.test.js`   | LocationIQ geocoding service (mocked + live calls)                              |

---

### Integration Testing Setup and Execution

1. **MongoDB Memory Server** — each test file gets an isolated in-memory database seeded in `beforeAll` and wiped in `afterAll`.
2. **Supertest** — drives the Express app over real HTTP through all middleware (auth, validation, error handling).
3. **JWT test tokens** — generated with `JWT_SECRET` from `.env.test`, passed as `Authorization: Bearer <token>` headers.

**Typical integration flow (auth):**

```
POST /api/users               → 201 + token
POST /api/users (duplicate)   → 400 User already exists
POST /api/users/login         → 200 + token
POST /api/users/login (wrong) → 401 Invalid email or password
GET  /api/users/profile       → 401 (no token)
GET  /api/users/profile       → 200 (valid token)
```

---

### Performance Testing (Artillery)

[Artillery](https://www.artillery.io/) is listed as a dev dependency — no global install required.

#### Seed Test Accounts

Before running, ensure the following accounts exist in the target database (defined in `artillery.yml`):

```yaml
variables:
  testEmail: "testuser@vaxtrack.lk"
  testPassword: "Test@1234"
  staffEmail: "staff@vaxtrack.lk"
  staffPassword: "Staff@1234"
```

#### Test Phases

| Phase       | Rate     | Duration | Purpose                      |
| ----------- | -------- | -------- | ---------------------------- |
| Warm-up     | 5 req/s  | 30 s     | Establish stable connections |
| Load test   | 20 req/s | 60 s     | Normal expected traffic      |
| Stress test | 50 req/s | 30 s     | Find performance limits      |

#### Scenarios Covered

| Scenario         | Weight | Description                                           |
| ---------------- | ------ | ----------------------------------------------------- |
| Public read-only | 20 %   | Health check, hospitals, clinics, vaccines, inventory |
| Auth flow        | 10 %   | Login (valid + invalid), profile fetch                |
| Patient routes   | 30 %   | Appointments, dependents, records, side effects       |
| Staff routes     | 20 %   | Batches, clinic creation, vaccination records         |
| Clinic search    | 20 %   | Search by city, vaccine type, combined filters        |

#### Running Performance Tests

```bash
# Against the local server — start server first in a separate terminal
npm run dev
# Then:
npm run test:perf

# Against the deployed API
# Windows PowerShell:
$env:PERF_TARGET="https://vaxtrack-backend.onrender.com"; npm run test:perf:cloud

# macOS / Linux:
PERF_TARGET=https://vaxtrack-backend.onrender.com npm run test:perf:cloud
```

Artillery prints: request rate, response time percentiles (p50, p95, p99), HTTP status distribution, and error counts.

### Single Sign-On Tests (WSO2)

`tests/wso2Auth.test.js` tests the sign-in against the **real** WSO2 Identity Server. Only the user database is replaced, by an in-memory list. It reads the `WSO2_*` settings from `.env` and needs network access; without those settings it is skipped (e.g. in CI).

It checks that:

- the issuer and endpoints the backend uses match WSO2's published discovery document
- `/login` sends the browser to WSO2 with `state`, `nonce` and an S256 PKCE challenge, and the client secret is never in the browser URL
- WSO2 accepts the request and shows its login page, and refuses to send the code to a callback URL that is not registered
- the callback rejects a forged `state` (CSRF), and a code WSO2 did not issue is refused by WSO2's token endpoint, with no session in either case
- `/logout` clears the session, and WSO2 accepts the logout URL

```bash
npm test -- tests/wso2Auth.test.js
```

### Dependency Security (npm audit)

Known advisories in dependencies are checked with `npm audit`, which uses the GitHub Advisory Database:

```bash
# What ships with the API — this must stay clean
npm audit --omit=dev

# Everything, including dev tooling (Jest, Artillery, nodemon)
npm audit
```

The **Dependency Audit** GitHub Actions workflow (`.github/workflows/dependency-audit.yml`) runs on every pull request into `dev` or `main`, and weekly. It fails if a production dependency has a high or critical advisory. The full-tree report is informational only.

When updating dependencies:

- Prefer `npm audit fix` (stays within semver ranges). Treat `npm audit fix --force` as a manual, reviewed upgrade, because it can apply breaking major versions or, as happened with Artillery, suggest a downgrade.
- After a fix, raise the version floor in `package.json` so a regenerated lockfile can't fall back to a vulnerable release.
- Run `npm test`. `tests/emailService.test.js` exercises the real `nodemailer` over SMTP, so mail regressions show up there.

**Accepted finding:** `csv-parse` 4.16.3 (moderate, [GHSA-8cw4-87c7-c6xx](https://github.com/advisories/GHSA-8cw4-87c7-c6xx), fixed in 7.0.2). It is a dev-only dependency of Artillery, which requires the v4 API, so it cannot be upgraded without breaking Artillery's CSV payload support. The flaw needs attacker-controlled CSV parsed with the `columns` and duplicate-column grouping options. Artillery only parses `config.payload` files from the tester's own disk, doesn't set those options by default, and `artillery.yml` defines no payloads. Revisit when Artillery moves to `csv-parse` 7.

---

## Deployment

### Platform: Render

The backend is deployed on [Render](https://render.com) as a Web Service.

#### Setup Steps

1. Push the `main` branch to GitHub
2. Go to [render.com](https://render.com) → **New Web Service**
3. Connect the `vaxtrack-backend` GitHub repository, select `main` branch
4. Configure:
   ```
   Build Command : npm install
   Start Command : node src/server.js
   ```
5. Add all environment variables (see table below)
6. Click **Deploy**

#### Environment Variables (Render Dashboard)

| Variable             | Description                            |
| -------------------- | -------------------------------------- |
| `PORT`               | `10000` (Render assigns automatically) |
| `NODE_ENV`           | `production`                           |
| `MONGODB_URL`        | MongoDB Atlas connection string        |
| `JWT_SECRET`         | Strong random secret for signing JWTs  |
| `CLOUDINARY_URL`     | Cloudinary credentials URL             |
| `LOCATIONIQ_API_KEY` | LocationIQ geocoding API key           |
| `EMAIL_HOST`         | SMTP host (e.g. `smtp.gmail.com`)      |
| `EMAIL_PORT`         | SMTP port (e.g. `587`)                 |
| `EMAIL_USER`         | SMTP username                          |
| `EMAIL_PASS`         | SMTP password / app key                |
| `EMAIL_FROM`         | Default sender address                 |

> **Note:** Never commit real secrets. The `.env.example` file documents all variables without exposing values.

### Deployment Report

| Item                  | Details                                               |
| --------------------- | ----------------------------------------------------- |
| **Platform**          | Render (Web Service)                                  |
| **Region**            | Oregon, USA (US West)                                 |
| **Plan**              | Free tier                                             |
| **Build time**        | ~45 seconds                                           |
| **Deploy trigger**    | Auto-deploy on push to `main`                         |
| **Health check URL**  | `GET /` → `200 OK`                                    |
| **Backend API URL**   | https://vaxtrack-backend.onrender.com                 |
| **Swagger UI URL**    | https://vaxtrack-backend.onrender.com/api-docs        |
| **Frontend URL**      | https://vaxtrackweb.netlify.app                       |
| **Frontend Platform** | Netlify                                               |
| **CI/CD**             | GitHub Actions → Render (backend), Netlify (frontend) |
| **Database**          | MongoDB Atlas (M0 Free tier, shared cluster)          |
| **File Storage**      | Cloudinary (Free tier)                                |
| **Geocoding**         | LocationIQ Free tier                                  |
| **Email**             | Nodemailer via Gmail SMTP + App Password              |

> **Render Free Tier Note:** The service spins down after 15 minutes of inactivity. The first request after a cold start may take 30–60 seconds.

---

## License

[ISC](LICENSE)
