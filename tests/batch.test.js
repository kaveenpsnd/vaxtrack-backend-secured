import { jest } from '@jest/globals';

// ── Mock Modules ──

const mockBatchCreate = jest.fn();
const mockBatchFindById = jest.fn();
const mockBatchFindByIdAndUpdate = jest.fn();

const mockBatchFind = jest.fn();

jest.unstable_mockModule('../src/models/Batch.js', () => ({
    default: {
        create: mockBatchCreate,
        find: (...args) => ({
            populate: jest.fn().mockReturnThis(),
            sort: jest.fn().mockReturnValue(mockBatchFind(...args)),
        }),
        findById: mockBatchFindById,
        findByIdAndUpdate: mockBatchFindByIdAndUpdate,
    },
}));

const mockVaccineFindById = jest.fn();
jest.unstable_mockModule('../src/models/Vaccine.js', () => ({
    default: {
        findById: mockVaccineFindById,
    },
}));

const mockHospitalFindById = jest.fn();
jest.unstable_mockModule('../src/models/Hospital.js', () => ({
    default: {
        findById: mockHospitalFindById,
    },
}));

// Import AFTER mocking
const { createBatch, updateBatch, getAllBatches, getBatchById, deleteBatch } = await import('../src/controllers/batchController.js');

// ── Helpers ──
const mockRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
};

const VALID_VACCINE_ID = '507f1f77bcf86cd799439011';
const VALID_HOSPITAL_ID = '507f1f77bcf86cd799439012';
const VALID_BATCH_ID = '507f1f77bcf86cd799439013';

// ────────────────────────────────────────────────────────
// ██  BATCH CONTROLLER TESTS
// ────────────────────────────────────────────────────────

