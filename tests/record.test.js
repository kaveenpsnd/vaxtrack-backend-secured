import { jest } from '@jest/globals';

// ── Mock Setup ──────────────────────────────────────────────
const mockRecordCreate = jest.fn();
const mockRecordFind = jest.fn();
const mockRecordFindById = jest.fn();
const mockRecordFindByIdAndUpdate = jest.fn();
const mockRecordFindByIdAndDelete = jest.fn();

const mockUserFindById = jest.fn();

const mockSideEffectDeleteMany = jest.fn();

jest.unstable_mockModule('../src/models/Record.js', () => ({
    default: {
        create: mockRecordCreate,
        find: mockRecordFind,
        findById: mockRecordFindById,
        findByIdAndUpdate: mockRecordFindByIdAndUpdate,
        findByIdAndDelete: mockRecordFindByIdAndDelete,
    },
}));

jest.unstable_mockModule('../src/models/User.js', () => ({
    default: {
        findById: mockUserFindById,
    },
}));

jest.unstable_mockModule('../src/models/SideEffect.js', () => ({
    default: {
        deleteMany: mockSideEffectDeleteMany,
    },
}));

const {
    createRecord,
    getMyRecords,
    getHistory,
    getDueRecords,
    getRecordById,
    updateRecord,
    deleteRecord,
    getAllRecords,
} = await import('../src/controllers/recordController.js');

// ── Helper ──────────────────────────────────────────────────
const mockRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
};

