const pool = require("./dbClient");
const { uploadBuffer } = require("./cloudinaryService");
const { compareTwoStrings } = require("string-similarity");
const FormData = require("form-data");
const axios = require("axios");
const sharp = require("sharp");

const ML_URL = process.env.ML_SERVICE_URL || "http://localhost:8000";
const ML_TIMEOUT = 45000;

class OnboardingService {
  /**
   * Runs soft duplicate checks against:
   *   - onboarding_sessions  (previous attempts, including rejected/expired)
   *   - verified_users       (already-approved users)
   *   - device fingerprint / IP / submission speed signals
   *
   * Returns risk flags + a numeric risk score.
   * DOES NOT hard-block — callers decide what to do with the score.
   */
  async checkDuplicates({ email, panNumber, fullName, dob, phone, deviceFingerprint, ipAddress, submissionSpeedMs }) {
    const riskFlags = {};
    let riskScore = 0;

    const norm = (v) => (v ? v.trim().toLowerCase() : null);

    // ── Phone number checks ───────────────────────────────────────────────────
    if (phone) {
      const phoneNorm = phone.replace(/\s+/g, "");

      const [sessionRows, verifiedRows] = await Promise.all([
        pool.query(
          `SELECT COUNT(*) AS cnt
           FROM   onboarding_sessions
           WHERE  phone_number = $1
             AND  status NOT IN ('expired')`,
          [phoneNorm]
        ),
        pool.query(
          `SELECT COUNT(*) AS cnt
           FROM   verified_users
           WHERE  phone_number = $1`,
          [phoneNorm]
        ),
      ]);

      const prevAttempts = parseInt(sessionRows.rows[0].cnt, 10);
      const verifiedExists = parseInt(verifiedRows.rows[0].cnt, 10) > 0;

      if (verifiedExists) {
        riskFlags.verified_user_phone_exists = true;
        riskScore += 40;
      }
      if (prevAttempts > 0) {
        riskFlags.duplicate_phone = true;
        riskFlags.previous_phone_attempts = prevAttempts;
        riskScore += Math.min(prevAttempts * 10, 30);
      }
    }

    // ── Email checks ─────────────────────────────────────────────────────────
    if (email) {
      const emailNorm = norm(email);

      const [sessionRows, verifiedRows] = await Promise.all([
        pool.query(
          `SELECT COUNT(*) AS cnt
           FROM   onboarding_sessions
           WHERE  LOWER(email) = $1
             AND  status NOT IN ('expired')`,
          [emailNorm]
        ),
        pool.query(
          `SELECT COUNT(*) AS cnt
           FROM   verified_users
           WHERE  LOWER(email) = $1`,
          [emailNorm]
        ),
      ]);

      const prevAttempts = parseInt(sessionRows.rows[0].cnt, 10);
      const verifiedExists = parseInt(verifiedRows.rows[0].cnt, 10) > 0;

      if (verifiedExists) {
        riskFlags.verified_user_email_exists = true;
        riskScore += 40;
      }

      if (prevAttempts > 0) {
        riskFlags.duplicate_email = true;
        riskFlags.previous_email_attempts = prevAttempts;
        // Each retry adds some risk, capped at 30 extra points
        riskScore += Math.min(prevAttempts * 10, 30);
      }
    }

    // ── PAN number checks ─────────────────────────────────────────────────────
    if (panNumber) {
      const pan = panNumber.trim().toUpperCase();

      const [sessionRows, verifiedRows] = await Promise.all([
        pool.query(
          `SELECT COUNT(*) AS cnt
           FROM   onboarding_sessions
           WHERE  pan_number = $1
             AND  status NOT IN ('expired')`,
          [pan]
        ),
        pool.query(
          `SELECT COUNT(*) AS cnt
           FROM   verified_users
           WHERE  pan_number = $1`,
          [pan]
        ),
      ]);

      const prevAttempts = parseInt(sessionRows.rows[0].cnt, 10);
      const verifiedExists = parseInt(verifiedRows.rows[0].cnt, 10) > 0;

      if (verifiedExists) {
        riskFlags.verified_user_pan_exists = true;
        riskScore += 40;
      }

      if (prevAttempts > 0) {
        riskFlags.duplicate_pan = true;
        riskScore += 20;
      }
    }

    // ── Full-name + DOB combo check against verified users ───────────────────
    if (fullName && dob) {
      const { rows } = await pool.query(
        `SELECT COUNT(*) AS cnt
         FROM   verified_users
         WHERE  LOWER(full_name) = LOWER($1)
           AND  dob = $2`,
        [fullName.trim(), dob]
      );

      if (parseInt(rows[0].cnt, 10) > 0) {
        riskFlags.name_dob_match_verified = true;
        riskScore += 30;
      }
    }

    // ── Device fingerprint checks ─────────────────────────────────────────────
    if (deviceFingerprint) {
      const { rows } = await pool.query(
        `SELECT COUNT(*) AS cnt
         FROM   onboarding_sessions
         WHERE  device_fingerprint = $1
           AND  status NOT IN ('expired')`,
        [deviceFingerprint]
      );
      const prevDeviceAttempts = parseInt(rows[0].cnt, 10);
      if (prevDeviceAttempts > 0) {
        riskFlags.same_device_multiple_attempts = true;
        riskFlags.device_attempt_count = prevDeviceAttempts;
        // Each previous attempt from this device adds risk, capped at 30
        riskScore += Math.min(prevDeviceAttempts * 15, 30);
      }
    }

    // ── IP address checks — multiple distinct users from same IP ─────────────
    if (ipAddress) {
      const { rows } = await pool.query(
        `SELECT COUNT(DISTINCT LOWER(COALESCE(email, ''))) AS cnt
         FROM   onboarding_sessions
         WHERE  ip_address = $1
           AND  created_at > now() - INTERVAL '24 hours'
           AND  email IS NOT NULL`,
        [ipAddress]
      );
      const distinctEmails = parseInt(rows[0].cnt, 10);
      if (distinctEmails >= 3) {
        riskFlags.multiple_accounts_same_ip = true;
        riskFlags.ip_account_count = distinctEmails;
        riskScore += 20;
      }
    }

    // ── Submission speed — bot detection ────────────────────────────────────
    // A human takes at least 30 seconds to fill the form.
    // < 10s is almost certainly a bot / scripted submission.
    if (typeof submissionSpeedMs === "number") {
      if (submissionSpeedMs < 10_000) {
        riskFlags.bot_speed_suspected = true;
        riskFlags.submission_speed_ms = submissionSpeedMs;
        riskScore += 35;
      } else if (submissionSpeedMs < 30_000) {
        riskFlags.unusually_fast_submission = true;
        riskFlags.submission_speed_ms = submissionSpeedMs;
        riskScore += 15;
      }
    }

    return {
      riskFlags,
      riskScore: Math.min(Math.round(riskScore), 100),
    };
  }

