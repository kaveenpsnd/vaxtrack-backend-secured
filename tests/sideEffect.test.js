import { jest } from '@jest/globals';

// ── Mock Setup ──────────────────────────────────────────────
const mockSideEffectCreate = jest.fn();
const mockSideEffectFind = jest.fn();
const mockSideEffectFindById = jest.fn();
const mockSideEffectFindByIdAndUpdate = jest.fn();
const mockSideEffectFindByIdAndDelete = jest.fn();

const mockRecordFindById = jest.fn();

jest.unstable_mockModule('../src/models/SideEffect.js', () => ({
    default: {
        create: mockSideEffectCreate,
        find: mockSideEffectFind,
        findById: mockSideEffectFindById,
        findByIdAndUpdate: mockSideEffectFindByIdAndUpdate,
        findByIdAndDelete: mockSideEffectFindByIdAndDelete,
    },
}));

jest.unstable_mockModule('../src/models/Record.js', () => ({
    default: {
        findById: mockRecordFindById,
    },
}));

const {
    reportSideEffect,
    getMySideEffects,
    getSideEffectById,
    updateSideEffect,
    deleteSideEffect,
    getAllSideEffects,
} = await import('../src/controllers/sideEffectController.js');

// ── Helper ──────────────────────────────────────────────────
const mockRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
};

