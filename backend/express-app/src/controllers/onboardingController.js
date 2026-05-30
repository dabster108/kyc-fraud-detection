const onboardingService = require("../services/onboardingService");

/**
 * POST /api/v1/onboarding/session
 * Body: Step-1 form fields (fullName, dob, email, panNumber, …)
 *
 * Flow:
 *  1. Run soft duplicate checks (email, PAN, name+DOB)
 *  2. Insert onboarding_session row
 *  3. Return session_id + risk_flags (non-blocking — front-end shows warnings)
 */
const createSession = async (req, res) => {
  try {
    const required = ["fullName", "nationality", "dob", "gender", "occupation"];
    const missing = required.filter((f) => !req.body[f]?.toString().trim());

    if (missing.length > 0) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields",
        fields: missing,
      });
    }

    // Extract real IP — honour X-Forwarded-For when behind a proxy/load-balancer
    const ipAddress =
      (req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
      req.socket?.remoteAddress ||
      req.ip ||
      null;

    const result = await onboardingService.createSession(req.body, {
      ipAddress,
      userAgent: req.headers["user-agent"] || null,
    });

    return res.status(201).json({
      success: true,
      sessionId: result.sessionId,
      riskFlags: result.riskFlags,
      riskScore: result.riskScore,
    });
  } catch (err) {
    console.error("[onboarding] createSession error:", err.message);
    return res.status(500).json({
      success: false,
      error: "Failed to create onboarding session",
    });
  }
};

/**
 * GET /api/v1/onboarding/session/:sessionId
 * Returns current session data (for resuming / step 2+ prefill)
 */
const getSession = async (req, res) => {
  try {
    const session = await onboardingService.getSession(req.params.sessionId);

    if (!session) {
      return res.status(404).json({ success: false, error: "Session not found" });
    }

    return res.json({ success: true, session });
  } catch (err) {
    console.error("[onboarding] getSession error:", err.message);
    return res.status(500).json({ success: false, error: "Failed to retrieve session" });
  }
};

/**
 * PUT /api/v1/onboarding/session/:sessionId/document
 * Multipart: frontImage (required), backImage (optional)
 * Body fields: documentType, documentNumber, documentIssuedDate, documentIssuedPlace
 *
 * Flow:
 *  1. Upload images to Cloudinary
 *  2. Run forgery detection + OCR in parallel (FastAPI)
 *  3. Crop face from OCR photo_region → upload to Cloudinary
 *  4. Fuzzy cross-check OCR name vs Step 1 name
 *  5. Exact cross-check OCR document number vs user-entered
 *  6. Update onboarding_session with all results
 */
const processDocument = async (req, res) => {
  try {
    const { sessionId } = req.params;

    if (!sessionId) {
      return res.status(400).json({ success: false, error: "Missing sessionId" });
    }

    const frontFile = req.files?.frontImage?.[0] || req.files?.image?.[0];
    if (!frontFile) {
      return res.status(400).json({ success: false, error: "Front image is required" });
    }

    const backFile = req.files?.backImage?.[0] || null;

    const result = await onboardingService.processDocument(sessionId, {
      frontBuffer: frontFile.buffer,
      backBuffer: backFile?.buffer || null,
      documentType: req.body.documentType || null,
      documentNumber: req.body.documentNumber || null,
      documentIssuedDate: req.body.documentIssuedDate || null,
      documentIssuedPlace: req.body.documentIssuedPlace || null,
    });

    return res.json({
      success: true,
      ocrData: result.ocrData,
      forgeryDecision: result.forgeryDecision,
      forgeryScore: result.forgeryScore,
      forgeryDetails: result.forgeryDetails,
      documentUrl: result.documentUrl,
      documentBackUrl: result.documentBackUrl,
      documentFaceUrl: result.documentFaceUrl,
      riskFlags: result.riskFlags,
      riskScore: result.riskScore,
    });
  } catch (err) {
    console.error("[onboarding] processDocument error:", err.message);
    return res.status(500).json({
      success: false,
      error: "Failed to process document",
    });
  }
};

/**
 * POST /api/v1/onboarding/session/document
 * Multipart: frontImage (required), backImage (optional)
 * Body fields: documentType, documentNumber, documentIssuedDate,
 *              documentIssuedPlace, deviceFingerprint
 *
 * Document-first flow — this is now Step 1:
 *  1. Create an empty onboarding_session shell
 *  2. Run the full document pipeline (upload + OCR + forgery + face extract)
 *  3. Return sessionId + ocrData + prefill (mapped fields for the Review step)
 */
