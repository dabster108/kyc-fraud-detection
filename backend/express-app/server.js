// server.js
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const dotenv = require("dotenv");
const path = require("path");

// Load environment variables from root
dotenv.config({ path: path.join(__dirname, "../../.env") });

const app = express();
const PORT = process.env.BACKEND_PORT || 5000;

// Middleware
app.use(helmet()); // Security headers
app.use(cors()); // Enable CORS
app.use(morgan("dev")); // Logging
app.use(express.json()); // Parse JSON
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded

// Static files for uploads
app.use("/uploads", express.static("uploads"));

// Import routes
const kycRoutes = require("./src/routes/kycRoutes");
const adminRoutes = require("./src/routes/adminRoutes");
const onboardingRoutes = require("./src/routes/onboardingRoutes");

// Routes
app.use("/api/v1/kyc", kycRoutes);
app.use("/api/v1/admin", adminRoutes);
app.use("/api/v1/onboarding", onboardingRoutes);

// Health check
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    service: "express-backend",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Root endpoint
app.get("/", (req, res) => {
  res.json({
    message: "KYC Fraud Detection API",
    version: "1.0.0",
    endpoints: {
      health: "GET /health",
      kyc: "POST /api/v1/kyc/submit",
      admin: "GET /api/v1/admin/submissions/pending",
      onboarding: "POST /api/v1/onboarding/session",
    },
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: "Internal server error",
    message: err.message,
  });
});

// Start server (long timeout for document OCR + ML pipeline)
const server = app.listen(PORT, () => {
  console.log(` Express backend running on http://localhost:${PORT}`);
  console.log(` Health check: http://localhost:${PORT}/health`);
  console.log(` Environment: ${process.env.NODE_ENV || "development"}`);
});
server.timeout = 180_000;
server.keepAliveTimeout = 180_000;
server.headersTimeout = 185_000;
