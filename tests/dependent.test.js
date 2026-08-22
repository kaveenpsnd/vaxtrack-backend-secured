import { jest } from '@jest/globals';

const mockDependentCreate = jest.fn();
const mockDependentFindByUser = jest.fn();
const mockDependentFindById = jest.fn();
const mockDependentFindByIdAndUpdate = jest.fn();

jest.unstable_mockModule('../src/models/Dependent.js', () => ({
  default: {
    create: mockDependentCreate,
    findByUser: mockDependentFindByUser,
    findById: mockDependentFindById,
    findByIdAndUpdate: mockDependentFindByIdAndUpdate,
  },
}));

const {
  addDependent,
  getDependentsByParent,
  getDependentById,
  updateDependent,
  deleteDependent,
} = await import('../src/controllers/dependentController.js');

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('Dependent Controller', () => {
  afterEach(() => jest.clearAllMocks());

  test('addDependent should create dependent and sanitize sharedWithUserIds', async () => {
    const ownerId = '507f1f77bcf86cd799439011';
    const validShareId = '507f1f77bcf86cd799439012';
    const createdDependent = { _id: 'dep-1', name: 'Kid One' };
    mockDependentCreate.mockResolvedValue(createdDependent);

    const req = {
      user: { _id: ownerId },
      body: {
        name: 'Kid One',
        relationship: 'Child',
        gender: 'Male',
        dateOfBirth: '2020-01-01',
        sharedWithUserIds: [validShareId, 'not-an-id', ownerId, validShareId],
      },
    };
    const res = mockRes();

    await addDependent(req, res);

    expect(mockDependentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: ownerId,
        sharedWithUserIds: [validShareId],
      })
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, data: createdDependent })
    );
  });

  test('getDependentsByParent should return dependents list', async () => {
    const dependents = [{ _id: 'd1' }, { _id: 'd2' }];
    mockDependentFindByUser.mockResolvedValue(dependents);

    const req = { user: { _id: '507f1f77bcf86cd799439011' } };
    const res = mockRes();

    await getDependentsByParent(req, res);

    expect(mockDependentFindByUser).toHaveBeenCalledWith(req.user._id);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, count: 2, data: dependents })
    );
  });

  test('getDependentById should return 403 when user has no access', async () => {
    mockDependentFindById.mockResolvedValue({
      _id: '507f1f77bcf86cd799439099',
      userId: '507f1f77bcf86cd799439088',
      sharedWithUserIds: [],
    });

    const req = {
      user: { _id: '507f1f77bcf86cd799439011' },
      params: { id: '507f1f77bcf86cd799439099' },
    };
    const res = mockRes();

    await getDependentById(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: 'Not authorized to access this dependent',
      })
    );
  });

  test('addDependent should return 400 for missing required fields', async () => {
    const req = {
      user: { _id: '507f1f77bcf86cd799439011' },
      body: { name: 'Kid One' },
    };
    const res = mockRes();

    await addDependent(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: expect.stringContaining('Missing required fields'),
      })
    );
    expect(mockDependentCreate).not.toHaveBeenCalled();
  });

  // Tests for updateDependent
  test('updateDependent should update a dependent successfully', async () => {
    const ownerId = '507f1f77bcf86cd799439011';
    const dependentId = '507f1f77bcf86cd799439099';

    mockDependentFindById.mockResolvedValue({
      _id: dependentId,
      userId: ownerId,
      sharedWithUserIds: [],
    });

    const updatedData = { name: 'Updated Kid' };
    mockDependentFindByIdAndUpdate.mockResolvedValue({
      _id: dependentId,
      userId: ownerId,
      name: 'Updated Kid',
    });

    const req = {
      user: { _id: ownerId },
      params: { id: dependentId },
      body: { name: 'Updated Kid' },
    };
    const res = mockRes();

    await updateDependent(req, res);

    expect(mockDependentFindByIdAndUpdate).toHaveBeenCalledWith(
      dependentId,
      { name: 'Updated Kid' },
      { new: true, runValidators: true }
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: 'Dependent updated successfully',
      })
    );
  });

  test('updateDependent should return 403 when shared user is not in array', async () => {
    mockDependentFindById.mockResolvedValue({
      _id: '507f1f77bcf86cd799439099',
      userId: '507f1f77bcf86cd799439088', // Not the request user
      sharedWithUserIds: [], // Request user not in shared array
    });

    const req = {
      user: { _id: '507f1f77bcf86cd799439011' },
      params: { id: '507f1f77bcf86cd799439099' },
      body: { name: 'Updated Kid' },
    };
    const res = mockRes();

    await updateDependent(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: 'Not authorized to update this dependent',
      })
    );
  });

  // Tests for deleteDependent
  test('deleteDependent should delete successfully when parent', async () => {
    const ownerId = '507f1f77bcf86cd799439011';
    const dependentId = '507f1f77bcf86cd799439099';
    const mockDeleteOne = jest.fn().mockResolvedValue(true);

    mockDependentFindById.mockResolvedValue({
      _id: dependentId,
      userId: ownerId,
      sharedWithUserIds: ['507f1f77bcf86cd799439022'], // Shared with someone
      deleteOne: mockDeleteOne,
    });

    const req = {
      user: { _id: ownerId },
      params: { id: dependentId },
    };
    const res = mockRes();

    await deleteDependent(req, res);

    expect(mockDeleteOne).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: 'Dependent deleted successfully',
      })
    );
  });

  test('deleteDependent should return 403 when shared user tries to delete', async () => {
    const ownerId = '507f1f77bcf86cd799439088'; // Someone else
    const sharedUserId = '507f1f77bcf86cd799439011'; // Our user
    const dependentId = '507f1f77bcf86cd799439099';

    mockDependentFindById.mockResolvedValue({
      _id: dependentId,
      userId: ownerId,
      sharedWithUserIds: [sharedUserId], // Our user has access
    });

    const req = {
      user: { _id: sharedUserId },
      params: { id: dependentId },
    };
    const res = mockRes();

    await deleteDependent(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: expect.stringContaining('Only the parent can delete'),
      })
    );
  });
});