const startWithDocument = async (req, res) => {
  try {
    const frontFile = req.files?.frontImage?.[0] || req.files?.image?.[0];
    if (!frontFile) {
      return res.status(400).json({ success: false, error: "Front image is required" });
    }
    const backFile = req.files?.backImage?.[0] || null;

    const ipAddress =
      (req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
      req.socket?.remoteAddress ||
      req.ip ||
      null;

    const sessionId = await onboardingService.createSessionShell({
      deviceFingerprint: req.body.deviceFingerprint || null,
      ipAddress,
      userAgent: req.headers["user-agent"] || null,
    });

    const result = await onboardingService.processDocument(sessionId, {
      frontBuffer: frontFile.buffer,
      backBuffer: backFile?.buffer || null,
      documentType: req.body.documentType || null,
      documentNumber: req.body.documentNumber || null,
      documentIssuedDate: req.body.documentIssuedDate || null,
      documentIssuedPlace: req.body.documentIssuedPlace || null,
    });

    return res.status(201).json({
      success: true,
      sessionId,
      ocrData: result.ocrData,
      prefill: result.prefill,
      forgeryDecision: result.forgeryDecision,
      forgeryScore: result.forgeryScore,
      forgeryDetails: result.forgeryDetails,
      documentUrl: result.documentUrl,
      documentBackUrl: result.documentBackUrl,
      documentFaceUrl: result.documentFaceUrl,
      riskFlags: result.riskFlags,
      riskScore: result.riskScore,
    });
  } catch (err) {
    console.error("[onboarding] startWithDocument error:", err.message);
    if (process.env.NODE_ENV !== "production") {
      console.error(err.stack);
    }
    if (err.code === "VERIFIED_USER_EXISTS") {
      return res.status(409).json({
        success: false,
        code: err.code,
        error: err.message,
      });
    }
    return res.status(500).json({
      success: false,
      error: err.message || "Failed to process document",
    });
  }
};

/**
 * PUT /api/v1/onboarding/session/:sessionId/personal-info
 * Body (JSON): the OCR-prefilled, user-edited personal-info form
 *
 * Document-first flow — this is now Step 2:
 *  1. Persist the personal info onto the existing session
 *  2. Run identity/behaviour duplicate checks
 *  3. Run the OCR-vs-edit tamper check (fuzzy compare) and raise risk on
 *     drastic divergence from what the document actually says
 */
const submitPersonalInfo = async (req, res) => {
  try {
    const { sessionId } = req.params;
    if (!sessionId) {
      return res.status(400).json({ success: false, error: "Missing sessionId" });
    }

    const required = ["fullName", "nationality", "dob", "gender", "occupation"];
    const missing = required.filter((f) => !req.body[f]?.toString().trim());
    if (missing.length > 0) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields",
        fields: missing,
      });
    }

    const ipAddress =
      (req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
      req.socket?.remoteAddress ||
      req.ip ||
      null;

    const result = await onboardingService.submitPersonalInfo(sessionId, req.body, {
      ipAddress,
      userAgent: req.headers["user-agent"] || null,
    });

    return res.json({
      success: true,
      riskFlags: result.riskFlags,
      riskScore: result.riskScore,
      editComparison: result.editComparison,
    });
  } catch (err) {
    console.error("[onboarding] submitPersonalInfo error:", err.message);
    if (err.code === "VERIFIED_USER_EXISTS") {
      return res.status(409).json({
        success: false,
        code: err.code,
        error: err.message,
      });
    }
    return res.status(500).json({
      success: false,
      error: err.message || "Failed to save personal info",
    });
  }
};

/**
 * PUT /api/v1/onboarding/session/:sessionId/selfie
 * Multipart: selfie_front (required), selfie_left (optional), selfie_right (optional)
 *
 * Flow:
 *  1. Upload selfies to Cloudinary
 *  2. Compare front selfie vs stored document face embedding (FastAPI /face/compare)
 *  3. Calculate risk delta
 *  4. UPDATE onboarding_session → status = 'submitted'
 */
const processSelfie = async (req, res) => {
  try {
    const { sessionId } = req.params;

    if (!sessionId) {
      return res.status(400).json({ success: false, error: "Missing sessionId" });
    }

    const frontFile = req.files?.selfie_front?.[0];
    if (!frontFile) {
      return res.status(400).json({ success: false, error: "Front selfie is required" });
    }

    const leftFile = req.files?.selfie_left?.[0] || null;
    const rightFile = req.files?.selfie_right?.[0] || null;

    const livenessIsLive = req.body?.livenessIsLive;
    const result = await onboardingService.processSelfie(sessionId, {
      frontBuffer: frontFile.buffer,
      leftBuffer: leftFile?.buffer || null,
      rightBuffer: rightFile?.buffer || null,
      livenessIsLive:
        livenessIsLive === "true"
          ? true
          : livenessIsLive === "false"
            ? false
            : null,
      livenessDecision: req.body?.livenessDecision || null,
      livenessConfidence: req.body?.livenessConfidence
        ? Number(req.body.livenessConfidence)
        : null,
    });

    return res.json({
      success: true,
      selfieUrl: result.selfieUrl,
      faceSimilarity: result.faceSimilarity,
      isMatch: result.isMatch,
      riskFlags: result.riskFlags,
      riskScore: result.riskScore,
      outcome: result.outcome,
      status: result.status,
      userMessage: result.userMessage,
      userReason: result.userReason,
    });
  } catch (err) {
    console.error("[onboarding] processSelfie error:", err.message);
    return res.status(500).json({
      success: false,
      error: err.message || "Failed to process selfie",
    });
  }
};

module.exports = {
  createSession,
  getSession,
  processDocument,
  processSelfie,
  startWithDocument,
  submitPersonalInfo,
};