// ── Tests ───────────────────────────────────────────────────
describe('Record Controller', () => {
    afterEach(() => jest.clearAllMocks());

    // ════════════════════════════════════════════
    // createRecord
    // ════════════════════════════════════════════
    describe('createRecord', () => {
        const staffUserId = '507f1f77bcf86cd799439001';
        const patientId = '507f1f77bcf86cd799439002';
        const baseBody = {
            patientId,
            vaccineId: '507f1f77bcf86cd799439003',
            batchId: '507f1f77bcf86cd799439004',
            hospitalId: '507f1f77bcf86cd799439005',
        };

        test('should return 404 when patient is not found', async () => {
            mockUserFindById.mockResolvedValue(null);

            const req = { body: baseBody, user: { _id: staffUserId } };
            const res = mockRes();

            await createRecord(req, res);

            expect(mockUserFindById).toHaveBeenCalledWith(patientId);
            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: 'Patient not found',
                })
            );
            expect(mockRecordCreate).not.toHaveBeenCalled();
        });

        test('should create record successfully and return 201', async () => {
            mockUserFindById.mockResolvedValue({ _id: patientId, name: 'John' });

            const createdRecord = { _id: 'rec-1', ...baseBody, administeredBy: staffUserId };
            mockRecordCreate.mockResolvedValue(createdRecord);

            const req = { body: baseBody, user: { _id: staffUserId } };
            const res = mockRes();

            await createRecord(req, res);

            expect(mockRecordCreate).toHaveBeenCalledWith({
                patientId,
                dependentName: undefined,
                vaccineId: baseBody.vaccineId,
                batchId: baseBody.batchId,
                hospitalId: baseBody.hospitalId,
                administeredBy: staffUserId,
            });
            expect(res.status).toHaveBeenCalledWith(201);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    message: 'Vaccination record created successfully',
                    data: createdRecord,
                })
            );
        });

        test('should return 400 when Record.create returns falsy', async () => {
            mockUserFindById.mockResolvedValue({ _id: patientId, name: 'John' });
            mockRecordCreate.mockResolvedValue(null);

            const req = { body: baseBody, user: { _id: staffUserId } };
            const res = mockRes();

            await createRecord(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: 'Invalid record data',
                })
            );
        });

        test('should return 500 on server error', async () => {
            mockUserFindById.mockRejectedValue(new Error('DB connection lost'));

            const req = { body: baseBody, user: { _id: staffUserId } };
            const res = mockRes();

            await createRecord(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: 'Server error while creating record',
                })
            );
        });
    });

    // ════════════════════════════════════════════
    // getMyRecords
    // ════════════════════════════════════════════
    describe('getMyRecords', () => {
        const userId = '507f1f77bcf86cd799439011';

        test('should return user records with populated fields', async () => {
            const records = [
                { _id: 'rec-1', patientId: userId, vaccineId: 'v1' },
                { _id: 'rec-2', patientId: userId, vaccineId: 'v2' },
            ];

            // Chain: find() → populate('hospitalId') → populate('administeredBy') → sort()
            const mockSort = jest.fn().mockResolvedValue(records);
            const mockPopulate2 = jest.fn().mockReturnValue({ sort: mockSort });
            const mockPopulate1 = jest.fn().mockReturnValue({ populate: mockPopulate2 });
            mockRecordFind.mockReturnValue({ populate: mockPopulate1 });

            const req = { user: { _id: userId } };
            const res = mockRes();

            await getMyRecords(req, res);

            expect(mockRecordFind).toHaveBeenCalledWith({ patientId: userId });
            expect(mockPopulate1).toHaveBeenCalledWith('hospitalId', 'name city district');
            expect(mockPopulate2).toHaveBeenCalledWith('administeredBy', 'name');
            expect(mockSort).toHaveBeenCalledWith({ dateAdministered: -1 });
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    count: 2,
                    data: records,
                })
            );
        });

        test('should return 500 on server error', async () => {
            mockRecordFind.mockImplementation(() => {
                throw new Error('DB error');
            });

            const req = { user: { _id: userId } };
            const res = mockRes();

            await getMyRecords(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: 'Server error while fetching records',
                })
            );
        });
    });

    // ════════════════════════════════════════════
    // getHistory
    // ════════════════════════════════════════════
    describe('getHistory', () => {
        const userId = '507f1f77bcf86cd799439011';
        const userName = 'John Doe';

        test('should group records into self and dependents correctly', async () => {
            const records = [
                { _id: 'r1', dependentName: null },            // self
                { _id: 'r2', dependentName: null },            // self
                { _id: 'r3', dependentName: 'Child One' },     // dependent
                { _id: 'r4', dependentName: 'Child One' },     // same dependent
                { _id: 'r5', dependentName: 'Child Two' },     // different dependent
            ];

            const mockSort = jest.fn().mockResolvedValue(records);
            const mockPopulate2 = jest.fn().mockReturnValue({ sort: mockSort });
            const mockPopulate1 = jest.fn().mockReturnValue({ populate: mockPopulate2 });
            mockRecordFind.mockReturnValue({ populate: mockPopulate1 });

            const req = { user: { _id: userId, name: userName } };
            const res = mockRes();

            await getHistory(req, res);

            expect(res.status).toHaveBeenCalledWith(200);

            const responseData = res.json.mock.calls[0][0];
            expect(responseData.success).toBe(true);
            expect(responseData.data.self.name).toBe(userName);
            expect(responseData.data.self.count).toBe(2);
            expect(responseData.data.self.records).toHaveLength(2);
            expect(responseData.data.dependents).toHaveLength(2);
            expect(responseData.data.dependents[0].dependentName).toBe('Child One');
            expect(responseData.data.dependents[0].records).toHaveLength(2);
            expect(responseData.data.dependents[1].dependentName).toBe('Child Two');
            expect(responseData.data.dependents[1].records).toHaveLength(1);
            expect(responseData.data.totalRecords).toBe(5);
        });

        test('should return empty structure when no records exist', async () => {
            const mockSort = jest.fn().mockResolvedValue([]);
            const mockPopulate2 = jest.fn().mockReturnValue({ sort: mockSort });
            const mockPopulate1 = jest.fn().mockReturnValue({ populate: mockPopulate2 });
            mockRecordFind.mockReturnValue({ populate: mockPopulate1 });

            const req = { user: { _id: userId, name: userName } };
            const res = mockRes();

            await getHistory(req, res);

            expect(res.status).toHaveBeenCalledWith(200);

            const responseData = res.json.mock.calls[0][0];
            expect(responseData.data.self.count).toBe(0);
            expect(responseData.data.self.records).toHaveLength(0);
            expect(responseData.data.dependents).toHaveLength(0);
            expect(responseData.data.totalRecords).toBe(0);
        });

        test('should return 500 on server error', async () => {
            mockRecordFind.mockImplementation(() => {
                throw new Error('DB error');
            });

            const req = { user: { _id: userId, name: userName } };
            const res = mockRes();

            await getHistory(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: 'Server error while fetching vaccination history',
                })
            );
        });
    });

    // ════════════════════════════════════════════
    // getDueRecords
    // ════════════════════════════════════════════
    describe('getDueRecords', () => {
        const userId = '507f1f77bcf86cd799439011';

        const setupDualFindMock = (upcomingRecords, overdueRecords) => {
            let callCount = 0;
            mockRecordFind.mockImplementation(() => {
                callCount++;
                if (callCount === 1) {
                    const mockSort = jest.fn().mockResolvedValue(upcomingRecords);
                    const mockPopulate = jest.fn().mockReturnValue({ sort: mockSort });
                    return { populate: mockPopulate };
                } else {
                    const mockSort = jest.fn().mockResolvedValue(overdueRecords);
                    const mockPopulate = jest.fn().mockReturnValue({ sort: mockSort });
                    return { populate: mockPopulate };
                }
            });
        };

        test('should return both upcoming and overdue records', async () => {
            const upcoming = [{ _id: 'r1', nextDoseDate: new Date('2030-01-01') }];
            const overdue = [{ _id: 'r2', nextDoseDate: new Date('2020-01-01') }];
            setupDualFindMock(upcoming, overdue);

            const req = { user: { _id: userId } };
            const res = mockRes();

            await getDueRecords(req, res);

            expect(mockRecordFind).toHaveBeenCalledTimes(2);
            expect(res.status).toHaveBeenCalledWith(200);

            const responseData = res.json.mock.calls[0][0];
            expect(responseData.data.upcoming.count).toBe(1);
            expect(responseData.data.upcoming.records).toEqual(upcoming);
            expect(responseData.data.overdue.count).toBe(1);
            expect(responseData.data.overdue.records).toEqual(overdue);
        });

        test('should return empty arrays when no due records exist', async () => {
            setupDualFindMock([], []);

            const req = { user: { _id: userId } };
            const res = mockRes();

            await getDueRecords(req, res);

            expect(res.status).toHaveBeenCalledWith(200);

            const responseData = res.json.mock.calls[0][0];
            expect(responseData.data.upcoming.count).toBe(0);
            expect(responseData.data.overdue.count).toBe(0);
        });

        test('should return only overdue records when no upcoming exist', async () => {
            const overdue = [
                { _id: 'r1', nextDoseDate: new Date('2020-06-01') },
                { _id: 'r2', nextDoseDate: new Date('2021-03-15') },
            ];
            setupDualFindMock([], overdue);

            const req = { user: { _id: userId } };
            const res = mockRes();

            await getDueRecords(req, res);

            expect(res.status).toHaveBeenCalledWith(200);

            const responseData = res.json.mock.calls[0][0];
            expect(responseData.data.upcoming.count).toBe(0);
            expect(responseData.data.overdue.count).toBe(2);
            expect(responseData.data.overdue.records).toEqual(overdue);
        });

        test('should return 500 on server error', async () => {
            mockRecordFind.mockImplementation(() => {
                throw new Error('DB error');
            });

            const req = { user: { _id: userId } };
            const res = mockRes();

            await getDueRecords(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: 'Server error while fetching due vaccinations',
                })
            );
        });
    });

    // ════════════════════════════════════════════
    // getRecordById
    // ════════════════════════════════════════════
    describe('getRecordById', () => {
        const patientId = '507f1f77bcf86cd799439011';
        const recordId = '507f1f77bcf86cd799439033';

        test('should return record when user is the patient (owner)', async () => {
            const record = {
                _id: recordId,
                patientId,
                vaccineId: 'v1',
            };

            // Chain: findById() → populate('hospitalId') → populate('administeredBy')
            const mockPopulate2 = jest.fn().mockResolvedValue(record);
            const mockPopulate1 = jest.fn().mockReturnValue({ populate: mockPopulate2 });
            mockRecordFindById.mockReturnValue({ populate: mockPopulate1 });

            const req = {
                params: { id: recordId },
                user: { _id: patientId, role: 'Public' },
            };
            const res = mockRes();

            await getRecordById(req, res);

            expect(mockRecordFindById).toHaveBeenCalledWith(recordId);
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    data: record,
                })
            );
        });

        test('should return record when user is Staff (not owner)', async () => {
            const record = {
                _id: recordId,
                patientId,           // Patient is someone else
                vaccineId: 'v1',
            };

            const mockPopulate2 = jest.fn().mockResolvedValue(record);
            const mockPopulate1 = jest.fn().mockReturnValue({ populate: mockPopulate2 });
            mockRecordFindById.mockReturnValue({ populate: mockPopulate1 });

            const req = {
                params: { id: recordId },
                user: { _id: '507f1f77bcf86cd799439099', role: 'HospitalStaff' },
            };
            const res = mockRes();

            await getRecordById(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ success: true, data: record })
            );
        });

        test('should return 404 when record is not found', async () => {
            const mockPopulate2 = jest.fn().mockResolvedValue(null);
            const mockPopulate1 = jest.fn().mockReturnValue({ populate: mockPopulate2 });
            mockRecordFindById.mockReturnValue({ populate: mockPopulate1 });

            const req = {
                params: { id: recordId },
                user: { _id: patientId, role: 'Public' },
            };
            const res = mockRes();

            await getRecordById(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: 'Vaccination record not found',
                })
            );
        });

        test('should return 403 when user is not owner and not staff', async () => {
            const record = {
                _id: recordId,
                patientId,
                vaccineId: 'v1',
            };

            const mockPopulate2 = jest.fn().mockResolvedValue(record);
            const mockPopulate1 = jest.fn().mockReturnValue({ populate: mockPopulate2 });
            mockRecordFindById.mockReturnValue({ populate: mockPopulate1 });

            const req = {
                params: { id: recordId },
                user: { _id: '507f1f77bcf86cd799439099', role: 'Public' }, // Different user, Public role
            };
            const res = mockRes();

            await getRecordById(req, res);

            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: 'Not authorized to view this record',
                })
            );
        });

        test('should return 400 for invalid ID format (CastError)', async () => {
            const castError = new Error('Cast failed');
            castError.name = 'CastError';

            const mockPopulate1 = jest.fn().mockReturnValue({
                populate: jest.fn().mockRejectedValue(castError),
            });
            mockRecordFindById.mockReturnValue({ populate: mockPopulate1 });

            const req = {
                params: { id: 'bad-id' },
                user: { _id: patientId, role: 'Public' },
            };
            const res = mockRes();

            await getRecordById(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: 'Invalid record ID format',
                })
            );
        });

        test('should return 500 on server error', async () => {
            const mockPopulate1 = jest.fn().mockReturnValue({
                populate: jest.fn().mockRejectedValue(new Error('DB error')),
            });
            mockRecordFindById.mockReturnValue({ populate: mockPopulate1 });

            const req = {
                params: { id: recordId },
                user: { _id: patientId, role: 'Public' },
            };
            const res = mockRes();

            await getRecordById(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: 'Server error while fetching record',
                })
            );
        });
    });

    // ════════════════════════════════════════════
    // updateRecord
    // ════════════════════════════════════════════
    describe('updateRecord', () => {
        const recordId = '507f1f77bcf86cd799439033';

        test('should update allowed fields and return 200', async () => {
            mockRecordFindById.mockResolvedValue({
                _id: recordId,
                patientId: '507f1f77bcf86cd799439011',
            });

            const updatedDoc = {
                _id: recordId,
                nextDoseDate: '2026-06-01',
                hospitalId: '507f1f77bcf86cd799439005',
            };

            // Chain: findByIdAndUpdate() → populate('hospitalId') → populate('administeredBy')
            const mockPopulate2 = jest.fn().mockResolvedValue(updatedDoc);
            const mockPopulate1 = jest.fn().mockReturnValue({ populate: mockPopulate2 });
            mockRecordFindByIdAndUpdate.mockReturnValue({ populate: mockPopulate1 });

            const req = {
                params: { id: recordId },
                body: { nextDoseDate: '2026-06-01' },
                user: { _id: '507f1f77bcf86cd799439001', role: 'HospitalStaff' },
            };
            const res = mockRes();

            await updateRecord(req, res);

            expect(mockRecordFindByIdAndUpdate).toHaveBeenCalledWith(
                recordId,
                { nextDoseDate: '2026-06-01' },
                { new: true, runValidators: true }
            );
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    message: 'Vaccination record updated successfully',
                    data: updatedDoc,
                })
            );
        });

        test('should return 404 when record is not found', async () => {
            mockRecordFindById.mockResolvedValue(null);

            const req = {
                params: { id: recordId },
                body: { nextDoseDate: '2026-06-01' },
                user: { _id: '507f1f77bcf86cd799439001', role: 'HospitalStaff' },
            };
            const res = mockRes();

            await updateRecord(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: 'Vaccination record not found',
                })
            );
            expect(mockRecordFindByIdAndUpdate).not.toHaveBeenCalled();
        });

        test('should only update allowed fields, ignoring immutable ones', async () => {
            mockRecordFindById.mockResolvedValue({ _id: recordId });

            const updatedDoc = { _id: recordId, dependentName: 'Alice' };
            const mockPopulate2 = jest.fn().mockResolvedValue(updatedDoc);
            const mockPopulate1 = jest.fn().mockReturnValue({ populate: mockPopulate2 });
            mockRecordFindByIdAndUpdate.mockReturnValue({ populate: mockPopulate1 });

            const req = {
                params: { id: recordId },
                // patientId & vaccineId should be ignored by the controller
                body: { dependentName: 'Alice', patientId: 'SHOULD_IGNORE', vaccineId: 'SHOULD_IGNORE' },
                user: { _id: '507f1f77bcf86cd799439001', role: 'Admin' },
            };
            const res = mockRes();

            await updateRecord(req, res);

            // Only dependentName should be in the update — patientId and vaccineId must be excluded
            expect(mockRecordFindByIdAndUpdate).toHaveBeenCalledWith(
                recordId,
                { dependentName: 'Alice' },
                { new: true, runValidators: true }
            );
            expect(res.status).toHaveBeenCalledWith(200);
        });

        test('should return 500 on server error', async () => {
            mockRecordFindById.mockRejectedValue(new Error('DB error'));

            const req = {
                params: { id: recordId },
                body: { nextDoseDate: '2026-06-01' },
                user: { _id: '507f1f77bcf86cd799439001', role: 'HospitalStaff' },
            };
            const res = mockRes();

            await updateRecord(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: 'Server error while updating record',
                })
            );
        });
    });

    // ════════════════════════════════════════════
    // deleteRecord
    // ════════════════════════════════════════════
    describe('deleteRecord', () => {
        const recordId = '507f1f77bcf86cd799439033';

        test('should delete record and cascade-delete side effects, return 200', async () => {
            mockRecordFindById.mockResolvedValue({ _id: recordId });
            mockSideEffectDeleteMany.mockResolvedValue({ deletedCount: 2 });
            mockRecordFindByIdAndDelete.mockResolvedValue(true);

            const req = {
                params: { id: recordId },
                user: { _id: '507f1f77bcf86cd799439001', role: 'HospitalStaff' },
            };
            const res = mockRes();

            await deleteRecord(req, res);

            expect(mockSideEffectDeleteMany).toHaveBeenCalledWith({ recordId });
            expect(mockRecordFindByIdAndDelete).toHaveBeenCalledWith(recordId);
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    message: 'Vaccination record and associated side effects deleted successfully',
                })
            );
        });

        test('should return 404 when record is not found', async () => {
            mockRecordFindById.mockResolvedValue(null);

            const req = {
                params: { id: recordId },
                user: { _id: '507f1f77bcf86cd799439001', role: 'HospitalStaff' },
            };
            const res = mockRes();

            await deleteRecord(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: 'Vaccination record not found',
                })
            );
            expect(mockSideEffectDeleteMany).not.toHaveBeenCalled();
            expect(mockRecordFindByIdAndDelete).not.toHaveBeenCalled();
        });

        test('should return 500 on server error', async () => {
            mockRecordFindById.mockRejectedValue(new Error('DB error'));

            const req = {
                params: { id: recordId },
                user: { _id: '507f1f77bcf86cd799439001', role: 'HospitalStaff' },
            };
            const res = mockRes();

            await deleteRecord(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: 'Server error while deleting record',
                })
            );
        });
    });

    // ════════════════════════════════════════════
    // getAllRecords
    // ════════════════════════════════════════════
    describe('getAllRecords', () => {
        test('should return all records with no filters', async () => {
            const records = [
                { _id: 'rec-1', patientId: 'p1' },
                { _id: 'rec-2', patientId: 'p2' },
            ];

            // Chain: find() → populate('patientId') → populate('hospitalId') → populate('administeredBy') → sort()
            const mockSort = jest.fn().mockResolvedValue(records);
            const mockPopulate3 = jest.fn().mockReturnValue({ sort: mockSort });
            const mockPopulate2 = jest.fn().mockReturnValue({ populate: mockPopulate3 });
            const mockPopulate1 = jest.fn().mockReturnValue({ populate: mockPopulate2 });
            mockRecordFind.mockReturnValue({ populate: mockPopulate1 });

            const req = { query: {} };
            const res = mockRes();

            await getAllRecords(req, res);

            expect(mockRecordFind).toHaveBeenCalledWith({});
            expect(mockPopulate1).toHaveBeenCalledWith('patientId', 'name email nic');
            expect(mockPopulate2).toHaveBeenCalledWith('hospitalId', 'name city district');
            expect(mockPopulate3).toHaveBeenCalledWith('administeredBy', 'name');
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    count: 2,
                    data: records,
                })
            );
        });

        test('should apply patientId filter from query params', async () => {
            const patientId = '507f1f77bcf86cd799439011';

            const mockSort = jest.fn().mockResolvedValue([]);
            const mockPopulate3 = jest.fn().mockReturnValue({ sort: mockSort });
            const mockPopulate2 = jest.fn().mockReturnValue({ populate: mockPopulate3 });
            const mockPopulate1 = jest.fn().mockReturnValue({ populate: mockPopulate2 });
            mockRecordFind.mockReturnValue({ populate: mockPopulate1 });

            const req = { query: { patientId } };
            const res = mockRes();

            await getAllRecords(req, res);

            expect(mockRecordFind).toHaveBeenCalledWith({ patientId });
            expect(res.status).toHaveBeenCalledWith(200);
        });

        test('should apply multiple filters from query params', async () => {
            const hospitalId = '507f1f77bcf86cd799439005';
            const vaccineId = '507f1f77bcf86cd799439003';

            const mockSort = jest.fn().mockResolvedValue([]);
            const mockPopulate3 = jest.fn().mockReturnValue({ sort: mockSort });
            const mockPopulate2 = jest.fn().mockReturnValue({ populate: mockPopulate3 });
            const mockPopulate1 = jest.fn().mockReturnValue({ populate: mockPopulate2 });
            mockRecordFind.mockReturnValue({ populate: mockPopulate1 });

            const req = { query: { hospitalId, vaccineId } };
            const res = mockRes();

            await getAllRecords(req, res);

            expect(mockRecordFind).toHaveBeenCalledWith({ hospitalId, vaccineId });
            expect(res.status).toHaveBeenCalledWith(200);
        });

        test('should return 500 on server error', async () => {
            mockRecordFind.mockImplementation(() => {
                throw new Error('Database connection failed');
            });

            const req = { query: {} };
            const res = mockRes();

            await getAllRecords(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: 'Server error while fetching all records',
                })
            );
        });
    });
});
