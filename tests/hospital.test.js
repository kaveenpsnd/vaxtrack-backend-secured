import { jest } from '@jest/globals';

// ── Mock Modules ──
// We mock the Hospital model and geocoding service so tests run without a DB or API key.

const mockHospitalCreate = jest.fn();
const mockHospitalFind = jest.fn();
const mockHospitalFindById = jest.fn();
const mockHospitalFindByIdAndUpdate = jest.fn();

jest.unstable_mockModule('../src/models/Hospital.js', () => ({
    default: {
        create: mockHospitalCreate,
        find: (...args) => ({
            sort: jest.fn().mockReturnValue(mockHospitalFind(...args)),
        }),
        findById: mockHospitalFindById,
        findByIdAndUpdate: mockHospitalFindByIdAndUpdate,
    },
}));

const mockGeocodeAddress = jest.fn();
jest.unstable_mockModule('../src/services/geocodingService.js', () => ({
    geocodeAddress: mockGeocodeAddress,
}));

// Import AFTER mocking
const { createHospital, getAllHospitals, getHospitalById, updateHospital, deleteHospital } =
    await import('../src/controllers/hospitalController.js');

// ── Helpers ──
const mockRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
};

// ────────────────────────────────────────────────────────
// ██  HOSPITAL CONTROLLER TESTS
// ────────────────────────────────────────────────────────

