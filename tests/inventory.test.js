import { jest } from "@jest/globals";

const mockBatchFind = jest.fn();

jest.unstable_mockModule("../src/models/Batch.js", () => ({
  default: {
    find: (...args) => ({
      populate: jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnValue({
          sort: jest.fn().mockReturnValue(mockBatchFind(...args)),
        }),
      }),
    }),
  },
}));

const { getLowStockInventory } = await import(
  "../src/controllers/inventoryController.js"
);

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe("Inventory Controller", () => {
  afterEach(() => jest.clearAllMocks());

  describe("getLowStockInventory", () => {
    test("should fetch low stock batches with default threshold", async () => {
      const batches = [{ _id: "b1", quantity: 3 }, { _id: "b2", quantity: 8 }];
      mockBatchFind.mockResolvedValue(batches);

      const req = { query: {} };
      const res = mockRes();

      await getLowStockInventory(req, res);

      expect(mockBatchFind).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "Available",
          quantity: { $lte: 10 },
        })
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          threshold: 10,
          count: 2,
          data: batches,
        })
      );
    });

    test("should apply threshold and optional hospitalId and vaccineId filters", async () => {
      mockBatchFind.mockResolvedValue([]);

      const req = {
        query: {
          threshold: "5",
          hospitalId: "507f1f77bcf86cd799439011",
          vaccineId: "507f1f77bcf86cd799439012",
        },
      };
      const res = mockRes();

      await getLowStockInventory(req, res);

      expect(mockBatchFind).toHaveBeenCalledWith(
        expect.objectContaining({
          quantity: { $lte: 5 },
          hospitalId: "507f1f77bcf86cd799439011",
          vaccineId: "507f1f77bcf86cd799439012",
        })
      );
      expect(res.status).toHaveBeenCalledWith(200);
    });

    test("should return 400 for invalid threshold", async () => {
      const req = { query: { threshold: "-1" } };
      const res = mockRes();

      await getLowStockInventory(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: "Threshold must be a non-negative integer",
        })
      );
      expect(mockBatchFind).not.toHaveBeenCalled();
    });

    test("should return 400 for cast errors", async () => {
      const error = new Error("Cast failed");
      error.name = "CastError";
      mockBatchFind.mockRejectedValue(error);

      const req = { query: { hospitalId: "bad-id" } };
      const res = mockRes();

      await getLowStockInventory(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: "Invalid hospitalId or vaccineId format",
        })
      );
    });

    test("should return 500 for server errors", async () => {
      mockBatchFind.mockRejectedValue(new Error("DB crashed"));

      const req = { query: {} };
      const res = mockRes();

      await getLowStockInventory(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: "Server error while fetching low stock inventory",
        })
      );
    });
  });
});