  /**
   * 1. Run duplicate checks (identity + behavior signals)
   * 2. Insert a new onboarding_session row
   * 3. Return { sessionId, riskFlags, riskScore }
   */
  async createSession(formData, meta = {}) {
    const { riskFlags, riskScore } = await this.checkDuplicates({
      email: formData.email,
      panNumber: formData.panNumber,
      fullName: formData.fullName,
      dob: formData.dob,
      phone: formData.phone || null,
      deviceFingerprint: formData.deviceFingerprint || null,
      ipAddress: meta.ipAddress || null,
      submissionSpeedMs: formData.submissionSpeedMs ?? null,
    });

    const pan = formData.panNumber ? formData.panNumber.trim().toUpperCase() : null;
    const email = formData.email ? formData.email.trim().toLowerCase() : null;
    const dob = formData.dob || null;

    // Resolve permanent address — if user said "same as current", copy over
    const permanentSame = Boolean(formData.permanentSame);
    const permanentProvince = permanentSame
      ? formData.currentProvince
      : (formData.permanentProvince || null);
    const permanentDistrict = permanentSame
      ? formData.currentDistrict
      : (formData.permanentDistrict || null);
    const permanentMunicipality = permanentSame
      ? formData.currentMunicipality
      : (formData.permanentMunicipality || null);
    const permanentWard = permanentSame
      ? formData.currentWard
      : (formData.permanentWard || null);
    const permanentStreet = permanentSame
      ? (formData.currentStreet || null)
      : (formData.permanentStreet || null);

    // Compute retry count for this device
    let retryCount = 0;
    if (formData.deviceFingerprint) {
      const { rows: retryRows } = await pool.query(
        `SELECT COUNT(*) AS cnt FROM onboarding_sessions WHERE device_fingerprint = $1`,
        [formData.deviceFingerprint]
      );
      retryCount = parseInt(retryRows[0].cnt, 10);
    }

    const phone = formData.phone ? formData.phone.replace(/\s+/g, "") : null;

    const { rows } = await pool.query(
      `INSERT INTO onboarding_sessions (
          full_name, dob, gender, nationality,
          family_side, father_name, grandfather_name,
          mother_name, grandmother_name, marital_status,
          occupation, pan_number, email, phone_number,
          current_province, current_district, current_municipality,
          current_ward, current_street,
          permanent_province, permanent_district, permanent_municipality,
          permanent_ward, permanent_street,
          risk_score, risk_flags, status,
          device_fingerprint, ip_address, user_agent,
          submission_speed_ms, retry_count
        ) VALUES (
          $1,  $2,  $3,  $4,
          $5,  $6,  $7,
          $8,  $9,  $10,
          $11, $12, $13, $14,
          $15, $16, $17,
          $18, $19,
          $20, $21, $22,
          $23, $24,
          $25, $26::jsonb, 'step_1_complete',
          $27, $28, $29,
          $30, $31
        )
        RETURNING id`,
      [
        formData.fullName.trim(),
        dob,
        formData.gender || null,
        formData.nationality || null,
        formData.familySide || null,
        formData.fatherName || null,
        formData.grandfatherName || null,
        formData.motherName || null,
        formData.grandmotherName || null,
        formData.maritalStatus || null,
        formData.occupation || null,
        pan,
        email,
        phone,
        formData.currentProvince || null,
        formData.currentDistrict || null,
        formData.currentMunicipality || null,
        formData.currentWard || null,
        formData.currentStreet || null,
        permanentProvince,
        permanentDistrict,
        permanentMunicipality,
        permanentWard,
        permanentStreet,
        riskScore,
        JSON.stringify(riskFlags),
        formData.deviceFingerprint || null,
        meta.ipAddress || null,
        meta.userAgent || null,
        typeof formData.submissionSpeedMs === "number" ? formData.submissionSpeedMs : null,
        retryCount,
      ]
    );

    return {
      sessionId: rows[0].id,
      riskFlags,
      riskScore,
    };
  }

