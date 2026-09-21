import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import dns from "node:dns";
import path from "path";
import swaggerUi from "swagger-ui-express";
import YAML from "yamljs";
import connectDB from "./config/db.js";
import { startCronJobs } from "./services/cronService.js";
import appointmentRoutes from "./routes/appointmentRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import batchRoutes from "./routes/batchRoutes.js";
import clinicRoutes from "./routes/clinicRoutes.js";
import dependentRoutes from "./routes/dependentRoutes.js";
import geocodeRoutes from "./routes/geocodeRoutes.js";
import hospitalRoutes from "./routes/hospitalRoutes.js";
import inventoryRoutes from "./routes/inventoryRoutes.js";
import recordRoutes from "./routes/recordRoutes.js";
import sideEffectRoutes from "./routes/sideEffectRoutes.js";
import vaccineRoutes from "./routes/vaccineRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";

// Load OpenAPI spec
const swaggerDocument = YAML.load(path.resolve("openapi.yaml"));

dotenv.config();

const app = express();

// Behind Render's reverse proxy: trust the first X-Forwarded-For hop so
// req.ip is the real client address (used by the per-IP rate limiters).
app.set("trust proxy", 1);

// Middleware
app.use(express.json());
app.use(cors());
app.use(helmet());
app.use(morgan("dev"));

dns.setServers(["8.8.8.8", "8.8.4.4"]); // Use Google's Public DNS

// Connect to Database
connectDB();

// Initialize Automated Background Jobs (Cron Engine)
startCronJobs();

// Mount Routes
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));

app.use("/api/users", authRoutes);

// Health check
app.get("/", (req, res) => {
  res.send("API is running...");
});

app.use("/api/hospitals", hospitalRoutes);
app.use("/api/users/dependents", dependentRoutes);
app.use("/api/batches", batchRoutes);
app.use("/api/vaccines", vaccineRoutes);
app.use("/api/geocode", geocodeRoutes);
app.use("/api/clinics", clinicRoutes);
app.use("/api/records", recordRoutes);
app.use("/api/side-effects", sideEffectRoutes);
app.use("/api/inventory", inventoryRoutes);
app.use("/api/appointments", appointmentRoutes);
app.use("/api/notifications", notificationRoutes);
// Global Error Handler
app.use((err, req, res, next) => {
  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  res.status(statusCode).json({
    success: false,
    message: err.message,
    stack: process.env.NODE_ENV === "production" ? null : err.stack,
  });
});
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
