import { jest } from '@jest/globals';

// ── Mock: Appointment model ───────────────────────────────────────────────────
const mockAppointmentCreate       = jest.fn();
const mockAppointmentFind         = jest.fn();
const mockAppointmentFindById     = jest.fn();
const mockAppointmentFindByUser   = jest.fn();
const mockAppointmentFindByClinic = jest.fn();
const mockAppointmentHasActive    = jest.fn();

jest.unstable_mockModule('../src/models/Appointment.js', () => ({
    default: {
        create:           mockAppointmentCreate,
        find:             (...args) => ({
            populate: jest.fn().mockReturnValue({
                populate: jest.fn().mockReturnValue({
                    populate: jest.fn().mockReturnValue({
                        sort: jest.fn(() => mockAppointmentFind(...args)),
                    }),
                }),
            }),
        }),
        findById:         mockAppointmentFindById,
        findByUser:       mockAppointmentFindByUser,
        findByClinic:     mockAppointmentFindByClinic,
        hasActiveBooking: mockAppointmentHasActive,
    },
}));

// ── Mock: Clinic model ────────────────────────────────────────────────────────
const mockClinicFindById = jest.fn();

jest.unstable_mockModule('../src/models/Clinic.js', () => ({
    default: { findById: mockClinicFindById },
}));

// ── Mock: axios ───────────────────────────────────────────────────────────────
const mockAxiosGet = jest.fn();

jest.unstable_mockModule('axios', () => ({
    default: { get: mockAxiosGet },
}));

// ── Lazy-import controller AFTER mocks are registered ─────────────────────────
const {
    bookAppointment,
    getMyAppointments,
    getAppointmentById,
    getClinicQueue,
    cancelAppointment,
    updateStatus,
    getAllAppointments,
    updateAppointment,
    deleteAppointment,
} = await import('../src/controllers/appointmentController.js');

// ── Helpers ───────────────────────────────────────────────────────────────────
const mockRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json   = jest.fn().mockReturnValue(res);
    return res;
};

const makeMockAppointment = (overrides = {}) => {
    // Build a 3-level chainable populate mock used by updateAppointment post-save
    const populateChain = jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnValue({
            populate: jest.fn().mockResolvedValue(undefined),
        }),
    });

    return {
        _id:        'appt001',
        clinicId:   'clinic001',
        userId:     { toString: () => 'user001' },
        dependentId: null,
        status:     'Pending',
        qrCodeUrl:  null,
        queueNumber: 1,
        populate:      populateChain,
        cancel:        jest.fn().mockResolvedValue(undefined),
        markCompleted: jest.fn().mockResolvedValue(undefined),
        markNoShow:    jest.fn().mockResolvedValue(undefined),
        save:          jest.fn().mockResolvedValue(undefined),
        deleteOne:     jest.fn().mockResolvedValue(undefined),
        ...overrides,
    };
};

const makeMockClinic = (overrides = {}) => ({
    _id:        'clinic001',
    bookedCount: 2,
    capacity:    10,
    save:        jest.fn().mockResolvedValue(undefined),
    ...overrides,
});