  /**
   * Fetch a session by ID (used by subsequent steps)
   */
  async getSession(sessionId) {
    const { rows } = await pool.query(
      `SELECT * FROM onboarding_sessions WHERE id = $1`,
      [sessionId]
    );
    return rows[0] || null;
  }

  /**
   * Update session status (called by later steps or admin actions)
   */
  async updateSessionStatus(sessionId, status) {
    await pool.query(
      `UPDATE onboarding_sessions SET status = $1 WHERE id = $2`,
      [status, sessionId]
    );
  }

  // ─── Step 2: Document processing ────────────────────────────────────────────

  /**
   * Send an image buffer to FastAPI as multipart form-data.
   * fieldName must match the FastAPI endpoint's File(...) parameter name.
   */
  async _callMLWithBuffer(endpoint, buffer, filename = "document.jpg") {
    const form = new FormData();
    form.append("image", buffer, { filename, contentType: "image/jpeg" });
    const response = await axios.post(`${ML_URL}${endpoint}`, form, {
      headers: form.getHeaders(),
      timeout: ML_TIMEOUT,
    });
    return response.data;
  }

  /**
   * Extract the most likely name from OCR extracted_fields.
   * Mistral OCR uses various key names depending on document type.
   */
  _extractOCRName(extractedFields = {}) {
    const candidates = [
      extractedFields.name,
      extractedFields.full_name,
      extractedFields.applicant_name,
      extractedFields.holder_name,
      extractedFields.owner_name,
    ];
    return (candidates.find((v) => v && typeof v === "string") || "").trim();
  }

