const express = require("express");
const router = express.Router();
const multer = require("multer");
const kycController = require("../controllers/kycController");

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(
      null,
      file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname),
    );
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

// KYC submission routes
router.post(
  "/submit",
  upload.fields([
    { name: "documentFront", maxCount: 1 },
    { name: "documentBack", maxCount: 1 },
    { name: "selfie", maxCount: 1 },
  ]),
  kycController.submitKYC,
);

router.get("/status/:submissionId", kycController.getKYCStatus);
router.get("/user/:userId", kycController.getUserSubmissions);

module.exports = router;
