import { jest } from '@jest/globals';

// ── Mock Modules ──

const mockClinicCreate = jest.fn();
const mockClinicFind = jest.fn();
const mockClinicFindById = jest.fn();
const mockClinicCheckOverlap = jest.fn();

jest.unstable_mockModule('../src/models/Clinic.js', () => ({
    default: {
        create: mockClinicCreate,
        find: (...args) => ({
            populate: jest.fn().mockReturnValue({
                sort: jest.fn().mockReturnValue(mockClinicFind(...args)),
            }),
        }),
        findById: (...args) => {
            const result = mockClinicFindById(...args);
            return {
                populate: jest.fn().mockReturnValue(result),
                then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
            };
        },
        checkOverlap: mockClinicCheckOverlap,
    },
}));

const mockHospitalFindById = jest.fn();
jest.unstable_mockModule('../src/models/Hospital.js', () => ({
    default: {
        findById: mockHospitalFindById,
    },
}));

// Import AFTER mocking
const {
    createClinic,
    getAllClinics,
    getClinicsByHospital,
    getClinicById,
    updateClinic,
    updateClinicCapacity,
    deleteClinic,
} = await import('../src/controllers/clinicController.js');

// ── Helpers ──
const mockRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
};

const VALID_HOSPITAL_ID = '507f1f77bcf86cd799439011';

// ────────────────────────────────────────────────────────
// ██  CLINIC CONTROLLER TESTS
// ────────────────────────────────────────────────────────