  /**
   * Extract the document/ID number from OCR extracted_fields.
   */
  _extractOCRDocNumber(extractedFields = {}) {
    const candidates = [
      extractedFields.citizenship_number,
      extractedFields.citizenship_no,
      extractedFields.document_number,
      extractedFields.passport_number,
      extractedFields.license_number,
      extractedFields.id_number,
    ];
    return (candidates.find((v) => v && typeof v === "string") || "").trim();
  }

  /**
   * Crop the face photo from a document image using sharp.
   * photo_region is [x1, y1, x2, y2] from OCR.
   * Adds 10 % padding around the region for a better crop.
   * Returns a JPEG buffer, or null if region is invalid.
   */
  async _cropFaceFromDocument(imageBuffer, photoRegion) {
    if (!Array.isArray(photoRegion) || photoRegion.length < 4) return null;

    try {
      const [x1, y1, x2, y2] = photoRegion.map(Math.round);
      const rawW = x2 - x1;
      const rawH = y2 - y1;
      if (rawW <= 0 || rawH <= 0) return null;

      // Get actual image dimensions to clamp padding
      const meta = await sharp(imageBuffer).metadata();
      const imgW = meta.width || 9999;
      const imgH = meta.height || 9999;

      const padX = Math.round(rawW * 0.10);
      const padY = Math.round(rawH * 0.10);

      const left = Math.max(0, x1 - padX);
      const top = Math.max(0, y1 - padY);
      const width = Math.min(imgW - left, rawW + padX * 2);
      const height = Math.min(imgH - top, rawH + padY * 2);

      return await sharp(imageBuffer)
        .extract({ left, top, width, height })
        .jpeg({ quality: 90 })
        .toBuffer();
    } catch (err) {
      console.warn("[onboarding] Face crop failed:", err.message);
      return null;
    }
  }

  /**
   * Normalise a document number for comparison (strip spaces, dashes, uppercase).
   */
  _normaliseDocNum(v = "") {
    return v.replace(/[\s\-\.]/g, "").toUpperCase();
  }