// ── Tests ───────────────────────────────────────────────────
describe('Side Effect Controller', () => {
    afterEach(() => jest.clearAllMocks());

    // ════════════════════════════════════════════
    // reportSideEffect
    // ════════════════════════════════════════════
    describe('reportSideEffect', () => {
        test('should return 400 when recordId is missing', async () => {
            const req = {
                body: { symptoms: ['Fever'] },
                user: { _id: '507f1f77bcf86cd799439011' },
            };
            const res = mockRes();

            await reportSideEffect(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: 'recordId and at least one symptom are required',
                })
            );
            expect(mockSideEffectCreate).not.toHaveBeenCalled();
        });

        test('should return 400 when symptoms array is empty', async () => {
            const req = {
                body: { recordId: '507f1f77bcf86cd799439022', symptoms: [] },
                user: { _id: '507f1f77bcf86cd799439011' },
            };
            const res = mockRes();

            await reportSideEffect(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: 'recordId and at least one symptom are required',
                })
            );
            expect(mockSideEffectCreate).not.toHaveBeenCalled();
        });

        test('should return 404 when vaccination record is not found', async () => {
            mockRecordFindById.mockResolvedValue(null);

            const req = {
                body: { recordId: '507f1f77bcf86cd799439022', symptoms: ['Headache'] },
                user: { _id: '507f1f77bcf86cd799439011' },
            };
            const res = mockRes();

            await reportSideEffect(req, res);

            expect(mockRecordFindById).toHaveBeenCalledWith('507f1f77bcf86cd799439022');
            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: 'Vaccination record not found',
                })
            );
            expect(mockSideEffectCreate).not.toHaveBeenCalled();
        });

        test('should return 403 when user does not own the record', async () => {
            mockRecordFindById.mockResolvedValue({
                _id: '507f1f77bcf86cd799439022',
                patientId: '507f1f77bcf86cd799439099', // Different user
            });

            const req = {
                body: { recordId: '507f1f77bcf86cd799439022', symptoms: ['Nausea'] },
                user: { _id: '507f1f77bcf86cd799439011' },
            };
            const res = mockRes();

            await reportSideEffect(req, res);

            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: 'You can only report side effects for your own vaccinations',
                })
            );
            expect(mockSideEffectCreate).not.toHaveBeenCalled();
        });

        test('should create side effect with default severity (Mild) and return 201', async () => {
            const userId = '507f1f77bcf86cd799439011';
            const recordId = '507f1f77bcf86cd799439022';

            mockRecordFindById.mockResolvedValue({
                _id: recordId,
                patientId: userId,
            });

            const createdSideEffect = {
                _id: 'se-1',
                recordId,
                userId,
                symptoms: ['Fever', 'Fatigue'],
                severity: 'Mild',
                populate: jest.fn().mockResolvedValue(undefined),
            };
            mockSideEffectCreate.mockResolvedValue(createdSideEffect);

            const req = {
                body: { recordId, symptoms: ['Fever', 'Fatigue'] },
                user: { _id: userId },
            };
            const res = mockRes();

            await reportSideEffect(req, res);

            expect(mockSideEffectCreate).toHaveBeenCalledWith({
                recordId,
                userId,
                symptoms: ['Fever', 'Fatigue'],
                severity: 'Mild',
            });
            expect(createdSideEffect.populate).toHaveBeenCalledWith(
                'recordId',
                'vaccineId dateAdministered dependentName'
            );
            expect(res.status).toHaveBeenCalledWith(201);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    message: 'Side effect reported successfully',
                    data: createdSideEffect,
                })
            );
        });

        test('should create side effect with custom severity and return 201', async () => {
            const userId = '507f1f77bcf86cd799439011';
            const recordId = '507f1f77bcf86cd799439022';

            mockRecordFindById.mockResolvedValue({
                _id: recordId,
                patientId: userId,
            });

            const createdSideEffect = {
                _id: 'se-2',
                recordId,
                userId,
                symptoms: ['Swelling'],
                severity: 'Severe',
                populate: jest.fn().mockResolvedValue(undefined),
            };
            mockSideEffectCreate.mockResolvedValue(createdSideEffect);

            const req = {
                body: { recordId, symptoms: ['Swelling'], severity: 'Severe' },
                user: { _id: userId },
            };
            const res = mockRes();

            await reportSideEffect(req, res);

            expect(mockSideEffectCreate).toHaveBeenCalledWith(
                expect.objectContaining({ severity: 'Severe' })
            );
            expect(res.status).toHaveBeenCalledWith(201);
        });

        test('should return 400 for invalid record ID format (CastError)', async () => {
            const castError = new Error('Cast failed');
            castError.name = 'CastError';
            mockRecordFindById.mockRejectedValue(castError);

            const req = {
                body: { recordId: 'not-valid-id', symptoms: ['Rash'] },
                user: { _id: '507f1f77bcf86cd799439011' },
            };
            const res = mockRes();

            await reportSideEffect(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: 'Invalid record ID format',
                })
            );
        });

        test('should return 400 for Mongoose ValidationError', async () => {
            const userId = '507f1f77bcf86cd799439011';
            const recordId = '507f1f77bcf86cd799439022';

            mockRecordFindById.mockResolvedValue({
                _id: recordId,
                patientId: userId,
            });

            const validationError = new Error('Validation failed');
            validationError.name = 'ValidationError';
            validationError.errors = {
                symptoms: { message: 'At least one symptom is required' },
            };
            mockSideEffectCreate.mockRejectedValue(validationError);

            const req = {
                body: { recordId, symptoms: ['Fever'] },
                user: { _id: userId },
            };
            const res = mockRes();

            await reportSideEffect(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: 'Validation failed',
                    errors: ['At least one symptom is required'],
                })
            );
        });
    });

    // ════════════════════════════════════════════
    // getMySideEffects
    // ════════════════════════════════════════════
    describe('getMySideEffects', () => {
        test('should return side effects for the logged-in user', async () => {
            const userId = '507f1f77bcf86cd799439011';
            const sideEffects = [
                { _id: 'se-1', symptoms: ['Fever'], severity: 'Mild' },
                { _id: 'se-2', symptoms: ['Headache'], severity: 'Moderate' },
            ];

            // Chain: find() → populate() → sort()
            const mockSort = jest.fn().mockResolvedValue(sideEffects);
            const mockPopulate = jest.fn().mockReturnValue({ sort: mockSort });
            mockSideEffectFind.mockReturnValue({ populate: mockPopulate });

            const req = { user: { _id: userId } };
            const res = mockRes();

            await getMySideEffects(req, res);

            expect(mockSideEffectFind).toHaveBeenCalledWith({ userId });
            expect(mockPopulate).toHaveBeenCalledWith({
                path: 'recordId',
                select: 'vaccineId hospitalId dateAdministered dependentName',
                populate: [{ path: 'hospitalId', select: 'name city' }],
            });
            expect(mockSort).toHaveBeenCalledWith({ dateReported: -1 });
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    count: 2,
                    data: sideEffects,
                })
            );
        });

        test('should return 500 on server error', async () => {
            mockSideEffectFind.mockImplementation(() => {
                throw new Error('Database connection failed');
            });

            const req = { user: { _id: '507f1f77bcf86cd799439011' } };
            const res = mockRes();

            await getMySideEffects(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: 'Server error while fetching side effects',
                })
            );
        });
    });

    // ════════════════════════════════════════════
    // getSideEffectById
    // ════════════════════════════════════════════
    describe('getSideEffectById', () => {
        const userId = '507f1f77bcf86cd799439011';
        const sideEffectId = '507f1f77bcf86cd799439033';

        test('should return a side effect when found and owned by user', async () => {
            const sideEffect = {
                _id: sideEffectId,
                userId,
                symptoms: ['Fever'],
                severity: 'Mild',
            };

            // Chain: findById() → populate()
            const mockPopulate = jest.fn().mockResolvedValue(sideEffect);
            mockSideEffectFindById.mockReturnValue({ populate: mockPopulate });

            const req = { params: { id: sideEffectId }, user: { _id: userId } };
            const res = mockRes();

            await getSideEffectById(req, res);

            expect(mockSideEffectFindById).toHaveBeenCalledWith(sideEffectId);
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    data: sideEffect,
                })
            );
        });

        test('should return 404 when side effect is not found', async () => {
            const mockPopulate = jest.fn().mockResolvedValue(null);
            mockSideEffectFindById.mockReturnValue({ populate: mockPopulate });

            const req = { params: { id: sideEffectId }, user: { _id: userId } };
            const res = mockRes();

            await getSideEffectById(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: 'Side effect report not found',
                })
            );
        });

        test('should return 403 when non-staff user does not own the side effect', async () => {
            const sideEffect = {
                _id: sideEffectId,
                userId: '507f1f77bcf86cd799439099', // Different user
                symptoms: ['Fever'],
            };

            const mockPopulate = jest.fn().mockResolvedValue(sideEffect);
            mockSideEffectFindById.mockReturnValue({ populate: mockPopulate });

            const req = { params: { id: sideEffectId }, user: { _id: userId, role: 'User' } };
            const res = mockRes();

            await getSideEffectById(req, res);

            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: 'You can only view your own side effect reports',
                })
            );
        });

        test('should allow Admin to view any side effect', async () => {
            const sideEffect = {
                _id: sideEffectId,
                userId: '507f1f77bcf86cd799439099', // Different user
                symptoms: ['Fever'],
                severity: 'Mild',
            };

            const mockPopulate = jest.fn().mockResolvedValue(sideEffect);
            mockSideEffectFindById.mockReturnValue({ populate: mockPopulate });

            const req = { params: { id: sideEffectId }, user: { _id: userId, role: 'Admin' } };
            const res = mockRes();

            await getSideEffectById(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ success: true, data: sideEffect })
            );
        });

        test('should allow HospitalStaff to view any side effect', async () => {
            const sideEffect = {
                _id: sideEffectId,
                userId: '507f1f77bcf86cd799439099',
                symptoms: ['Headache'],
                severity: 'Moderate',
            };

            const mockPopulate = jest.fn().mockResolvedValue(sideEffect);
            mockSideEffectFindById.mockReturnValue({ populate: mockPopulate });

            const req = { params: { id: sideEffectId }, user: { _id: userId, role: 'HospitalStaff' } };
            const res = mockRes();

            await getSideEffectById(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ success: true, data: sideEffect })
            );
        });

        test('should return 400 for invalid ID format (CastError)', async () => {
            const castError = new Error('Cast failed');
            castError.name = 'CastError';

            mockSideEffectFindById.mockReturnValue({
                populate: jest.fn().mockRejectedValue(castError),
            });

            const req = { params: { id: 'bad-id' }, user: { _id: userId } };
            const res = mockRes();

            await getSideEffectById(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: 'Invalid side effect ID format',
                })
            );
        });

        test('should return 500 on server error', async () => {
            mockSideEffectFindById.mockReturnValue({
                populate: jest.fn().mockRejectedValue(new Error('DB error')),
            });

            const req = { params: { id: sideEffectId }, user: { _id: userId } };
            const res = mockRes();

            await getSideEffectById(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: 'Server error while fetching side effect',
                })
            );
        });
    });

    // ════════════════════════════════════════════
    // updateSideEffect
    // ════════════════════════════════════════════
    describe('updateSideEffect', () => {
        const userId = '507f1f77bcf86cd799439011';
        const sideEffectId = '507f1f77bcf86cd799439033';

        test('should update symptoms and return 200', async () => {
            mockSideEffectFindById.mockResolvedValue({
                _id: sideEffectId,
                userId,
                symptoms: ['Fever'],
                severity: 'Mild',
            });

            const updatedDoc = {
                _id: sideEffectId,
                userId,
                symptoms: ['Fever', 'Headache'],
                severity: 'Mild',
            };

            // Chain: findByIdAndUpdate() → populate()
            const mockPopulate = jest.fn().mockResolvedValue(updatedDoc);
            mockSideEffectFindByIdAndUpdate.mockReturnValue({ populate: mockPopulate });

            const req = {
                params: { id: sideEffectId },
                body: { symptoms: ['Fever', 'Headache'] },
                user: { _id: userId },
            };
            const res = mockRes();

            await updateSideEffect(req, res);

            expect(mockSideEffectFindByIdAndUpdate).toHaveBeenCalledWith(
                sideEffectId,
                { symptoms: ['Fever', 'Headache'] },
                { new: true, runValidators: true }
            );
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    message: 'Side effect report updated successfully',
                    data: updatedDoc,
                })
            );
        });

        test('should update severity only and return 200', async () => {
            mockSideEffectFindById.mockResolvedValue({
                _id: sideEffectId,
                userId,
                symptoms: ['Fever'],
                severity: 'Mild',
            });

            const updatedDoc = {
                _id: sideEffectId,
                userId,
                symptoms: ['Fever'],
                severity: 'Severe',
            };

            const mockPopulate = jest.fn().mockResolvedValue(updatedDoc);
            mockSideEffectFindByIdAndUpdate.mockReturnValue({ populate: mockPopulate });

            const req = {
                params: { id: sideEffectId },
                body: { severity: 'Severe' },
                user: { _id: userId },
            };
            const res = mockRes();

            await updateSideEffect(req, res);

            expect(mockSideEffectFindByIdAndUpdate).toHaveBeenCalledWith(
                sideEffectId,
                { severity: 'Severe' },
                { new: true, runValidators: true }
            );
            expect(res.status).toHaveBeenCalledWith(200);
        });

        test('should return 404 when side effect is not found', async () => {
            mockSideEffectFindById.mockResolvedValue(null);

            const req = {
                params: { id: sideEffectId },
                body: { symptoms: ['Rash'] },
                user: { _id: userId },
            };
            const res = mockRes();

            await updateSideEffect(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: 'Side effect report not found',
                })
            );
            expect(mockSideEffectFindByIdAndUpdate).not.toHaveBeenCalled();
        });

        test('should return 403 when non-staff user does not own the side effect', async () => {
            mockSideEffectFindById.mockResolvedValue({
                _id: sideEffectId,
                userId: '507f1f77bcf86cd799439099', // Different user
            });

            const req = {
                params: { id: sideEffectId },
                body: { symptoms: ['Rash'] },
                user: { _id: userId, role: 'User' },
            };
            const res = mockRes();

            await updateSideEffect(req, res);

            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: 'You can only update your own side effect reports',
                })
            );
            expect(mockSideEffectFindByIdAndUpdate).not.toHaveBeenCalled();
        });

        test('should allow Admin to update any side effect', async () => {
            mockSideEffectFindById.mockResolvedValue({
                _id: sideEffectId,
                userId: '507f1f77bcf86cd799439099', // Different user
            });

            const updatedDoc = {
                _id: sideEffectId,
                userId: '507f1f77bcf86cd799439099',
                symptoms: ['Rash'],
                severity: 'Severe',
            };
            const mockPopulate = jest.fn().mockResolvedValue(updatedDoc);
            mockSideEffectFindByIdAndUpdate.mockReturnValue({ populate: mockPopulate });

            const req = {
                params: { id: sideEffectId },
                body: { severity: 'Severe' },
                user: { _id: userId, role: 'Admin' },
            };
            const res = mockRes();

            await updateSideEffect(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
            expect(mockSideEffectFindByIdAndUpdate).toHaveBeenCalled();
        });

        test('should return 400 when symptoms is an empty array', async () => {
            mockSideEffectFindById.mockResolvedValue({
                _id: sideEffectId,
                userId,
            });

            const req = {
                params: { id: sideEffectId },
                body: { symptoms: [] },
                user: { _id: userId },
            };
            const res = mockRes();

            await updateSideEffect(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: 'Symptoms must be a non-empty array',
                })
            );
            expect(mockSideEffectFindByIdAndUpdate).not.toHaveBeenCalled();
        });

        test('should return 500 on server error', async () => {
            mockSideEffectFindById.mockRejectedValue(new Error('DB error'));

            const req = {
                params: { id: sideEffectId },
                body: { symptoms: ['Rash'] },
                user: { _id: userId },
            };
            const res = mockRes();

            await updateSideEffect(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: 'Server error while updating side effect',
                })
            );
        });
    });

    // ════════════════════════════════════════════
    // deleteSideEffect
    // ════════════════════════════════════════════
    describe('deleteSideEffect', () => {
        const userId = '507f1f77bcf86cd799439011';
        const sideEffectId = '507f1f77bcf86cd799439033';

        test('should delete side effect and return 200', async () => {
            mockSideEffectFindById.mockResolvedValue({
                _id: sideEffectId,
                userId,
            });
            mockSideEffectFindByIdAndDelete.mockResolvedValue(true);

            const req = { params: { id: sideEffectId }, user: { _id: userId } };
            const res = mockRes();

            await deleteSideEffect(req, res);

            expect(mockSideEffectFindByIdAndDelete).toHaveBeenCalledWith(sideEffectId);
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    message: 'Side effect report deleted successfully',
                })
            );
        });

        test('should return 404 when side effect is not found', async () => {
            mockSideEffectFindById.mockResolvedValue(null);

            const req = { params: { id: sideEffectId }, user: { _id: userId } };
            const res = mockRes();

            await deleteSideEffect(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: 'Side effect report not found',
                })
            );
            expect(mockSideEffectFindByIdAndDelete).not.toHaveBeenCalled();
        });

        test('should return 403 when non-admin user does not own the side effect', async () => {
            mockSideEffectFindById.mockResolvedValue({
                _id: sideEffectId,
                userId: '507f1f77bcf86cd799439099', // Different user
            });

            const req = { params: { id: sideEffectId }, user: { _id: userId, role: 'User' } };
            const res = mockRes();

            await deleteSideEffect(req, res);

            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: 'You can only delete your own side effect reports',
                })
            );
            expect(mockSideEffectFindByIdAndDelete).not.toHaveBeenCalled();
        });

        test('should allow Admin to delete any side effect', async () => {
            mockSideEffectFindById.mockResolvedValue({
                _id: sideEffectId,
                userId: '507f1f77bcf86cd799439099', // Different user
            });
            mockSideEffectFindByIdAndDelete.mockResolvedValue(true);

            const req = { params: { id: sideEffectId }, user: { _id: userId, role: 'Admin' } };
            const res = mockRes();

            await deleteSideEffect(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
            expect(mockSideEffectFindByIdAndDelete).toHaveBeenCalledWith(sideEffectId);
        });

        test('should return 500 on server error', async () => {
            mockSideEffectFindById.mockRejectedValue(new Error('DB error'));

            const req = { params: { id: sideEffectId }, user: { _id: userId } };
            const res = mockRes();

            await deleteSideEffect(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: 'Server error while deleting side effect',
                })
            );
        });
    });

    // ════════════════════════════════════════════
    // getAllSideEffects
    // ════════════════════════════════════════════
    describe('getAllSideEffects', () => {
        test('should return all side effects with no filters', async () => {
            const sideEffects = [
                { _id: 'se-1', symptoms: ['Fever'], severity: 'Mild' },
                { _id: 'se-2', symptoms: ['Headache'], severity: 'Severe' },
            ];

            // Chain: find() → populate('userId') → populate(recordId obj) → sort()
            const mockSort = jest.fn().mockResolvedValue(sideEffects);
            const mockPopulate2 = jest.fn().mockReturnValue({ sort: mockSort });
            const mockPopulate1 = jest.fn().mockReturnValue({ populate: mockPopulate2 });
            mockSideEffectFind.mockReturnValue({ populate: mockPopulate1 });

            const req = { query: {} };
            const res = mockRes();

            await getAllSideEffects(req, res);

            expect(mockSideEffectFind).toHaveBeenCalledWith({});
            expect(mockPopulate1).toHaveBeenCalledWith('userId', 'name email');
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    count: 2,
                    data: sideEffects,
                })
            );
        });

        test('should apply severity filter from query params', async () => {
            const sideEffects = [
                { _id: 'se-2', symptoms: ['Headache'], severity: 'Severe' },
            ];

            const mockSort = jest.fn().mockResolvedValue(sideEffects);
            const mockPopulate2 = jest.fn().mockReturnValue({ sort: mockSort });
            const mockPopulate1 = jest.fn().mockReturnValue({ populate: mockPopulate2 });
            mockSideEffectFind.mockReturnValue({ populate: mockPopulate1 });

            const req = { query: { severity: 'Severe' } };
            const res = mockRes();

            await getAllSideEffects(req, res);

            expect(mockSideEffectFind).toHaveBeenCalledWith({ severity: 'Severe' });
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    count: 1,
                    data: sideEffects,
                })
            );
        });

        test('should apply userId filter from query params', async () => {
            const userId = '507f1f77bcf86cd799439011';

            const mockSort = jest.fn().mockResolvedValue([]);
            const mockPopulate2 = jest.fn().mockReturnValue({ sort: mockSort });
            const mockPopulate1 = jest.fn().mockReturnValue({ populate: mockPopulate2 });
            mockSideEffectFind.mockReturnValue({ populate: mockPopulate1 });

            const req = { query: { userId } };
            const res = mockRes();

            await getAllSideEffects(req, res);

            expect(mockSideEffectFind).toHaveBeenCalledWith({ userId });
            expect(res.status).toHaveBeenCalledWith(200);
        });

        test('should return 500 on server error', async () => {
            mockSideEffectFind.mockImplementation(() => {
                throw new Error('Database connection failed');
            });

            const req = { query: {} };
            const res = mockRes();

            await getAllSideEffects(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: 'Server error while fetching all side effects',
                })
            );
        });
    });
});
