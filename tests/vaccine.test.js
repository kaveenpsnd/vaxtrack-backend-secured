import { jest } from '@jest/globals';

const mockVaccineCreate = jest.fn();
const mockVaccineFind = jest.fn();
const mockVaccineFindById = jest.fn();
const mockVaccineFindByIdAndUpdate = jest.fn();
const mockUploadImage = jest.fn();
const mockDeleteImage = jest.fn();

jest.unstable_mockModule('../src/models/Vaccine.js', () => ({
  default: {
    create: mockVaccineCreate,
    find: (...args) => ({
      sort: jest.fn().mockReturnValue(mockVaccineFind(...args)),
    }),
    findById: mockVaccineFindById,
    findByIdAndUpdate: mockVaccineFindByIdAndUpdate,
  },
}));

jest.unstable_mockModule('../src/services/cloudinaryService.js', () => ({
  uploadImage: mockUploadImage,
  deleteImage: mockDeleteImage,
}));

const {
  createVaccine,
  getAllVaccines,
  getVaccineById,
  updateVaccine,
  deleteVaccine,
} = await import('../src/controllers/vaccineController.js');

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('Vaccine Controller', () => {
  afterEach(() => jest.clearAllMocks());

  test('createVaccine should create vaccine without image', async () => {
    const body = {
      name: 'Hepatitis B',
      manufacturer: 'Acme Pharma',
      description: 'Test vaccine',
      dosesRequired: 3,
      daysBetweenDoses: 30,
    };
    const created = { _id: 'vac-1', ...body, imageUrl: null };
    mockVaccineCreate.mockResolvedValue(created);

    const req = { body };
    const res = mockRes();

    await createVaccine(req, res);

    expect(mockUploadImage).not.toHaveBeenCalled();
    expect(mockVaccineCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        ...body,
        imageUrl: null,
      })
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: 'Vaccine created successfully',
        data: created,
      })
    );
  });

  test('createVaccine should upload image when file is provided', async () => {
    mockUploadImage.mockResolvedValue('https://cdn.example.com/vaccine.png');
    mockVaccineCreate.mockResolvedValue({ _id: 'vac-2' });

    const req = {
      body: {
        name: 'MMR',
        manufacturer: 'Acme',
        description: 'MMR vaccine',
        dosesRequired: 2,
        daysBetweenDoses: 30,
      },
      file: { buffer: Buffer.from('fake-image') },
    };
    const res = mockRes();

    await createVaccine(req, res);

    expect(mockUploadImage).toHaveBeenCalledWith(req.file.buffer);
    expect(mockVaccineCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        imageUrl: 'https://cdn.example.com/vaccine.png',
      })
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });

  test('createVaccine should return 409 on duplicate name', async () => {
    const dupError = new Error('Duplicate');
    dupError.code = 11000;
    mockVaccineCreate.mockRejectedValue(dupError);

    const req = {
      body: {
        name: 'DuplicateVac',
        manufacturer: 'Acme Pharma',
        description: 'desc',
        dosesRequired: 2,
        daysBetweenDoses: 30,
      },
    };
    const res = mockRes();

    await createVaccine(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: 'A vaccine with this name already exists',
      })
    );
  });

  test('createVaccine should return 400 for missing required fields', async () => {
    const req = {
      body: {
        name: 'Only Name',
      },
    };
    const res = mockRes();

    await createVaccine(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: expect.stringContaining('Missing required fields'),
      })
    );
    expect(mockVaccineCreate).not.toHaveBeenCalled();
  });

  // ===================================================
  // GET /api/vaccines — getAllVaccines
  // ===================================================
  describe('getAllVaccines', () => {
    test('should return all vaccines', async () => {
      const vaccines = [{ _id: '1', name: 'Vac A' }, { _id: '2', name: 'Vac B' }];
      mockVaccineFind.mockResolvedValue(vaccines);

      const req = { query: {} };
      const res = mockRes();

      await getAllVaccines(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          count: 2,
          data: vaccines,
        })
      );
    });

    test('should filter by manufacturer', async () => {
      mockVaccineFind.mockResolvedValue([]);

      const req = { query: { manufacturer: 'Acme' } };
      const res = mockRes();

      await getAllVaccines(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  // ===================================================
  // GET /api/vaccines/:id — getVaccineById
  // ===================================================
  describe('getVaccineById', () => {
    test('should return vaccine when found', async () => {
      const vaccine = { _id: 'vac123', name: 'Test Vaccine' };
      mockVaccineFindById.mockResolvedValue(vaccine);

      const req = { params: { id: 'vac123' } };
      const res = mockRes();

      await getVaccineById(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, data: vaccine })
      );
    });

    test('should return 404 when vaccine not found', async () => {
      mockVaccineFindById.mockResolvedValue(null);

      const req = { params: { id: 'nonexistent' } };
      const res = mockRes();

      await getVaccineById(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, message: 'Vaccine not found' })
      );
    });

    test('should return 400 for invalid ID format', async () => {
      const error = new Error('Cast error');
      error.name = 'CastError';
      mockVaccineFindById.mockRejectedValue(error);

      const req = { params: { id: 'invalid-id' } };
      const res = mockRes();

      await getVaccineById(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Invalid vaccine ID format' })
      );
    });
  });

  // ===================================================
  // PATCH /api/vaccines/:id — updateVaccine
  // ===================================================
  describe('updateVaccine', () => {
    test('should update vaccine successfully', async () => {
      const existing = { _id: 'vac123', name: 'Old Name' };
      const updated = { _id: 'vac123', name: 'New Name' };

      mockVaccineFindById.mockResolvedValue(existing);
      mockVaccineFindByIdAndUpdate.mockResolvedValue(updated);

      const req = { params: { id: 'vac123' }, body: { name: 'New Name' } };
      const res = mockRes();

      await updateVaccine(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Vaccine updated successfully',
          data: updated,
        })
      );
    });

    test('should return 404 when updating non-existent vaccine', async () => {
      mockVaccineFindById.mockResolvedValue(null);

      const req = { params: { id: 'nonexistent' }, body: { name: 'New Name' } };
      const res = mockRes();

      await updateVaccine(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    test('should replace image if new image is provided', async () => {
      const existing = { _id: 'vac123', name: 'Old', imageUrl: 'old.png' };
      const updated = { _id: 'vac123', name: 'Old', imageUrl: 'new.png' };

      mockVaccineFindById.mockResolvedValue(existing);
      mockVaccineFindByIdAndUpdate.mockResolvedValue(updated);
      mockUploadImage.mockResolvedValue('new.png');
      mockDeleteImage.mockResolvedValue();

      const req = {
        params: { id: 'vac123' },
        body: {},
        file: { buffer: Buffer.from('img') }
      };
      const res = mockRes();

      await updateVaccine(req, res);

      expect(mockDeleteImage).toHaveBeenCalledWith('old.png');
      expect(mockUploadImage).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });

    test('should return 400 for empty name on update', async () => {
      mockVaccineFindById.mockResolvedValue({ _id: 'vac123' });

      const req = { params: { id: 'vac123' }, body: { name: '   ' } };
      const res = mockRes();

      await updateVaccine(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Vaccine name cannot be empty',
        })
      );
    });

    test('should handle numeric fields sent as strings (multipart/form-data)', async () => {
      const existing = { _id: 'vac123', name: 'Old Name', imageUrl: null };
      const updated = { _id: 'vac123', name: 'Old Name', dosesRequired: 2, daysBetweenDoses: 28 };

      mockVaccineFindById.mockResolvedValue(existing);
      mockVaccineFindByIdAndUpdate.mockResolvedValue(updated);

      // Simulates multipart/form-data — all values arrive as strings
      const req = {
        params: { id: 'vac123' },
        body: { dosesRequired: '2', daysBetweenDoses: '28' },
      };
      const res = mockRes();

      await updateVaccine(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Vaccine updated successfully',
        })
      );
    });

    test('should return 400 when dosesRequired is less than 1', async () => {
      mockVaccineFindById.mockResolvedValue({ _id: 'vac123' });

      const req = { params: { id: 'vac123' }, body: { dosesRequired: '0' } };
      const res = mockRes();

      await updateVaccine(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'dosesRequired must be an integer greater than or equal to 1',
        })
      );
    });

    test('should return 400 when daysBetweenDoses is negative', async () => {
      mockVaccineFindById.mockResolvedValue({ _id: 'vac123' });

      const req = { params: { id: 'vac123' }, body: { daysBetweenDoses: '-1' } };
      const res = mockRes();

      await updateVaccine(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'daysBetweenDoses must be a non-negative integer',
        })
      );
    });

    test('should return 400 when no update fields are provided', async () => {
      mockVaccineFindById.mockResolvedValue({ _id: 'vac123' });

      const req = { params: { id: 'vac123' }, body: {} };
      const res = mockRes();

      await updateVaccine(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'No update fields provided',
        })
      );
    });

    test('should ignore empty string fields sent by Swagger UI and update only image', async () => {
      const existing = { _id: 'vac123', name: 'Old', imageUrl: 'old.png' };
      const updated  = { _id: 'vac123', name: 'Old', imageUrl: 'new.png' };

      mockVaccineFindById.mockResolvedValue(existing);
      mockVaccineFindByIdAndUpdate.mockResolvedValue(updated);
      mockUploadImage.mockResolvedValue('new.png');
      mockDeleteImage.mockResolvedValue();

      // Swagger sends empty strings for every untouched text field
      const req = {
        params: { id: 'vac123' },
        body: { name: '', manufacturer: '', description: '', dosesRequired: '', daysBetweenDoses: '' },
        file: { buffer: Buffer.from('img') },
      };
      const res = mockRes();

      await updateVaccine(req, res);

      expect(mockDeleteImage).toHaveBeenCalledWith('old.png');
      expect(mockUploadImage).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, message: 'Vaccine updated successfully' })
      );
    });

    test('should remove image when removeImage=true is sent', async () => {
      const existing = { _id: 'vac123', name: 'Old', imageUrl: 'old.png' };
      const updated  = { _id: 'vac123', name: 'Old', imageUrl: null };

      mockVaccineFindById.mockResolvedValue(existing);
      mockVaccineFindByIdAndUpdate.mockResolvedValue(updated);
      mockDeleteImage.mockResolvedValue();

      const req = {
        params: { id: 'vac123' },
        body: { removeImage: true },
      };
      const res = mockRes();

      await updateVaccine(req, res);

      expect(mockDeleteImage).toHaveBeenCalledWith('old.png');
      expect(mockUploadImage).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, message: 'Vaccine updated successfully' })
      );
    });

    test('should remove image when removeImage="true" (string from form-data)', async () => {
      const existing = { _id: 'vac123', name: 'Old', imageUrl: 'old.png' };
      const updated  = { _id: 'vac123', name: 'Old', imageUrl: null };

      mockVaccineFindById.mockResolvedValue(existing);
      mockVaccineFindByIdAndUpdate.mockResolvedValue(updated);
      mockDeleteImage.mockResolvedValue();

      const req = {
        params: { id: 'vac123' },
        body: { removeImage: 'true' },   // multipart/form-data sends strings
      };
      const res = mockRes();

      await updateVaccine(req, res);

      expect(mockDeleteImage).toHaveBeenCalledWith('old.png');
      expect(mockUploadImage).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });

    test('should upload new image and ignore removeImage when both are provided', async () => {
      const existing = { _id: 'vac123', name: 'Old', imageUrl: 'old.png' };
      const updated  = { _id: 'vac123', name: 'Old', imageUrl: 'new.png' };

      mockVaccineFindById.mockResolvedValue(existing);
      mockVaccineFindByIdAndUpdate.mockResolvedValue(updated);
      mockUploadImage.mockResolvedValue('new.png');
      mockDeleteImage.mockResolvedValue();

      const req = {
        params: { id: 'vac123' },
        body: { removeImage: 'true' },
        file: { buffer: Buffer.from('img') },  // file takes precedence
      };
      const res = mockRes();

      await updateVaccine(req, res);

      // Old image deleted, new image uploaded — removeImage branch NOT reached
      expect(mockDeleteImage).toHaveBeenCalledWith('old.png');
      expect(mockUploadImage).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  // ===================================================
  // DELETE /api/vaccines/:id — deleteVaccine
  // ===================================================
  describe('deleteVaccine', () => {
    test('should delete vaccine and its image successfully', async () => {
      const vaccine = {
        _id: 'vac123',
        imageUrl: 'some-img.png',
        deleteOne: jest.fn().mockResolvedValue(true)
      };
      mockVaccineFindById.mockResolvedValue(vaccine);
      mockDeleteImage.mockResolvedValue();

      const req = { params: { id: 'vac123' } };
      const res = mockRes();

      await deleteVaccine(req, res);

      expect(mockDeleteImage).toHaveBeenCalledWith('some-img.png');
      expect(vaccine.deleteOne).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Vaccine deleted successfully',
        })
      );
    });

    test('should delete vaccine without an image successfully', async () => {
      const vaccine = {
        _id: 'vac123',
        imageUrl: null,
        deleteOne: jest.fn().mockResolvedValue(true)
      };
      mockVaccineFindById.mockResolvedValue(vaccine);

      const req = { params: { id: 'vac123' } };
      const res = mockRes();

      await deleteVaccine(req, res);

      expect(mockDeleteImage).not.toHaveBeenCalled();
      expect(vaccine.deleteOne).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });

    test('should return 404 when deleting non-existent vaccine', async () => {
      mockVaccineFindById.mockResolvedValue(null);

      const req = { params: { id: 'nonexistent' } };
      const res = mockRes();

      await deleteVaccine(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });
});