  /**
   * Full Step 2 pipeline:
   * 1. Upload front (and optional back) image to Cloudinary
   * 2. Run forgery detection + OCR in parallel against FastAPI
   * 3. Crop face from OCR photo_region → upload to Cloudinary
   * 4. Fuzzy cross-check OCR name vs Step 1 full_name
   * 5. Exact cross-check OCR document number vs user-entered number
   * 6. Accumulate risk flags/score and UPDATE onboarding_session
   *
   * @param {string} sessionId
   * @param {{ frontBuffer, backBuffer?, documentType, documentNumber, documentIssuedDate, documentIssuedPlace }} payload
   * @returns {{ ocrData, forgeryDecision, riskFlags, riskScore }}
   */
  async processDocument(sessionId, payload) {
    const {
      frontBuffer,
      backBuffer,
      documentType,
      documentNumber,
      documentIssuedDate,
      documentIssuedPlace,
    } = payload;

    // ── 1. Fetch the existing session for name cross-check ───────────────────
    const session = await this.getSession(sessionId);
    if (!session) throw new Error("Session not found");

    const existingRiskScore = session.risk_score || 0;
    const existingRiskFlags = session.risk_flags || {};

    // ── 2. Upload images to Cloudinary ───────────────────────────────────────
    const folder = `kyc-documents/${sessionId}`;

    const [documentUrl, documentBackUrl] = await Promise.all([
      uploadBuffer(frontBuffer, { folder, publicId: `${sessionId}_front` }),
      backBuffer
        ? uploadBuffer(backBuffer, { folder, publicId: `${sessionId}_back` })
        : Promise.resolve(null),
    ]);

    // ── 3. Run forgery + OCR + face-extract in parallel ─────────────────────
    let forgeryResult = null;
    let ocrResult = null;
    let docFaceExtraction = null;

    const [forgeryOutcome, ocrOutcome, faceExtractOutcome] = await Promise.allSettled([
      this._callMLWithBuffer("/api/v1/forgery/verify", frontBuffer, "front.jpg"),
      this._callMLWithBuffer("/api/v1/ocr/extract", frontBuffer, "front.jpg"),
      this._callMLWithBuffer("/api/v1/face/extract", frontBuffer, "front.jpg"),
    ]);

    if (forgeryOutcome.status === "fulfilled") {
      forgeryResult = forgeryOutcome.value;
    } else {
      console.warn("[onboarding] Forgery service unavailable:", forgeryOutcome.reason?.message);
    }

    if (ocrOutcome.status === "fulfilled") {
      ocrResult = ocrOutcome.value;
    } else {
      console.warn("[onboarding] OCR service unavailable:", ocrOutcome.reason?.message);
    }

    if (faceExtractOutcome.status === "fulfilled") {
      docFaceExtraction = faceExtractOutcome.value;
    } else {
      console.warn("[onboarding] Face extract unavailable:", faceExtractOutcome.reason?.message);
    }

    // The submission_id returned by /face/extract links the stored embedding
    // to this session — used in Step 3 for selfie comparison.
    const kycSubmissionId = docFaceExtraction?.submission_id || null;

    // ── 4. Crop face from document photo_region ──────────────────────────────
    let documentFaceUrl = null;
    const photoRegion = ocrResult?.photo_region;
    if (photoRegion) {
      const faceCropBuffer = await this._cropFaceFromDocument(frontBuffer, photoRegion);
      if (faceCropBuffer) {
        try {
          documentFaceUrl = await uploadBuffer(faceCropBuffer, {
            folder,
            publicId: `${sessionId}_doc_face`,
          });
        } catch (err) {
          console.warn("[onboarding] Face crop upload failed:", err.message);
        }
      }
    }

    // ── 5. Extract OCR name + document number ────────────────────────────────
    const extractedFields = ocrResult?.extracted_fields || {};
    const ocrName = this._extractOCRName(extractedFields);
    const ocrDocNumber = this._extractOCRDocNumber(extractedFields);

    // ── 5b. Document number duplicate check ──────────────────────────────────
    // The canonical number to check is what the user entered (more reliable
    // than OCR which may have reading errors). We check against both tables.
    let docDupFlags = {};
    let docDupScore = 0;

    if (documentNumber) {
      const docNum = documentNumber.trim().toUpperCase();
      const [sessionRows, verifiedRows] = await Promise.all([
        pool.query(
          `SELECT COUNT(*) AS cnt
           FROM   onboarding_sessions
           WHERE  UPPER(document_number) = $1
             AND  id != $2
             AND  status NOT IN ('expired')`,
          [docNum, sessionId]
        ),
        pool.query(
          `SELECT COUNT(*) AS cnt
           FROM   verified_users
           WHERE  UPPER(document_number) = $1`,
          [docNum]
        ),
      ]);

      const prevAttempts = parseInt(sessionRows.rows[0].cnt, 10);
      const verifiedExists = parseInt(verifiedRows.rows[0].cnt, 10) > 0;

      if (verifiedExists) {
        docDupFlags.verified_user_document_exists = true;
        docDupScore += 50;
      }
      if (prevAttempts > 0) {
        docDupFlags.duplicate_document_number = true;
        docDupFlags.previous_document_attempts = prevAttempts;
        docDupScore += Math.min(prevAttempts * 15, 30);
      }
    }

    // ── 6. Risk assessment ───────────────────────────────────────────────────
    const addedFlags = {};
    let addedScore = 0;

    // Forgery decision
    const forgeryDecision = forgeryResult?.decision || "unknown";
    const forgeryScore = forgeryResult?.forgery_score ?? 0;

    if (forgeryDecision === "forged") {
      addedFlags.forgery_detected = true;
      addedFlags.forgery_score = forgeryScore;
      addedScore += 50;
    } else if (forgeryDecision === "suspicious") {
      addedFlags.forgery_suspicious = true;
      addedFlags.forgery_score = forgeryScore;
      addedScore += 20;
    }

    // Fuzzy name cross-check — OCR name vs Step 1 full_name
    if (ocrName && session.full_name) {
      const nameSimilarity = compareTwoStrings(
        ocrName.toLowerCase(),
        session.full_name.toLowerCase()
      );
      addedFlags.ocr_name_similarity = Math.round(nameSimilarity * 100);

      if (nameSimilarity < 0.50) {
        addedFlags.name_mismatch = true;
        addedScore += 30;
      } else if (nameSimilarity < 0.75) {
        addedFlags.name_partial_mismatch = true;
        addedScore += 15;
      }
    }

    // Exact document number cross-check — OCR vs user-entered
    if (ocrDocNumber && documentNumber) {
      const normOCR = this._normaliseDocNum(ocrDocNumber);
      const normUser = this._normaliseDocNum(documentNumber);
      if (normOCR !== normUser) {
        addedFlags.document_number_mismatch = true;
        addedFlags.ocr_document_number = ocrDocNumber;
        addedFlags.user_document_number = documentNumber;
        addedScore += 25;
      }
    }

    const newRiskScore = Math.min(
      Math.round(existingRiskScore + addedScore + docDupScore),
      100
    );
    const mergedRiskFlags = { ...existingRiskFlags, ...docDupFlags, ...addedFlags };

    // ── 7. Persist everything to onboarding_sessions ─────────────────────────
    await pool.query(
      `UPDATE onboarding_sessions SET
         document_type          = $1,
         document_number        = $2,
         document_issued_date   = $3,
         document_issued_place  = $4,
         document_url           = $5,
         document_back_url      = $6,
         document_face_url      = $7,
         ocr_result             = $8::jsonb,
         forgery_result         = $9::jsonb,
         ocr_name               = $10,
         ocr_document_number    = $11,
         risk_score             = $12,
         risk_flags             = $13::jsonb,
         kyc_submission_id      = $14,
         status                 = 'step_2_complete'
       WHERE id = $15`,
      [
        documentType || null,
        documentNumber || null,
        documentIssuedDate || null,
        documentIssuedPlace || null,
        documentUrl,
        documentBackUrl,
        documentFaceUrl,
        JSON.stringify(ocrResult || {}),
        JSON.stringify(forgeryResult || {}),
        ocrName || null,
        ocrDocNumber || null,
        newRiskScore,
        JSON.stringify(mergedRiskFlags),
        kycSubmissionId,
        sessionId,
      ]
    );

    return {
      ocrData: {
        name: ocrName || null,
        documentNumber: ocrDocNumber || null,
        documentType: ocrResult?.document_type || null,
        extractedFields,
        confidenceScore: ocrResult?.confidence_score ?? null,
        rawText: ocrResult?.raw_text || null,
      },
      forgeryDecision,
      forgeryScore,
      forgeryDetails: forgeryResult ? {
        suspicious_regions: forgeryResult.suspicious_regions || [],
        edge_consistency_score: forgeryResult.edge_consistency_score ?? null,
        noise_score: forgeryResult.noise_score ?? null,
        exif_anomaly_score: forgeryResult.exif_anomaly_score ?? null,
        copy_move_score: forgeryResult.copy_move_score ?? null,
        font_consistency_score: forgeryResult.font_consistency_score ?? null,
        processing_time_ms: forgeryResult.processing_time_ms ?? null,
        details: forgeryResult.details || {},
      } : null,
      documentUrl,
      documentFaceUrl,
      kycSubmissionId,
      riskFlags: mergedRiskFlags,
      riskScore: newRiskScore,
    };
  }