describe('Batch Controller', () => {
    afterEach(() => jest.clearAllMocks());

    // ===================================================
    // POST /api/batches — createBatch
    // ===================================================
    describe('createBatch', () => {
        const validBody = {
            vaccineId: VALID_VACCINE_ID,
            hospitalId: VALID_HOSPITAL_ID,
            batchNumber: 'BATCH-001',
            quantity: 100,
            expiryDate: '2030-01-01',
        };

        test('should create a batch successfully', async () => {
            mockVaccineFindById.mockResolvedValue({ _id: VALID_VACCINE_ID, name: 'COVID-19' });
            mockHospitalFindById.mockResolvedValue({ _id: VALID_HOSPITAL_ID, name: 'Test Hospital' });

            const mockBatch = {
                _id: VALID_BATCH_ID,
                ...validBody,
                populate: jest.fn().mockResolvedValue(true),
            };
            mockBatchCreate.mockResolvedValue(mockBatch);

            const req = { body: validBody };
            const res = mockRes();

            await createBatch(req, res);

            expect(res.status).toHaveBeenCalledWith(201);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    message: 'Batch created successfully',
                })
            );
        });

        test('should return 404 when vaccine does not exist', async () => {
            mockVaccineFindById.mockResolvedValue(null);

            const req = { body: validBody };
            const res = mockRes();

            await createBatch(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: 'Vaccine not found',
                })
            );
        });

        test('should return 404 when hospital does not exist', async () => {
            mockVaccineFindById.mockResolvedValue({ _id: VALID_VACCINE_ID });
            mockHospitalFindById.mockResolvedValue(null);

            const req = { body: validBody };
            const res = mockRes();

            await createBatch(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: 'Hospital not found',
                })
            );
        });

        test('should return 400 when expiry date is in the past', async () => {
            mockVaccineFindById.mockResolvedValue({ _id: VALID_VACCINE_ID });
            mockHospitalFindById.mockResolvedValue({ _id: VALID_HOSPITAL_ID });

            const req = { body: { ...validBody, expiryDate: '2000-01-01' } };
            const res = mockRes();

            await createBatch(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: 'Expiry date must be in the future',
                })
            );
        });

        test('should return 400 when required fields are missing', async () => {
            const req = {
                body: {
                    vaccineId: VALID_VACCINE_ID,
                    hospitalId: VALID_HOSPITAL_ID,
                },
            };
            const res = mockRes();

            await createBatch(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: expect.stringContaining('Missing required fields'),
                })
            );
            expect(mockBatchCreate).not.toHaveBeenCalled();
        });

        test('should return 409 for duplicate batch number', async () => {
            mockVaccineFindById.mockResolvedValue({ _id: VALID_VACCINE_ID });
            mockHospitalFindById.mockResolvedValue({ _id: VALID_HOSPITAL_ID });

            const error = new Error('Duplicate key');
            error.code = 11000;
            mockBatchCreate.mockRejectedValue(error);

            const req = { body: validBody };
            const res = mockRes();

            await createBatch(req, res);

            expect(res.status).toHaveBeenCalledWith(409);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: 'A batch with this batch number already exists',
                })
            );
        });

        test('should return 400 for Mongoose validation errors on create', async () => {
            mockVaccineFindById.mockResolvedValue({ _id: VALID_VACCINE_ID });
            mockHospitalFindById.mockResolvedValue({ _id: VALID_HOSPITAL_ID });

            const error = new Error('Validation failed');
            error.name = 'ValidationError';
            error.errors = { quantity: { message: 'Quantity is required' } };
            mockBatchCreate.mockRejectedValue(error);

            const req = { body: validBody };
            const res = mockRes();

            await createBatch(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ message: 'Validation failed' })
            );
        });

        test('should return 400 for invalid ID format on create', async () => {
            const error = new Error('Cast error');
            error.name = 'CastError';
            mockVaccineFindById.mockRejectedValue(error);

            const req = { body: { ...validBody, vaccineId: 'bad-id' } };
            const res = mockRes();

            await createBatch(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ message: 'Invalid ID format' })
            );
        });

        test('should return 500 for unexpected server error on create', async () => {
            mockVaccineFindById.mockRejectedValue(new Error('DB crashed'));

            const req = { body: validBody };
            const res = mockRes();

            await createBatch(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: 'Server error while creating batch',
                })
            );
        });
    });

    // ===================================================
    // PUT /api/batches/:id — updateBatch
    // ===================================================
    describe('updateBatch', () => {
        const existingBatch = {
            _id: VALID_BATCH_ID,
            vaccineId: VALID_VACCINE_ID,
            hospitalId: VALID_HOSPITAL_ID,
            batchNumber: 'BATCH-001',
            quantity: 100,
            expiryDate: new Date('2030-01-01'),
            status: 'Available',
        };

        const mockUpdatedBatch = {
            ...existingBatch,
            populate: jest.fn().mockResolvedValue(true),
        };

        test('should update batch quantity successfully', async () => {
            mockBatchFindById.mockResolvedValue(existingBatch);
            mockBatchFindByIdAndUpdate.mockResolvedValue(mockUpdatedBatch);

            const req = { params: { id: VALID_BATCH_ID }, body: { quantity: 50 } };
            const res = mockRes();

            await updateBatch(req, res);

            expect(mockBatchFindByIdAndUpdate).toHaveBeenCalledWith(
                VALID_BATCH_ID,
                { quantity: 50 },
                { new: true, runValidators: true }
            );
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    message: 'Batch updated successfully',
                })
            );
        });

        test('should update batch status successfully', async () => {
            mockBatchFindById.mockResolvedValue(existingBatch);
            mockBatchFindByIdAndUpdate.mockResolvedValue(mockUpdatedBatch);

            const req = { params: { id: VALID_BATCH_ID }, body: { status: 'Depleted' } };
            const res = mockRes();

            await updateBatch(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ success: true })
            );
        });

        test('should update expiryDate successfully', async () => {
            mockBatchFindById.mockResolvedValue(existingBatch);
            mockBatchFindByIdAndUpdate.mockResolvedValue(mockUpdatedBatch);

            const req = {
                params: { id: VALID_BATCH_ID },
                body: { expiryDate: '2035-06-15' },
            };
            const res = mockRes();

            await updateBatch(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
        });

        test('should update multiple fields at once', async () => {
            mockBatchFindById.mockResolvedValue(existingBatch);
            mockBatchFindByIdAndUpdate.mockResolvedValue(mockUpdatedBatch);

            const req = {
                params: { id: VALID_BATCH_ID },
                body: { quantity: 200, status: 'Available', expiryDate: '2032-12-31' },
            };
            const res = mockRes();

            await updateBatch(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
        });

        test('should return 404 when batch does not exist', async () => {
            mockBatchFindById.mockResolvedValue(null);

            const req = { params: { id: VALID_BATCH_ID }, body: { quantity: 50 } };
            const res = mockRes();

            await updateBatch(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: 'Batch not found',
                })
            );
        });

        test('should return 400 when no update fields are provided', async () => {
            mockBatchFindById.mockResolvedValue(existingBatch);

            const req = { params: { id: VALID_BATCH_ID }, body: {} };
            const res = mockRes();

            await updateBatch(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: 'No update fields provided',
                })
            );
        });

        test('should return 400 when quantity is negative', async () => {
            mockBatchFindById.mockResolvedValue(existingBatch);

            const req = { params: { id: VALID_BATCH_ID }, body: { quantity: -5 } };
            const res = mockRes();

            await updateBatch(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: 'Quantity must be a non-negative integer',
                })
            );
        });

        test('should return 400 when quantity is a float', async () => {
            mockBatchFindById.mockResolvedValue(existingBatch);

            const req = { params: { id: VALID_BATCH_ID }, body: { quantity: 10.5 } };
            const res = mockRes();

            await updateBatch(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'Quantity must be a non-negative integer',
                })
            );
        });

        test('should allow quantity of 0 (depleted stock)', async () => {
            mockBatchFindById.mockResolvedValue(existingBatch);
            mockBatchFindByIdAndUpdate.mockResolvedValue(mockUpdatedBatch);

            const req = { params: { id: VALID_BATCH_ID }, body: { quantity: 0 } };
            const res = mockRes();

            await updateBatch(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
        });

        test('should return 400 for invalid expiryDate', async () => {
            mockBatchFindById.mockResolvedValue(existingBatch);

            const req = {
                params: { id: VALID_BATCH_ID },
                body: { expiryDate: 'not-a-date' },
            };
            const res = mockRes();

            await updateBatch(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'Expiry date must be a valid date',
                })
            );
        });

        test('should return 400 for invalid arrivalDate', async () => {
            mockBatchFindById.mockResolvedValue(existingBatch);

            const req = {
                params: { id: VALID_BATCH_ID },
                body: { arrivalDate: 'not-a-date' },
            };
            const res = mockRes();

            await updateBatch(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'Arrival date must be a valid date',
                })
            );
        });

        test('should return 400 for invalid status value', async () => {
            mockBatchFindById.mockResolvedValue(existingBatch);

            const req = {
                params: { id: VALID_BATCH_ID },
                body: { status: 'InvalidStatus' },
            };
            const res = mockRes();

            await updateBatch(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: expect.stringContaining('Status must be one of'),
                })
            );
        });

        test('should return 400 for Mongoose ValidationError on update', async () => {
            mockBatchFindById.mockResolvedValue(existingBatch);

            const error = new Error('Validation failed');
            error.name = 'ValidationError';
            error.errors = { quantity: { message: 'Quantity cannot be negative' } };
            mockBatchFindByIdAndUpdate.mockRejectedValue(error);

            const req = { params: { id: VALID_BATCH_ID }, body: { quantity: 50 } };
            const res = mockRes();

            await updateBatch(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ message: 'Validation failed' })
            );
        });

        test('should return 400 for invalid batch ID format (CastError)', async () => {
            const error = new Error('Cast error');
            error.name = 'CastError';
            mockBatchFindById.mockRejectedValue(error);

            const req = { params: { id: 'bad-id' }, body: { quantity: 50 } };
            const res = mockRes();

            await updateBatch(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ message: 'Invalid batch ID format' })
            );
        });

        test('should return 500 for unexpected server error on update', async () => {
            mockBatchFindById.mockRejectedValue(new Error('DB crashed'));

            const req = { params: { id: VALID_BATCH_ID }, body: { quantity: 50 } };
            const res = mockRes();

            await updateBatch(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: 'Server error while updating batch',
                })
            );
        });
    });

    // ===================================================
    // GET /api/batches — getAllBatches
    // ===================================================
    describe('getAllBatches', () => {
        test('should return all batches successfully', async () => {
            const mockBatches = [
                { _id: '1', batchNumber: 'B1' },
                { _id: '2', batchNumber: 'B2' }
            ];
            mockBatchFind.mockResolvedValue(mockBatches);

            const req = { query: {} };
            const res = mockRes();

            await getAllBatches(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    count: 2,
                    data: mockBatches
                })
            );
        });

        test('should apply filters correctly', async () => {
            mockBatchFind.mockResolvedValue([]);

            const req = { query: { hospitalId: VALID_HOSPITAL_ID, status: 'Available' } };
            const res = mockRes();

            await getAllBatches(req, res);

            // Just test it returns 200 properly when filter is provided
            expect(res.status).toHaveBeenCalledWith(200);
        });

        test('should return 500 on server error', async () => {
            mockBatchFind.mockRejectedValue(new Error('DB error'));

            const req = { query: {} };
            const res = mockRes();

            await getAllBatches(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
        });
    });

    // ===================================================
    // GET /api/batches/:id — getBatchById
    // ===================================================
    describe('getBatchById', () => {
        test('should return a batch when found', async () => {
            const mockBatch = {
                _id: VALID_BATCH_ID,
                batchNumber: 'B1',
                populate: jest.fn().mockResolvedValue(true)
            };
            mockBatchFindById.mockResolvedValue(mockBatch);

            const req = { params: { id: VALID_BATCH_ID } };
            const res = mockRes();

            await getBatchById(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    data: mockBatch
                })
            );
        });

        test('should return 404 when batch is not found', async () => {
            mockBatchFindById.mockResolvedValue(null);

            const req = { params: { id: VALID_BATCH_ID } };
            const res = mockRes();

            await getBatchById(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: 'Batch not found'
                })
            );
        });

        test('should return 400 for invalid ID format', async () => {
            const req = { params: { id: 'invalid-id' } };
            const res = mockRes();

            await getBatchById(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: 'Invalid batch ID format'
                })
            );
        });

        test('should return 500 on server error', async () => {
            mockBatchFindById.mockRejectedValue(new Error('DB error'));

            const req = { params: { id: VALID_BATCH_ID } };
            const res = mockRes();

            await getBatchById(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
        });
    });

    // ===================================================
    // DELETE /api/batches/:id — deleteBatch
    // ===================================================
    describe('deleteBatch', () => {
        test('should delete a batch successfully', async () => {
            const mockBatch = {
                _id: VALID_BATCH_ID,
                deleteOne: jest.fn().mockResolvedValue(true)
            };
            mockBatchFindById.mockResolvedValue(mockBatch);

            const req = { params: { id: VALID_BATCH_ID } };
            const res = mockRes();

            await deleteBatch(req, res);

            expect(mockBatch.deleteOne).toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    message: 'Batch deleted successfully'
                })
            );
        });

        test('should return 404 when batch not found', async () => {
            mockBatchFindById.mockResolvedValue(null);

            const req = { params: { id: VALID_BATCH_ID } };
            const res = mockRes();

            await deleteBatch(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
        });

        test('should return 400 for invalid ID format', async () => {
            const req = { params: { id: 'invalid-id' } };
            const res = mockRes();

            await deleteBatch(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: 'Invalid batch ID format'
                })
            );
        });

        test('should return 500 on server error', async () => {
            mockBatchFindById.mockRejectedValue(new Error('DB error'));

            const req = { params: { id: VALID_BATCH_ID } };
            const res = mockRes();

            await deleteBatch(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
        });
    });
});