describe('Hospital Controller', () => {
    afterEach(() => jest.clearAllMocks());

    // ===================================================
    // POST /api/hospitals — createHospital
    // ===================================================
    describe('createHospital', () => {
        const validBody = {
            name: 'Colombo General Hospital',
            address: 'Regents Street',
            city: 'Colombo',
            district: 'Colombo',
            latitude: 6.9271,
            longitude: 79.8612,
            contactNumber: '+94112691111',
            createdBy: '507f1f77bcf86cd799439011',
        };

        test('should create hospital with manual coordinates (no geocoding)', async () => {
            const mockHospital = { _id: 'abc123', ...validBody };
            mockHospitalCreate.mockResolvedValue(mockHospital);

            const req = { body: validBody, user: { _id: 'mockUserId' } };
            const res = mockRes();

            await createHospital(req, res);

            expect(res.status).toHaveBeenCalledWith(201);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    message: 'Hospital registered successfully',
                    geocoded: false,
                })
            );
            expect(mockGeocodeAddress).not.toHaveBeenCalled();
        });

        test('should auto-geocode when lat/long not provided', async () => {
            const bodyWithoutCoords = { ...validBody };
            delete bodyWithoutCoords.latitude;
            delete bodyWithoutCoords.longitude;

            mockGeocodeAddress.mockResolvedValue({
                latitude: 6.9271,
                longitude: 79.8612,
                displayName: 'Colombo General Hospital, Colombo, Sri Lanka',
            });
            mockHospitalCreate.mockResolvedValue({
                _id: 'abc123',
                ...bodyWithoutCoords,
                latitude: 6.9271,
                longitude: 79.8612,
            });

            const req = { body: bodyWithoutCoords, user: { _id: 'mockUserId' } };
            const res = mockRes();

            await createHospital(req, res);

            expect(mockGeocodeAddress).toHaveBeenCalledWith('Regents Street', 'Colombo');
            expect(res.status).toHaveBeenCalledWith(201);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    geocoded: true,
                })
            );
        });

        test('should return 400 when geocoding fails and no coords provided', async () => {
            const bodyWithoutCoords = { ...validBody };
            delete bodyWithoutCoords.latitude;
            delete bodyWithoutCoords.longitude;

            mockGeocodeAddress.mockRejectedValue(new Error('No geocoding results found'));

            const req = { body: bodyWithoutCoords, user: { _id: 'mockUserId' } };
            const res = mockRes();

            await createHospital(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: expect.stringContaining('Could not geocode'),
                })
            );
        });

        test('should return 409 for duplicate hospital name in same district', async () => {
            const error = new Error('Duplicate key');
            error.code = 11000;
            mockHospitalCreate.mockRejectedValue(error);

            const req = { body: validBody, user: { _id: 'mockUserId' } };
            const res = mockRes();

            await createHospital(req, res);

            expect(res.status).toHaveBeenCalledWith(409);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: expect.stringContaining('already exists'),
                })
            );
        });

        test('should return 400 for validation errors (Mongoose-level)', async () => {
            const error = new Error('Validation failed');
            error.name = 'ValidationError';
            error.errors = {
                name: { message: 'Hospital name is required' },
            };
            mockHospitalCreate.mockRejectedValue(error);

            // Provide all required fields + lat/long to bypass controller checks, trigger Mongoose error
            const req = {
                body: { ...validBody },
                user: { _id: 'mockUserId' },
            };
            const res = mockRes();

            await createHospital(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: 'Validation failed',
                    errors: ['Hospital name is required'],
                })
            );
        });

        test('should return 400 for multiple validation errors (Mongoose-level)', async () => {
            const error = new Error('Validation failed');
            error.name = 'ValidationError';
            error.errors = {
                name: { message: 'Hospital name is required' },
                address: { message: 'Address is required' },
                contactNumber: { message: 'Please provide a valid Sri Lankan phone number' },
            };
            mockHospitalCreate.mockRejectedValue(error);

            // Provide all fields so controller validation passes, but Mongoose rejects
            const req = { body: { ...validBody }, user: { _id: 'mockUserId' } };
            const res = mockRes();

            await createHospital(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            const response = res.json.mock.calls[0][0];
            expect(response.errors).toHaveLength(3);
            expect(response.errors).toContain('Hospital name is required');
            expect(response.errors).toContain('Address is required');
        });

        test('should return 400 for invalid phone number format (Mongoose-level)', async () => {
            const error = new Error('Validation failed');
            error.name = 'ValidationError';
            error.errors = {
                contactNumber: { message: 'Please provide a valid Sri Lankan phone number (e.g., +94771234567 or 0771234567)' },
            };
            mockHospitalCreate.mockRejectedValue(error);

            // Use a valid-format phone that passes controller regex but fails Mongoose
            const req = { body: { ...validBody, contactNumber: '+94000000000' }, user: { _id: 'mockUserId' } };
            const res = mockRes();

            await createHospital(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json.mock.calls[0][0].errors[0]).toContain('valid Sri Lankan phone number');
        });

        test('should return 400 for latitude out of range (Mongoose-level)', async () => {
            const error = new Error('Validation failed');
            error.name = 'ValidationError';
            error.errors = {
                latitude: { message: 'Latitude must be between -90 and 90' },
            };
            mockHospitalCreate.mockRejectedValue(error);

            // Use valid lat so controller passes, but mock Mongoose error
            const req = { body: { ...validBody, latitude: 7.0 }, user: { _id: 'mockUserId' } };
            const res = mockRes();

            await createHospital(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json.mock.calls[0][0].errors[0]).toContain('Latitude must be between');
        });

        test('should return 400 for longitude out of range (Mongoose-level)', async () => {
            const error = new Error('Validation failed');
            error.name = 'ValidationError';
            error.errors = {
                longitude: { message: 'Longitude must be between -180 and 180' },
            };
            mockHospitalCreate.mockRejectedValue(error);

            // Use valid lng so controller passes, but mock Mongoose error
            const req = { body: { ...validBody, longitude: 80.0 }, user: { _id: 'mockUserId' } };
            const res = mockRes();

            await createHospital(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json.mock.calls[0][0].errors[0]).toContain('Longitude must be between');
        });

        test('should return 500 for unexpected server errors', async () => {
            mockHospitalCreate.mockRejectedValue(new Error('DB connection lost'));

            const req = { body: validBody, user: { _id: 'mockUserId' } };
            const res = mockRes();

            await createHospital(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: 'Server error while creating hospital',
                })
            );
        });

        // ── NEW: Controller-level input validation tests ──

        test('should return 400 when required fields are missing', async () => {
            const req = { body: { latitude: 6.9, longitude: 79.8 }, user: { _id: 'mockUserId' } };
            const res = mockRes();

            await createHospital(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining('Missing required fields'),
                })
            );
        });

        test('should return 400 for invalid phone number format (controller-level)', async () => {
            const req = {
                body: { ...validBody, contactNumber: '12345' },
                user: { _id: 'mockUserId' },
            };
            const res = mockRes();

            await createHospital(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining('Invalid phone number format'),
                })
            );
        });

        test('should return 400 for latitude out of range (controller-level)', async () => {
            const req = {
                body: { ...validBody, latitude: 999 },
                user: { _id: 'mockUserId' },
            };
            const res = mockRes();

            await createHospital(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'Latitude must be between -90 and 90',
                })
            );
        });

        test('should return 400 for longitude out of range (controller-level)', async () => {
            const req = {
                body: { ...validBody, longitude: -200 },
                user: { _id: 'mockUserId' },
            };
            const res = mockRes();

            await createHospital(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'Longitude must be between -180 and 180',
                })
            );
        });
    });

    // ===================================================
    // GET /api/hospitals — getAllHospitals
    // ===================================================
    describe('getAllHospitals', () => {
        test('should return all hospitals', async () => {
            const hospitals = [
                { _id: '1', name: 'Hospital A' },
                { _id: '2', name: 'Hospital B' },
            ];
            mockHospitalFind.mockResolvedValue(hospitals);

            const req = { query: {} };
            const res = mockRes();

            await getAllHospitals(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    count: 2,
                    data: hospitals,
                })
            );
        });

        test('should filter by city', async () => {
            mockHospitalFind.mockResolvedValue([]);

            const req = { query: { city: 'Kandy' } };
            const res = mockRes();

            await getAllHospitals(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
        });

        test('should filter by district', async () => {
            mockHospitalFind.mockResolvedValue([]);

            const req = { query: { district: 'Galle' } };
            const res = mockRes();

            await getAllHospitals(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
        });

        test('should return 500 when database query fails', async () => {
            mockHospitalFind.mockRejectedValue(new Error('DB timeout'));

            const req = { query: {} };
            const res = mockRes();

            await getAllHospitals(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: 'Server error while fetching hospitals',
                })
            );
        });
    });

    // ===================================================
    // GET /api/hospitals/:id — getHospitalById
    // ===================================================
    describe('getHospitalById', () => {
        test('should return hospital when found', async () => {
            const hospital = { _id: 'abc123', name: 'Test Hospital' };
            mockHospitalFindById.mockResolvedValue(hospital);

            const req = { params: { id: 'abc123' } };
            const res = mockRes();

            await getHospitalById(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ success: true, data: hospital })
            );
        });

        test('should return 404 when hospital not found', async () => {
            mockHospitalFindById.mockResolvedValue(null);

            const req = { params: { id: 'nonexistent' } };
            const res = mockRes();

            await getHospitalById(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ success: false, message: 'Hospital not found' })
            );
        });

        test('should return 400 for invalid ID format', async () => {
            const error = new Error('Cast error');
            error.name = 'CastError';
            mockHospitalFindById.mockRejectedValue(error);

            const req = { params: { id: 'invalid-id' } };
            const res = mockRes();

            await getHospitalById(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ message: 'Invalid hospital ID format' })
            );
        });

        test('should return 500 when database query fails', async () => {
            mockHospitalFindById.mockRejectedValue(new Error('DB connection error'));

            const req = { params: { id: 'abc123' } };
            const res = mockRes();

            await getHospitalById(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: 'Server error while fetching hospital',
                })
            );
        });
    });

    // ===================================================
    // PUT /api/hospitals/:id — updateHospital
    // ===================================================
    describe('updateHospital', () => {
        test('should update hospital successfully', async () => {
            const existing = { _id: 'abc123', name: 'Old Name' };
            const updated = { _id: 'abc123', name: 'New Name' };

            mockHospitalFindById.mockResolvedValue(existing);
            mockHospitalFindByIdAndUpdate.mockResolvedValue(updated);

            const req = { params: { id: 'abc123' }, body: { name: 'New Name' } };
            const res = mockRes();

            await updateHospital(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    message: 'Hospital updated successfully',
                    data: updated,
                })
            );
        });

        test('should return 404 when updating non-existent hospital', async () => {
            mockHospitalFindById.mockResolvedValue(null);

            const req = { params: { id: 'nonexistent' }, body: { name: 'New Name' } };
            const res = mockRes();

            await updateHospital(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
        });

        test('should return 409 for duplicate name+district on update', async () => {
            mockHospitalFindById.mockResolvedValue({ _id: 'abc123' });
            const error = new Error('Duplicate');
            error.code = 11000;
            mockHospitalFindByIdAndUpdate.mockRejectedValue(error);

            const req = { params: { id: 'abc123' }, body: { name: 'Duplicate Name' } };
            const res = mockRes();

            await updateHospital(req, res);

            expect(res.status).toHaveBeenCalledWith(409);
        });

        test('should return 400 for validation errors on update (Mongoose-level)', async () => {
            mockHospitalFindById.mockResolvedValue({ _id: 'abc123' });
            const error = new Error('Validation failed');
            error.name = 'ValidationError';
            error.errors = {
                contactNumber: { message: 'Please provide a valid Sri Lankan phone number' },
            };
            mockHospitalFindByIdAndUpdate.mockRejectedValue(error);

            // Use valid phone format so controller passes, but Mongoose rejects
            const req = { params: { id: 'abc123' }, body: { contactNumber: '+94771234567' } };
            const res = mockRes();

            await updateHospital(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ message: 'Validation failed' })
            );
        });

        test('should return 400 for invalid ID format on update', async () => {
            const error = new Error('Cast error');
            error.name = 'CastError';
            mockHospitalFindById.mockRejectedValue(error);

            const req = { params: { id: 'bad-id!' }, body: { name: 'Test' } };
            const res = mockRes();

            await updateHospital(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ message: 'Invalid hospital ID format' })
            );
        });

        test('should return 500 for unexpected error on update', async () => {
            mockHospitalFindById.mockResolvedValue({ _id: 'abc123' });
            mockHospitalFindByIdAndUpdate.mockRejectedValue(new Error('Unknown'));

            const req = { params: { id: 'abc123' }, body: { name: 'Test' } };
            const res = mockRes();

            await updateHospital(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
        });

        // ── NEW: Controller-level input validation tests ──

        test('should return 400 when no update fields are provided', async () => {
            mockHospitalFindById.mockResolvedValue({ _id: 'abc123' });

            const req = { params: { id: 'abc123' }, body: {} };
            const res = mockRes();

            await updateHospital(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'No update fields provided',
                })
            );
        });

        test('should return 400 for invalid phone format on update (controller-level)', async () => {
            mockHospitalFindById.mockResolvedValue({ _id: 'abc123' });

            const req = { params: { id: 'abc123' }, body: { contactNumber: '12345' } };
            const res = mockRes();

            await updateHospital(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining('Invalid phone number format'),
                })
            );
        });

        test('should return 400 for empty name on update (controller-level)', async () => {
            mockHospitalFindById.mockResolvedValue({ _id: 'abc123' });

            const req = { params: { id: 'abc123' }, body: { name: '   ' } };
            const res = mockRes();

            await updateHospital(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'Hospital name cannot be empty',
                })
            );
        });
    });

    // ===================================================
    // DELETE /api/hospitals/:id — deleteHospital
    // ===================================================
    describe('deleteHospital', () => {
        test('should delete hospital successfully', async () => {
            const hospital = { _id: 'abc123', deleteOne: jest.fn().mockResolvedValue(true) };
            mockHospitalFindById.mockResolvedValue(hospital);

            const req = { params: { id: 'abc123' } };
            const res = mockRes();

            await deleteHospital(req, res);

            expect(hospital.deleteOne).toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    message: 'Hospital deleted successfully',
                })
            );
        });

        test('should return 404 when deleting non-existent hospital', async () => {
            mockHospitalFindById.mockResolvedValue(null);

            const req = { params: { id: 'nonexistent' } };
            const res = mockRes();

            await deleteHospital(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
        });

        test('should return 400 for invalid ID format on delete', async () => {
            const error = new Error('Cast error');
            error.name = 'CastError';
            mockHospitalFindById.mockRejectedValue(error);

            const req = { params: { id: 'bad-id!' } };
            const res = mockRes();

            await deleteHospital(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ message: 'Invalid hospital ID format' })
            );
        });

        test('should return 500 for unexpected error on delete', async () => {
            mockHospitalFindById.mockRejectedValue(new Error('DB crash'));

            const req = { params: { id: 'abc123' } };
            const res = mockRes();

            await deleteHospital(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: 'Server error while deleting hospital',
                })
            );
        });
    });
});