  // ─── Step 3: Selfie face matching ────────────────────────────────────────

  /**
   * Call FastAPI /face/compare with a selfie buffer + stored document submission_id.
   * Returns { similarity_score, is_match, face_found } or null on service failure.
   */
  async _compareFaceToDocument(selfieBuffer, kycSubmissionId, filename = "selfie.jpg") {
    const form = new FormData();
    form.append("selfie_image", selfieBuffer, { filename, contentType: "image/jpeg" });
    form.append("submission_id", kycSubmissionId);
    try {
      const response = await axios.post(`${ML_URL}/api/v1/face/compare`, form, {
        headers: form.getHeaders(),
        timeout: ML_TIMEOUT,
      });
      return response.data;
    } catch (err) {
      console.warn("[onboarding] Face compare failed:", err.message);
      return null;
    }
  }

  /**
   * Full Step 3 pipeline:
   * 1. Upload front/left/right selfie buffers to Cloudinary
   * 2. Compare front selfie against stored document embedding (via FastAPI)
   * 3. Calculate risk delta from similarity score
   * 4. UPDATE onboarding_session with selfie URLs, similarity, new risk
   *
   * @param {string} sessionId
   * @param {{ frontBuffer, leftBuffer?, rightBuffer? }} payload
   * @returns {{ selfieUrl, faceSimilarity, isMatch, riskFlags, riskScore }}
   */
  async processSelfie(sessionId, payload) {
    const { frontBuffer, leftBuffer, rightBuffer } = payload;

    const session = await this.getSession(sessionId);
    if (!session) throw new Error("Session not found");

    const existingRiskScore = session.risk_score || 0;
    const existingRiskFlags = session.risk_flags || {};
    const kycSubmissionId = session.kyc_submission_id || null;

    const folder = `kyc-selfies/${sessionId}`;

    // ── 1. Upload selfies to Cloudinary in parallel ──────────────────────────
    const [selfieUrl, selfieLeftUrl, selfieRightUrl] = await Promise.all([
      uploadBuffer(frontBuffer, { folder, publicId: `${sessionId}_selfie_front` }),
      leftBuffer
        ? uploadBuffer(leftBuffer, { folder, publicId: `${sessionId}_selfie_left` })
        : Promise.resolve(null),
      rightBuffer
        ? uploadBuffer(rightBuffer, { folder, publicId: `${sessionId}_selfie_right` })
        : Promise.resolve(null),
    ]);

    // ── 2. Face comparison: front selfie vs document embedding ───────────────
    let faceSimilarity = null;
    let faceFound = false;

    if (kycSubmissionId) {
      const compareResult = await this._compareFaceToDocument(
        frontBuffer,
        kycSubmissionId,
        "selfie_front.jpg"
      );
      if (compareResult) {
        faceSimilarity = compareResult.similarity_score ?? null;
        faceFound = compareResult.face_found ?? false;
      }
    } else {
      console.warn("[onboarding] No kyc_submission_id on session — skipping face compare");
    }

    // ── 3. Risk scoring ──────────────────────────────────────────────────────
    const addedFlags = {};
    let addedScore = 0;

    if (faceSimilarity !== null) {
      addedFlags.face_similarity = faceSimilarity;

      if (faceSimilarity < 0.50) {
        addedFlags.face_mismatch = true;
        addedScore += 50;
      } else if (faceSimilarity < 0.65) {
        addedFlags.face_uncertain = true;
        addedScore += 20;
      }
      // similarity >= 0.65 is a good match — no extra risk
    } else if (!kycSubmissionId) {
      addedFlags.face_comparison_skipped = true;
    } else if (!faceFound) {
      addedFlags.no_face_in_selfie = true;
      addedScore += 20;
    }

    // Liveness bonus: all 3 angles captured → slight risk reduction
    const hasAllAngles = Boolean(frontBuffer) && Boolean(leftBuffer) && Boolean(rightBuffer);
    if (hasAllAngles && faceSimilarity !== null && faceSimilarity >= 0.50) {
      addedScore -= 5; // liveness confirmed
      addedFlags.liveness_confirmed = true;
    }

    const newRiskScore = Math.min(Math.max(Math.round(existingRiskScore + addedScore), 0), 100);
    const mergedRiskFlags = { ...existingRiskFlags, ...addedFlags };

    // ── 4. Persist to onboarding_sessions ────────────────────────────────────
    await pool.query(
      `UPDATE onboarding_sessions SET
         selfie_url       = $1,
         selfie_left_url  = $2,
         selfie_right_url = $3,
         face_similarity  = $4,
         risk_score       = $5,
         risk_flags       = $6::jsonb,
         status           = 'submitted'
       WHERE id = $7`,
      [
        selfieUrl,
        selfieLeftUrl,
        selfieRightUrl,
        faceSimilarity,
        newRiskScore,
        JSON.stringify(mergedRiskFlags),
        sessionId,
      ]
    );

    return {
      selfieUrl,
      faceSimilarity,
      isMatch: faceSimilarity !== null ? faceSimilarity >= 0.65 : null,
      riskFlags: mergedRiskFlags,
      riskScore: newRiskScore,
    };
  }
}

module.exports = new OnboardingService();