// ─────────────────────────────────────────────────────────────────────────────
// Appointment Controller Tests
// ─────────────────────────────────────────────────────────────────────────────
describe('Appointment Controller', () => {
    afterEach(() => jest.clearAllMocks());

    // =========================================================================
    // 1. bookAppointment
    // =========================================================================
    describe('bookAppointment', () => {
        const baseReq = () => ({
            body:   { clinicId: 'clinic001' },
            user:   { _id: 'user001', id: 'user001', role: 'User' },
            params: {},
        });

        test('400 — missing clinicId', async () => {
            const req = { body: {}, user: { _id: 'u1', id: 'u1' }, params: {} };
            const res = mockRes();
            await bookAppointment(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ message: 'clinicId is required' })
            );
        });

        test('404 — clinic not found', async () => {
            mockClinicFindById.mockResolvedValue(null);
            const res = mockRes();
            await bookAppointment(baseReq(), res);
            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ message: 'Clinic not found' })
            );
        });

        test('409 — clinic fully booked', async () => {
            mockClinicFindById.mockResolvedValue(makeMockClinic({ bookedCount: 10, capacity: 10 }));
            const res = mockRes();
            await bookAppointment(baseReq(), res);
            expect(res.status).toHaveBeenCalledWith(409);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ message: expect.stringContaining('fully booked') })
            );
        });

        test('409 — user already has an active booking (self)', async () => {
            mockClinicFindById.mockResolvedValue(makeMockClinic());
            mockAppointmentHasActive.mockResolvedValue(true);
            const res = mockRes();
            await bookAppointment(baseReq(), res);
            expect(res.status).toHaveBeenCalledWith(409);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'You already have an active booking for this clinic session.',
                })
            );
        });

        test('409 — dependent already has an active booking', async () => {
            mockClinicFindById.mockResolvedValue(makeMockClinic());
            mockAppointmentHasActive.mockResolvedValue(true);
            const req = { ...baseReq(), body: { clinicId: 'clinic001', dependentId: 'dep001' } };
            const res = mockRes();
            await bookAppointment(req, res);
            expect(res.status).toHaveBeenCalledWith(409);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'This dependent already has an active booking for this clinic session.',
                })
            );
        });

        test('201 — booking succeeds, bookedCount incremented, QR stored', async () => {
            const clinic = makeMockClinic();
            const appt   = makeMockAppointment();
            mockClinicFindById.mockResolvedValue(clinic);
            mockAppointmentHasActive.mockResolvedValue(false);
            mockAppointmentCreate.mockResolvedValue(appt);
            mockAxiosGet.mockResolvedValue({ config: { url: 'https://qr.example.com/code.png' } });
            const res = mockRes();
            await bookAppointment(baseReq(), res);
            expect(clinic.bookedCount).toBe(3);
            expect(clinic.save).toHaveBeenCalled();
            expect(appt.qrCodeUrl).toBe('https://qr.example.com/code.png');
            expect(appt.save).toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(201);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ success: true, message: 'Appointment booked successfully' })
            );
        });

        test('201 — booking succeeds even when QR API fails (qrCodeUrl stays null)', async () => {
            const clinic = makeMockClinic();
            const appt   = makeMockAppointment();
            mockClinicFindById.mockResolvedValue(clinic);
            mockAppointmentHasActive.mockResolvedValue(false);
            mockAppointmentCreate.mockResolvedValue(appt);
            mockAxiosGet.mockRejectedValue(new Error('QR API timeout'));
            const res = mockRes();
            await bookAppointment(baseReq(), res);
            expect(appt.qrCodeUrl).toBeNull();
            expect(res.status).toHaveBeenCalledWith(201);
        });

        test('400 — CastError on clinicId', async () => {
            mockClinicFindById.mockRejectedValue(Object.assign(new Error('Cast'), { name: 'CastError' }));
            const res = mockRes();
            await bookAppointment(baseReq(), res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ message: 'Invalid ID format provided' })
            );
        });

        test('400 — ValidationError from Appointment.create', async () => {
            mockClinicFindById.mockResolvedValue(makeMockClinic());
            mockAppointmentHasActive.mockResolvedValue(false);
            const valErr = Object.assign(new Error('val'), {
                name:   'ValidationError',
                errors: { clinicId: { message: 'Clinic reference is required' } },
            });
            mockAppointmentCreate.mockRejectedValue(valErr);
            const res = mockRes();
            await bookAppointment(baseReq(), res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ message: 'Validation failed' })
            );
        });

        test('500 — unexpected server error', async () => {
            mockClinicFindById.mockRejectedValue(new Error('DB crash'));
            const res = mockRes();
            await bookAppointment(baseReq(), res);
            expect(res.status).toHaveBeenCalledWith(500);
        });
    });

    // =========================================================================
    // 2. getMyAppointments
    // =========================================================================
    describe('getMyAppointments', () => {
        const req = { user: { _id: 'user001' }, params: {}, body: {} };

        test('200 — returns list of appointments', async () => {
            const appts = [makeMockAppointment(), makeMockAppointment({ _id: 'appt002' })];
            mockAppointmentFindByUser.mockResolvedValue(appts);
            const res = mockRes();
            await getMyAppointments(req, res);
            expect(mockAppointmentFindByUser).toHaveBeenCalledWith('user001');
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ count: 2, data: appts })
            );
        });

        test('200 — returns empty list', async () => {
            mockAppointmentFindByUser.mockResolvedValue([]);
            const res = mockRes();
            await getMyAppointments(req, res);
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ count: 0 }));
        });

        test('500 — server error', async () => {
            mockAppointmentFindByUser.mockRejectedValue(new Error('DB error'));
            const res = mockRes();
            await getMyAppointments(req, res);
            expect(res.status).toHaveBeenCalledWith(500);
        });
    });

    // =========================================================================
    // 3. getAppointmentById
    // =========================================================================
    describe('getAppointmentById', () => {
        const makeReq = (userId = 'user001', role = 'User') => ({
            params: { id: 'appt001' },
            user:   { _id: userId, role },
            body:   {},
        });

        // Chain: findById().populate().populate().populate() → value
        const chainMock = (value) => ({
            populate: jest.fn().mockReturnValue({
                populate: jest.fn().mockReturnValue({
                    populate: jest.fn().mockResolvedValue(value),
                }),
            }),
        });

        test('200 — owner can view their own appointment', async () => {
            const appt = makeMockAppointment(); // userId.toString() === 'user001'
            mockAppointmentFindById.mockReturnValue(chainMock(appt));
            const res = mockRes();
            await getAppointmentById(makeReq('user001'), res);
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: appt }));
        });

        test('200 — HospitalStaff can view any appointment', async () => {
            mockAppointmentFindById.mockReturnValue(chainMock(makeMockAppointment()));
            const res = mockRes();
            await getAppointmentById(makeReq('staff001', 'HospitalStaff'), res);
            expect(res.status).toHaveBeenCalledWith(200);
        });

        test('200 — Admin can view any appointment', async () => {
            mockAppointmentFindById.mockReturnValue(chainMock(makeMockAppointment()));
            const res = mockRes();
            await getAppointmentById(makeReq('admin001', 'Admin'), res);
            expect(res.status).toHaveBeenCalledWith(200);
        });

        test('403 — different regular user is forbidden', async () => {
            mockAppointmentFindById.mockReturnValue(chainMock(makeMockAppointment()));
            const res = mockRes();
            await getAppointmentById(makeReq('otherUser', 'User'), res);
            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ message: 'You are not authorised to view this appointment' })
            );
        });

        test('404 — appointment not found', async () => {
            mockAppointmentFindById.mockReturnValue(chainMock(null));
            const res = mockRes();
            await getAppointmentById(makeReq(), res);
            expect(res.status).toHaveBeenCalledWith(404);
        });

        test('400 — CastError on appointment ID', async () => {
            mockAppointmentFindById.mockReturnValue({
                populate: jest.fn().mockReturnValue({
                    populate: jest.fn().mockReturnValue({
                        populate: jest.fn().mockRejectedValue(
                            Object.assign(new Error('Cast'), { name: 'CastError' })
                        ),
                    }),
                }),
            });
            const res = mockRes();
            await getAppointmentById(makeReq(), res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ message: 'Invalid appointment ID format' })
            );
        });

        test('500 — server error', async () => {
            mockAppointmentFindById.mockReturnValue({
                populate: jest.fn().mockReturnValue({
                    populate: jest.fn().mockReturnValue({
                        populate: jest.fn().mockRejectedValue(new Error('DB crash')),
                    }),
                }),
            });
            const res = mockRes();
            await getAppointmentById(makeReq(), res);
            expect(res.status).toHaveBeenCalledWith(500);
        });
    });

    // =========================================================================
    // 4. getClinicQueue
    // =========================================================================
    describe('getClinicQueue', () => {
        const req = { params: { clinicId: 'clinic001' }, user: {}, body: {} };

        test('200 — returns appointments for the clinic', async () => {
            const appts = [makeMockAppointment(), makeMockAppointment({ _id: 'appt002', queueNumber: 2 })];
            mockClinicFindById.mockResolvedValue(makeMockClinic());
            mockAppointmentFindByClinic.mockResolvedValue(appts);
            const res = mockRes();
            await getClinicQueue(req, res);
            expect(mockAppointmentFindByClinic).toHaveBeenCalledWith('clinic001');
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ count: 2, data: appts })
            );
        });

        test('404 — clinic not found', async () => {
            mockClinicFindById.mockResolvedValue(null);
            const res = mockRes();
            await getClinicQueue(req, res);
            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ message: 'Clinic not found' })
            );
        });

        test('400 — CastError on clinic ID', async () => {
            mockClinicFindById.mockRejectedValue(
                Object.assign(new Error('Cast'), { name: 'CastError' })
            );
            const res = mockRes();
            await getClinicQueue(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ message: 'Invalid clinic ID format' })
            );
        });

        test('500 — server error', async () => {
            mockClinicFindById.mockRejectedValue(new Error('DB crash'));
            const res = mockRes();
            await getClinicQueue(req, res);
            expect(res.status).toHaveBeenCalledWith(500);
        });
    });

    // =========================================================================
    // 5. cancelAppointment
    // =========================================================================
    describe('cancelAppointment', () => {
        const req = { params: { id: 'appt001' }, user: { _id: 'user001' }, body: {} };

        test('200 — cancels Pending appointment and decrements bookedCount', async () => {
            const appt  = makeMockAppointment({ status: 'Pending' });
            const clinic = makeMockClinic({ bookedCount: 3 });
            mockAppointmentFindById.mockResolvedValue(appt);
            mockClinicFindById.mockResolvedValue(clinic);
            const res = mockRes();
            await cancelAppointment(req, res);
            expect(appt.cancel).toHaveBeenCalled();
            expect(clinic.bookedCount).toBe(2);
            expect(clinic.save).toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ message: 'Appointment cancelled successfully' })
            );
        });

        test('404 — appointment not found', async () => {
            mockAppointmentFindById.mockResolvedValue(null);
            const res = mockRes();
            await cancelAppointment(req, res);
            expect(res.status).toHaveBeenCalledWith(404);
        });

        test('400 — cannot cancel a Completed appointment', async () => {
            mockAppointmentFindById.mockResolvedValue(makeMockAppointment({ status: 'Completed' }));
            const res = mockRes();
            await cancelAppointment(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining('Cannot cancel an appointment with status "Completed"'),
                })
            );
        });

        test('400 — cannot cancel an already Cancelled appointment', async () => {
            mockAppointmentFindById.mockResolvedValue(makeMockAppointment({ status: 'Cancelled' }));
            const res = mockRes();
            await cancelAppointment(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
        });

        test('400 — CastError on appointment ID', async () => {
            mockAppointmentFindById.mockRejectedValue(
                Object.assign(new Error('Cast'), { name: 'CastError' })
            );
            const res = mockRes();
            await cancelAppointment(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ message: 'Invalid appointment ID format' })
            );
        });

        test('500 — server error', async () => {
            mockAppointmentFindById.mockRejectedValue(new Error('DB crash'));
            const res = mockRes();
            await cancelAppointment(req, res);
            expect(res.status).toHaveBeenCalledWith(500);
        });
    });

    // =========================================================================
    // 6. updateStatus
    // =========================================================================
    describe('updateStatus', () => {
        const makeReq = (status) => ({
            params: { id: 'appt001' },
            user:   { _id: 'staff001', role: 'HospitalStaff' },
            body:   { status },
        });

        test('200 — marks appointment as Completed', async () => {
            const appt = makeMockAppointment({ status: 'Pending' });
            mockAppointmentFindById.mockResolvedValue(appt);
            const res = mockRes();
            await updateStatus(makeReq('Completed'), res);
            expect(appt.markCompleted).toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ message: 'Appointment marked as Completed' })
            );
        });

        test('200 — marks appointment as No-Show', async () => {
            const appt = makeMockAppointment({ status: 'Pending' });
            mockAppointmentFindById.mockResolvedValue(appt);
            const res = mockRes();
            await updateStatus(makeReq('No-Show'), res);
            expect(appt.markNoShow).toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ message: 'Appointment marked as No-Show' })
            );
        });

        test('400 — invalid status value', async () => {
            const res = mockRes();
            await updateStatus(makeReq('InvalidStatus'), res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ message: 'Status must be one of: Completed, No-Show' })
            );
            expect(mockAppointmentFindById).not.toHaveBeenCalled();
        });

        test('400 — missing status in body', async () => {
            const res = mockRes();
            await updateStatus({ params: { id: 'appt001' }, user: {}, body: {} }, res);
            expect(res.status).toHaveBeenCalledWith(400);
        });

        test('404 — appointment not found', async () => {
            mockAppointmentFindById.mockResolvedValue(null);
            const res = mockRes();
            await updateStatus(makeReq('Completed'), res);
            expect(res.status).toHaveBeenCalledWith(404);
        });

        test('400 — cannot update a Cancelled appointment', async () => {
            mockAppointmentFindById.mockResolvedValue(makeMockAppointment({ status: 'Cancelled' }));
            const res = mockRes();
            await updateStatus(makeReq('Completed'), res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining('Cannot update an appointment with status "Cancelled"'),
                })
            );
        });

        test('400 — cannot update an already Completed appointment', async () => {
            mockAppointmentFindById.mockResolvedValue(makeMockAppointment({ status: 'Completed' }));
            const res = mockRes();
            await updateStatus(makeReq('No-Show'), res);
            expect(res.status).toHaveBeenCalledWith(400);
        });

        test('400 — CastError on appointment ID', async () => {
            mockAppointmentFindById.mockRejectedValue(
                Object.assign(new Error('Cast'), { name: 'CastError' })
            );
            const res = mockRes();
            await updateStatus(makeReq('Completed'), res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ message: 'Invalid appointment ID format' })
            );
        });

        test('500 — server error', async () => {
            mockAppointmentFindById.mockRejectedValue(new Error('DB crash'));
            const res = mockRes();
            await updateStatus(makeReq('Completed'), res);
            expect(res.status).toHaveBeenCalledWith(500);
        });
    });

    // =========================================================================
    // 7. getAllAppointments
    // =========================================================================
    describe('getAllAppointments', () => {
        const req = { query: {}, user: { role: 'Admin' }, params: {}, body: {} };

        test('200 — returns all appointments with count', async () => {
            const appts = [makeMockAppointment(), makeMockAppointment({ _id: 'appt002' })];
            mockAppointmentFind.mockResolvedValue(appts);
            const res = mockRes();
            await getAllAppointments(req, res);
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ success: true, count: 2, data: appts })
            );
        });

        test('200 — filters by status query param', async () => {
            mockAppointmentFind.mockResolvedValue([makeMockAppointment({ status: 'Pending' })]);
            const res = mockRes();
            await getAllAppointments({ ...req, query: { status: 'Pending' } }, res);
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ count: 1 }));
        });

        test('200 — returns empty list when no appointments match', async () => {
            mockAppointmentFind.mockResolvedValue([]);
            const res = mockRes();
            await getAllAppointments(req, res);
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ count: 0 }));
        });

        test('500 — server error', async () => {
            mockAppointmentFind.mockRejectedValue(new Error('DB crash'));
            const res = mockRes();
            await getAllAppointments(req, res);
            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ message: 'Server error while fetching appointments' })
            );
        });
    });

    // =========================================================================
    // 8. updateAppointment
    // =========================================================================
    describe('updateAppointment', () => {
        const makeReq = (status) => ({
            params: { id: 'appt001' },
            user:   { _id: 'staff001', role: 'HospitalStaff' },
            body:   { status },
        });

        // Helper to create a chainable populate mock for the second findById call
        const chainMock = (value) => ({
            populate: jest.fn().mockReturnValue({
                populate: jest.fn().mockReturnValue({
                    populate: jest.fn().mockResolvedValue(value),
                }),
            }),
        });

        test('200 — updates status to Completed', async () => {
            const appt = makeMockAppointment({ status: 'Pending' });
            const updatedAppt = { ...appt, status: 'Completed' };
            // First call: returns document, Second call: returns chainable query
            mockAppointmentFindById
                .mockResolvedValueOnce(appt)
                .mockReturnValueOnce(chainMock(updatedAppt));
            const res = mockRes();
            await updateAppointment(makeReq('Completed'), res);
            expect(appt.status).toBe('Completed');
            expect(appt.save).toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ success: true, message: 'Appointment updated successfully' })
            );
        });

        test('200 — cancelling a Pending appointment decrements bookedCount', async () => {
            const appt   = makeMockAppointment({ status: 'Pending' });
            const updatedAppt = { ...appt, status: 'Cancelled' };
            const clinic = makeMockClinic({ bookedCount: 5 });
            mockAppointmentFindById
                .mockResolvedValueOnce(appt)
                .mockReturnValueOnce(chainMock(updatedAppt));
            mockClinicFindById.mockResolvedValue(clinic);
            const res = mockRes();
            await updateAppointment(makeReq('Cancelled'), res);
            expect(clinic.bookedCount).toBe(4);
            expect(clinic.save).toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(200);
        });

        test('200 — cancelling a non-Pending appointment does NOT touch bookedCount', async () => {
            const appt   = makeMockAppointment({ status: 'Completed' });
            const updatedAppt = { ...appt, status: 'Cancelled' };
            const clinic = makeMockClinic({ bookedCount: 5 });
            mockAppointmentFindById
                .mockResolvedValueOnce(appt)
                .mockReturnValueOnce(chainMock(updatedAppt));
            mockClinicFindById.mockResolvedValue(clinic);
            const res = mockRes();
            await updateAppointment(makeReq('Cancelled'), res);
            expect(clinic.bookedCount).toBe(5);   // unchanged
            expect(clinic.save).not.toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(200);
        });

        test('400 — missing status in body', async () => {
            const res = mockRes();
            await updateAppointment({ params: { id: 'appt001' }, user: {}, body: {} }, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ message: 'No update fields provided. Provide a status value.' })
            );
        });

        test('400 — invalid status value', async () => {
            const res = mockRes();
            await updateAppointment(makeReq('InvalidStatus'), res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ message: expect.stringContaining('Invalid status') })
            );
            expect(mockAppointmentFindById).not.toHaveBeenCalled();
        });

        test('404 — appointment not found', async () => {
            mockAppointmentFindById.mockResolvedValue(null);
            const res = mockRes();
            await updateAppointment(makeReq('Completed'), res);
            expect(res.status).toHaveBeenCalledWith(404);
        });

        test('400 — CastError on appointment ID', async () => {
            mockAppointmentFindById.mockRejectedValue(
                Object.assign(new Error('Cast'), { name: 'CastError' })
            );
            const res = mockRes();
            await updateAppointment(makeReq('Completed'), res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ message: 'Invalid appointment ID format' })
            );
        });

        test('500 — server error', async () => {
            mockAppointmentFindById.mockRejectedValue(new Error('DB crash'));
            const res = mockRes();
            await updateAppointment(makeReq('Completed'), res);
            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ message: 'Server error while updating appointment' })
            );
        });
    });

    // =========================================================================
    // 9. deleteAppointment
    // =========================================================================
    describe('deleteAppointment', () => {
        const req = { params: { id: 'appt001' }, user: { role: 'Admin' }, body: {} };

        test('200 — deletes a Completed appointment (no bookedCount change)', async () => {
            const appt = makeMockAppointment({
                status:     'Completed',
                deleteOne:  jest.fn().mockResolvedValue(undefined),
            });
            mockAppointmentFindById.mockResolvedValue(appt);
            const res = mockRes();
            await deleteAppointment(req, res);
            expect(appt.deleteOne).toHaveBeenCalled();
            expect(mockClinicFindById).not.toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ success: true, message: 'Appointment deleted successfully' })
            );
        });

        test('200 — deletes a Pending appointment and decrements bookedCount', async () => {
            const appt   = makeMockAppointment({
                status:    'Pending',
                deleteOne: jest.fn().mockResolvedValue(undefined),
            });
            const clinic = makeMockClinic({ bookedCount: 4 });
            mockAppointmentFindById.mockResolvedValue(appt);
            mockClinicFindById.mockResolvedValue(clinic);
            const res = mockRes();
            await deleteAppointment(req, res);
            expect(clinic.bookedCount).toBe(3);
            expect(clinic.save).toHaveBeenCalled();
            expect(appt.deleteOne).toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(200);
        });

        test('404 — appointment not found', async () => {
            mockAppointmentFindById.mockResolvedValue(null);
            const res = mockRes();
            await deleteAppointment(req, res);
            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ message: 'Appointment not found' })
            );
        });

        test('400 — CastError on appointment ID', async () => {
            mockAppointmentFindById.mockRejectedValue(
                Object.assign(new Error('Cast'), { name: 'CastError' })
            );
            const res = mockRes();
            await deleteAppointment(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ message: 'Invalid appointment ID format' })
            );
        });

        test('500 — server error', async () => {
            mockAppointmentFindById.mockRejectedValue(new Error('DB crash'));
            const res = mockRes();
            await deleteAppointment(req, res);
            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ message: 'Server error while deleting appointment' })
            );
        });
    });
});