describe('Clinic Controller', () => {
    afterEach(() => jest.clearAllMocks());

    // ===================================================
    // POST /api/clinics — createClinic
    // ===================================================
    describe('createClinic', () => {
        const validBody = {
            hospital: VALID_HOSPITAL_ID,
            date: '2028-03-20',
            startTime: '09:00',
            endTime: '12:00',
            capacity: 50,
            vaccineType: 'COVID-19',
        };

        test('should create clinic session successfully', async () => {
            mockHospitalFindById.mockResolvedValue({ _id: VALID_HOSPITAL_ID, name: 'Test Hospital' });
            mockClinicCheckOverlap.mockResolvedValue(null); // No overlap
            const mockClinic = {
                _id: 'clinic1',
                ...validBody,
                populate: jest.fn().mockResolvedValue(true),
            };
            mockClinicCreate.mockResolvedValue(mockClinic);

            const req = { body: validBody };
            const res = mockRes();

            await createClinic(req, res);

            expect(res.status).toHaveBeenCalledWith(201);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    message: 'Clinic session created successfully',
                })
            );
        });

        test('should return 404 when hospital does not exist', async () => {
            mockHospitalFindById.mockResolvedValue(null);

            const req = { body: validBody };
            const res = mockRes();

            await createClinic(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: expect.stringContaining('Hospital not found'),
                })
            );
        });

        test('should return 400 when capacity is less than 1', async () => {
            mockHospitalFindById.mockResolvedValue({ _id: VALID_HOSPITAL_ID });

            const req = { body: { ...validBody, capacity: 0 } };
            const res = mockRes();

            await createClinic(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining('Capacity must be a positive integer'),
                })
            );
        });

        test('should return 409 when time slot overlaps with existing clinic', async () => {
            mockHospitalFindById.mockResolvedValue({ _id: VALID_HOSPITAL_ID });
            mockClinicCheckOverlap.mockResolvedValue({
                _id: 'existing-clinic',
                startTime: '08:00',
                endTime: '11:00',
            });

            const req = { body: validBody };
            const res = mockRes();

            await createClinic(req, res);

            expect(res.status).toHaveBeenCalledWith(409);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: expect.stringContaining('Schedule conflict'),
                })
            );
        });

        test('should return 400 for validation errors', async () => {
            mockHospitalFindById.mockResolvedValue({ _id: VALID_HOSPITAL_ID });
            mockClinicCheckOverlap.mockResolvedValue(null);

            const error = new Error('Validation failed');
            error.name = 'ValidationError';
            error.errors = {
                startTime: { message: 'Start time is required' },
            };
            mockClinicCreate.mockRejectedValue(error);

            const req = { body: { ...validBody, capacity: 10 } };
            const res = mockRes();

            await createClinic(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ message: 'Validation failed' })
            );
        });

        test('should return 400 when capacity is missing/null', async () => {
            mockHospitalFindById.mockResolvedValue({ _id: VALID_HOSPITAL_ID });

            const req = { body: { ...validBody, capacity: null } };
            const res = mockRes();

            await createClinic(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining('Missing required fields'),
                })
            );
        });

        test('should return 400 for invalid time format (controller-level)', async () => {
            const req = { body: { ...validBody, startTime: 'invalid' } };
            const res = mockRes();

            await createClinic(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining('startTime must be in HH:mm'),
                })
            );
        });

        test('should return 409 for duplicate clinic (same hospital+date+time)', async () => {
            mockHospitalFindById.mockResolvedValue({ _id: VALID_HOSPITAL_ID });
            mockClinicCheckOverlap.mockResolvedValue(null);

            const error = new Error('Duplicate key');
            error.code = 11000;
            mockClinicCreate.mockRejectedValue(error);

            const req = { body: validBody };
            const res = mockRes();

            await createClinic(req, res);

            expect(res.status).toHaveBeenCalledWith(409);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining('already exists'),
                })
            );
        });

        test('should return 500 for unexpected server error on create', async () => {
            mockHospitalFindById.mockResolvedValue({ _id: VALID_HOSPITAL_ID });
            mockClinicCheckOverlap.mockResolvedValue(null);
            mockClinicCreate.mockRejectedValue(new Error('DB crashed'));

            const req = { body: validBody };
            const res = mockRes();

            await createClinic(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: 'Server error while creating clinic session',
                })
            );
        });

        // ── NEW: Controller-level input validation tests ──

        test('should return 400 when required fields are missing', async () => {
            const req = { body: {} };
            const res = mockRes();

            await createClinic(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining('Missing required fields'),
                })
            );
        });

        test('should return 400 for invalid startTime format', async () => {
            const req = { body: { ...validBody, startTime: '25:00' } };
            const res = mockRes();

            await createClinic(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining('startTime must be in HH:mm'),
                })
            );
        });

        test('should return 400 for invalid endTime format', async () => {
            const req = { body: { ...validBody, endTime: '9am' } };
            const res = mockRes();

            await createClinic(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining('endTime must be in HH:mm'),
                })
            );
        });

        test('should return 400 when endTime is before startTime on create', async () => {
            const req = { body: { ...validBody, startTime: '14:00', endTime: '10:00' } };
            const res = mockRes();

            await createClinic(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining('End time must be after start time'),
                })
            );
        });

        test('should return 400 when date is in the past', async () => {
            const req = { body: { ...validBody, date: '2020-01-01' } };
            const res = mockRes();

            await createClinic(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'Clinic date cannot be in the past',
                })
            );
        });

        test('should return 400 when capacity is a float', async () => {
            mockHospitalFindById.mockResolvedValue({ _id: VALID_HOSPITAL_ID });

            const req = { body: { ...validBody, capacity: 10.5 } };
            const res = mockRes();

            await createClinic(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining('positive integer'),
                })
            );
        });
    });

    // ===================================================
    // GET /api/clinics — getAllClinics
    // ===================================================
    describe('getAllClinics', () => {
        test('should return all clinics', async () => {
            const clinics = [{ _id: '1' }, { _id: '2' }];
            mockClinicFind.mockResolvedValue(clinics);

            const req = { query: {} };
            const res = mockRes();

            await getAllClinics(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    count: 2,
                    data: clinics,
                })
            );
        });

        test('should filter by vaccineType', async () => {
            mockClinicFind.mockResolvedValue([]);

            const req = { query: { vaccineType: 'COVID-19' } };
            const res = mockRes();

            await getAllClinics(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
        });

        test('should filter by date', async () => {
            mockClinicFind.mockResolvedValue([]);

            const req = { query: { date: '2026-03-20' } };
            const res = mockRes();

            await getAllClinics(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
        });

        test('should return 500 when database query fails', async () => {
            mockClinicFind.mockRejectedValue(new Error('DB timeout'));

            const req = { query: {} };
            const res = mockRes();

            await getAllClinics(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: 'Server error while fetching clinic sessions',
                })
            );
        });
    });

    // ===================================================
    // GET /api/clinics/hospital/:hospitalId — getClinicsByHospital
    // ===================================================
    describe('getClinicsByHospital', () => {
        test('should return clinics for a valid hospital', async () => {
            mockHospitalFindById.mockResolvedValue({ _id: VALID_HOSPITAL_ID });
            const clinics = [{ _id: 'c1' }, { _id: 'c2' }];
            mockClinicFind.mockResolvedValue(clinics);

            const req = { params: { hospitalId: VALID_HOSPITAL_ID }, query: {} };
            const res = mockRes();

            await getClinicsByHospital(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    count: 2,
                })
            );
        });

        test('should return 404 when hospital not found', async () => {
            mockHospitalFindById.mockResolvedValue(null);

            const req = { params: { hospitalId: 'nonexistent' }, query: {} };
            const res = mockRes();

            await getClinicsByHospital(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
        });

        test('should return 400 for invalid hospital ID format', async () => {
            const error = new Error('Cast');
            error.name = 'CastError';
            mockHospitalFindById.mockRejectedValue(error);

            const req = { params: { hospitalId: 'bad-id' }, query: {} };
            const res = mockRes();

            await getClinicsByHospital(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
        });

        test('should return 500 for server error on getClinicsByHospital', async () => {
            mockHospitalFindById.mockRejectedValue(new Error('Server down'));

            const req = { params: { hospitalId: VALID_HOSPITAL_ID }, query: {} };
            const res = mockRes();

            await getClinicsByHospital(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: 'Server error while fetching clinic sessions',
                })
            );
        });
    });

    // ===================================================
    // GET /api/clinics/:id — getClinicById
    // ===================================================
    describe('getClinicById', () => {
        test('should return a single clinic with populated hospital', async () => {
            const clinic = {
                _id: 'c1',
                hospital: { _id: VALID_HOSPITAL_ID, name: 'Test Hospital', city: 'Colombo', district: 'Colombo' },
                date: '2026-04-15',
                startTime: '09:00',
                endTime: '12:00',
                capacity: 50,
                bookedCount: 10,
                vaccineType: 'COVID-19',
                isFull: false,
                availableSlots: 40,
            };
            mockClinicFindById.mockResolvedValue(clinic);

            const req = { params: { id: 'c1' } };
            const res = mockRes();

            await getClinicById(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    data: expect.objectContaining({
                        _id: 'c1',
                        hospital: expect.objectContaining({ name: 'Test Hospital' }),
                    }),
                })
            );
        });

        test('should return 404 when clinic not found', async () => {
            mockClinicFindById.mockResolvedValue(null);

            const req = { params: { id: 'nonexistent' } };
            const res = mockRes();

            await getClinicById(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: 'Clinic session not found',
                })
            );
        });

        test('should return 400 for invalid clinic ID format', async () => {
            const error = new Error('Cast error');
            error.name = 'CastError';
            mockClinicFindById.mockRejectedValue(error);

            const req = { params: { id: 'bad-id' } };
            const res = mockRes();

            await getClinicById(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: 'Invalid clinic ID format',
                })
            );
        });

        test('should return 500 for unexpected server error', async () => {
            mockClinicFindById.mockRejectedValue(new Error('DB crashed'));

            const req = { params: { id: 'c1' } };
            const res = mockRes();

            await getClinicById(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: 'Server error while fetching clinic session',
                })
            );
        });
    });

    // ===================================================
    // PATCH /api/clinics/:id/capacity — updateClinicCapacity
    // ===================================================
    describe('updateClinicCapacity', () => {
        test('should update capacity successfully', async () => {
            const clinic = {
                _id: 'c1',
                capacity: 50,
                bookedCount: 10,
                save: jest.fn().mockResolvedValue(true),
                populate: jest.fn().mockResolvedValue(true),
            };
            mockClinicFindById.mockResolvedValue(clinic);

            const req = { params: { id: 'c1' }, body: { capacity: 100 } };
            const res = mockRes();

            await updateClinicCapacity(req, res);

            expect(clinic.capacity).toBe(100);
            expect(clinic.save).toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(200);
        });

        test('should return 400 when capacity is missing', async () => {
            const req = { params: { id: 'c1' }, body: {} };
            const res = mockRes();

            await updateClinicCapacity(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ message: 'Capacity value is required' })
            );
        });

        test('should return 400 when capacity is not a positive integer', async () => {
            const req = { params: { id: 'c1' }, body: { capacity: -5 } };
            const res = mockRes();

            await updateClinicCapacity(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining('positive integer'),
                })
            );
        });

        test('should return 404 when clinic not found', async () => {
            mockClinicFindById.mockResolvedValue(null);

            const req = { params: { id: 'nonexistent' }, body: { capacity: 50 } };
            const res = mockRes();

            await updateClinicCapacity(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
        });

        test('should return 400 when reducing capacity below booked count', async () => {
            const clinic = {
                _id: 'c1',
                capacity: 50,
                bookedCount: 30,
            };
            mockClinicFindById.mockResolvedValue(clinic);

            const req = { params: { id: 'c1' }, body: { capacity: 20 } };
            const res = mockRes();

            await updateClinicCapacity(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining('Cannot reduce capacity'),
                })
            );
        });

        test('should return 400 when capacity is a float (not integer)', async () => {
            const req = { params: { id: 'c1' }, body: { capacity: 10.5 } };
            const res = mockRes();

            await updateClinicCapacity(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining('positive integer'),
                })
            );
        });

        test('should return 400 for invalid ID format on capacity update', async () => {
            const error = new Error('Cast error');
            error.name = 'CastError';
            mockClinicFindById.mockRejectedValue(error);

            const req = { params: { id: 'bad!id' }, body: { capacity: 50 } };
            const res = mockRes();

            await updateClinicCapacity(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ message: 'Invalid clinic ID format' })
            );
        });

        test('should return 500 for server error on capacity update', async () => {
            const clinic = {
                _id: 'c1',
                capacity: 50,
                bookedCount: 0,
                save: jest.fn().mockRejectedValue(new Error('Write failed')),
            };
            mockClinicFindById.mockResolvedValue(clinic);

            const req = { params: { id: 'c1' }, body: { capacity: 100 } };
            const res = mockRes();

            await updateClinicCapacity(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: 'Server error while updating clinic capacity',
                })
            );
        });
    });

    // ===================================================
    // PUT /api/clinics/:id — updateClinic (Full update)
    // ===================================================
    describe('updateClinic', () => {
        test('should update clinic successfully', async () => {
            const clinic = {
                _id: 'c1',
                date: new Date('2026-03-20'),
                startTime: '09:00',
                endTime: '12:00',
                capacity: 50,
                bookedCount: 0,
                hospital: VALID_HOSPITAL_ID,
                save: jest.fn().mockResolvedValue(true),
                populate: jest.fn().mockResolvedValue(true),
            };
            mockClinicFindById.mockResolvedValue(clinic);
            mockClinicCheckOverlap.mockResolvedValue(null);

            const req = {
                params: { id: 'c1' },
                body: { capacity: 100, vaccineType: 'Hepatitis A' },
            };
            const res = mockRes();

            await updateClinic(req, res);

            expect(clinic.save).toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    message: 'Clinic session updated successfully',
                })
            );
        });

        test('should return 404 when clinic not found', async () => {
            mockClinicFindById.mockResolvedValue(null);

            const req = { params: { id: 'nonexistent' }, body: { capacity: 50 } };
            const res = mockRes();

            await updateClinic(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
        });

        test('should return 400 when rescheduling a clinic with bookings', async () => {
            const clinic = {
                _id: 'c1',
                date: new Date('2026-03-20'),
                startTime: '09:00',
                endTime: '12:00',
                capacity: 50,
                bookedCount: 10,
                hospital: { toString: () => VALID_HOSPITAL_ID },
            };
            mockClinicFindById.mockResolvedValue(clinic);

            const req = {
                params: { id: 'c1' },
                body: { startTime: '10:00' }, // Changing time with bookings
            };
            const res = mockRes();

            await updateClinic(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining('Cannot reschedule'),
                })
            );
        });

        test('should return 400 when reducing capacity below booked count', async () => {
            const clinic = {
                _id: 'c1',
                date: new Date('2026-03-20'),
                startTime: '09:00',
                endTime: '12:00',
                capacity: 50,
                bookedCount: 30,
                hospital: { toString: () => VALID_HOSPITAL_ID },
            };
            mockClinicFindById.mockResolvedValue(clinic);

            const req = {
                params: { id: 'c1' },
                body: { capacity: 20 },
            };
            const res = mockRes();

            await updateClinic(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining('Cannot reduce capacity'),
                })
            );
        });

        test('should return 409 when schedule update causes overlap', async () => {
            const clinic = {
                _id: 'c1',
                date: new Date('2026-03-20'),
                startTime: '09:00',
                endTime: '12:00',
                capacity: 50,
                bookedCount: 0,
                hospital: VALID_HOSPITAL_ID,
            };
            mockClinicFindById.mockResolvedValue(clinic);
            mockClinicCheckOverlap.mockResolvedValue({
                _id: 'c2',
                startTime: '10:00',
                endTime: '14:00',
            });

            const req = {
                params: { id: 'c1' },
                body: { startTime: '10:00', endTime: '14:00' },
            };
            const res = mockRes();

            await updateClinic(req, res);

            expect(res.status).toHaveBeenCalledWith(409);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining('Schedule conflict'),
                })
            );
        });

        test('should return 400 when endTime is before startTime', async () => {
            const clinic = {
                _id: 'c1',
                date: new Date('2026-03-20'),
                startTime: '09:00',
                endTime: '12:00',
                capacity: 50,
                bookedCount: 0,
                hospital: VALID_HOSPITAL_ID,
            };
            mockClinicFindById.mockResolvedValue(clinic);

            const req = {
                params: { id: 'c1' },
                body: { startTime: '14:00', endTime: '10:00' },
            };
            const res = mockRes();

            await updateClinic(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining('End time must be after'),
                })
            );
        });

        test('should return 400 for CastError (invalid ID) on update', async () => {
            const error = new Error('Cast error');
            error.name = 'CastError';
            mockClinicFindById.mockRejectedValue(error);

            const req = { params: { id: 'bad!id' }, body: { capacity: 50 } };
            const res = mockRes();

            await updateClinic(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ message: 'Invalid ID format' })
            );
        });

        test('should return 400 for validation error on clinic save', async () => {
            const clinic = {
                _id: 'c1',
                date: new Date('2026-03-20'),
                startTime: '09:00',
                endTime: '12:00',
                capacity: 50,
                bookedCount: 0,
                hospital: VALID_HOSPITAL_ID,
                save: jest.fn().mockImplementation(() => {
                    const err = new Error('Validation failed');
                    err.name = 'ValidationError';
                    err.errors = { startTime: { message: 'Start time must be in HH:mm 24-hour format' } };
                    throw err;
                }),
                populate: jest.fn(),
            };
            mockClinicFindById.mockResolvedValue(clinic);

            const req = {
                params: { id: 'c1' },
                body: { capacity: 100 },
            };
            const res = mockRes();

            await updateClinic(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ message: 'Validation failed' })
            );
        });

        test('should return 500 for server error on full update', async () => {
            mockClinicFindById.mockRejectedValue(new Error('Connection reset'));

            const req = { params: { id: 'c1' }, body: { capacity: 50 } };
            const res = mockRes();

            await updateClinic(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: 'Server error while updating clinic',
                })
            );
        });
    });

    // ===================================================
    // DELETE /api/clinics/:id — deleteClinic
    // ===================================================
    describe('deleteClinic', () => {
        test('should delete clinic successfully', async () => {
            const clinic = {
                _id: 'c1',
                bookedCount: 0,
                deleteOne: jest.fn().mockResolvedValue(true),
            };
            mockClinicFindById.mockResolvedValue(clinic);

            const req = { params: { id: 'c1' } };
            const res = mockRes();

            await deleteClinic(req, res);

            expect(clinic.deleteOne).toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    message: 'Clinic session deleted successfully',
                })
            );
        });

        test('should return 404 when clinic not found', async () => {
            mockClinicFindById.mockResolvedValue(null);

            const req = { params: { id: 'nonexistent' } };
            const res = mockRes();

            await deleteClinic(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
        });

        test('should return 400 when clinic has active bookings', async () => {
            const clinic = { _id: 'c1', bookedCount: 5 };
            mockClinicFindById.mockResolvedValue(clinic);

            const req = { params: { id: 'c1' } };
            const res = mockRes();

            await deleteClinic(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining('Cannot delete'),
                })
            );
        });

        test('should return 400 for invalid ID format on delete', async () => {
            const error = new Error('Cast error');
            error.name = 'CastError';
            mockClinicFindById.mockRejectedValue(error);

            const req = { params: { id: 'bad!id' } };
            const res = mockRes();

            await deleteClinic(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ message: 'Invalid clinic ID format' })
            );
        });

        test('should return 500 for server error on delete', async () => {
            mockClinicFindById.mockRejectedValue(new Error('DB crashed'));

            const req = { params: { id: 'c1' } };
            const res = mockRes();

            await deleteClinic(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: 'Server error while deleting clinic session',
                })
            );
        });
    });
});
