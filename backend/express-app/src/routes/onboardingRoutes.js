const express = require("express");
const multer = require("multer");
const router = express.Router();
const {
  createSession,
  getSession,
  processDocument,
  processSelfie,
  startWithDocument,
  submitPersonalInfo,
} = require("../controllers/onboardingController");

// Keep files in memory so we can forward the buffer to Cloudinary + FastAPI
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB per file
  fileFilter: (req, file, cb) => {
    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    cb(null, allowed.includes(file.mimetype));
  },
});

// POST /api/v1/onboarding/session             — (legacy) personal-info-first Step 1
router.post("/session", createSession);

// ── Document-first flow ────────────────────────────────────────────────────
// POST /api/v1/onboarding/session/document    — Step 1: upload document + OCR
router.post(
  "/session/document",
  upload.fields([
    { name: "frontImage", maxCount: 1 },
    { name: "backImage", maxCount: 1 },
  ]),
  startWithDocument
);

// PUT  /api/v1/onboarding/session/:sessionId/personal-info — Step 2: review/edit
router.put("/session/:sessionId/personal-info", submitPersonalInfo);

// GET  /api/v1/onboarding/session/:sessionId  — fetch session (resume / admin)
router.get("/session/:sessionId", getSession);

// PUT  /api/v1/onboarding/session/:sessionId/document — Step 2 document upload
router.put(
  "/session/:sessionId/document",
  upload.fields([
    { name: "frontImage", maxCount: 1 },
    { name: "backImage", maxCount: 1 },
  ]),
  processDocument
);

// PUT  /api/v1/onboarding/session/:sessionId/selfie — Step 3 face verification
router.put(
  "/session/:sessionId/selfie",
  upload.fields([
    { name: "selfie_front", maxCount: 1 },
    { name: "selfie_left",  maxCount: 1 },
    { name: "selfie_right", maxCount: 1 },
  ]),
  processSelfie
);

module.exports = router;
