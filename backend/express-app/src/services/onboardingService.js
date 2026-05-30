const pool = require("./dbClient");
const settingsService = require("./settingsService");
const { uploadBuffer } = require("./cloudinaryService");
const { compareTwoStrings } = require("string-similarity");
const FormData = require("form-data");
const axios = require("axios");
const sharp = require("sharp");

const ML_URL = process.env.ML_SERVICE_URL || "http://localhost:8000";
const ML_TIMEOUT = 45000;

/** Auto-reject floor (risk score 0–100); auto-approve uses low_risk_threshold from settings. */
const AUTO_REJECT_MIN_SCORE = 80;

class OnboardingService {
  /**
   * True duplicate = already in verified_users (approved identity).
   * Prior attempts in onboarding_sessions / extract_unofficial are counts only.
   */
  async _countOnboardingSessions(field, value, excludeSessionId = null) {
    const clauses = {
      phone: "phone_number = $1",
      email: "LOWER(email) = $1",
      pan: "pan_number = $1",
      document: "UPPER(REPLACE(REPLACE(REPLACE(document_number, ' ', ''), '-', ''), '.', '')) = $1",
    };
    const sql = clauses[field];
    if (!sql || !value) return 0;

    const params = [value];
    let query = `SELECT COUNT(*) AS cnt FROM onboarding_sessions WHERE ${sql} AND status NOT IN ('expired')`;
    if (excludeSessionId) {
      params.push(excludeSessionId);
      query += ` AND id != $${params.length}`;
    }
    const { rows } = await pool.query(query, params);
    return parseInt(rows[0].cnt, 10);
  }

  async _countExtractUnofficialDocNumber(documentNumber) {
    const norm = this._normaliseDocNum(documentNumber);
    if (!norm) return 0;
    try {
      const { rows } = await pool.query(
        `SELECT COUNT(*) AS cnt
         FROM   extract_unofficial
         WHERE  UPPER(REPLACE(REPLACE(REPLACE(
                  COALESCE(extracted_fields->>'citizenship_number', extracted_fields->>'document_number', ''),
                  ' ', ''), '-', ''), '.', '')) = $1`,
        [norm]
      );
      return parseInt(rows[0].cnt, 10);
    } catch {
      return 0;
    }
  }

  /**
   * Hard stop: citizenship / document number already belongs to an approved user.
   */
  async assertDocumentNotInVerifiedUsers(documentNumber) {
    if (!documentNumber?.trim()) return;

    const norm = this._normaliseDocNum(documentNumber);
    const { rows } = await pool.query(
      `SELECT COUNT(*) AS cnt FROM verified_users
       WHERE UPPER(REPLACE(REPLACE(REPLACE(document_number, ' ', ''), '-', ''), '.', '')) = $1`,
      [norm]
    );
    if (parseInt(rows[0].cnt, 10) > 0) {
      const err = new Error(
        "Records found in our userbase for this citizenship number. You cannot continue with this ID."
      );
      err.code = "VERIFIED_USER_EXISTS";
      throw err;
    }
  }

  /**
   * Document number risk: pending/session counts only (small bumps).
   * Verified-user duplicate is handled by assertDocumentNotInVerifiedUsers (hard block).
   */
  async assessDocumentNumberRisk(documentNumber, sessionId = null) {
    const flags = {};
    let score = 0;
    if (!documentNumber?.trim()) return { flags, score };

    const docNum = documentNumber.trim().toUpperCase();
    const norm = this._normaliseDocNum(docNum);

    const sessionCount = await this._countOnboardingSessions("document", norm, sessionId);
    if (sessionCount > 0) {
      flags.previous_document_attempts = sessionCount;
      flags.onboarding_session_doc_count = sessionCount;
      score += Math.min(sessionCount * 2, 8);
    }

    const unofficialCount = await this._countExtractUnofficialDocNumber(docNum);
    if (unofficialCount > 0) {
      flags.extract_unofficial_doc_count = unofficialCount;
      score += Math.min(unofficialCount * 1, 5);
    }

    return { flags, score };
  }

  /**
   * Phone: verified_users = duplicate; onboarding_sessions = count/risk only.
   */
  async assessPhoneRisk(phone, sessionId = null) {
    const flags = {};
    let score = 0;
    if (!phone) return { flags, score };

    const phoneNorm = phone.replace(/\s+/g, "");

    const { rows: verifiedRows } = await pool.query(
      `SELECT COUNT(*) AS cnt FROM verified_users WHERE phone_number = $1`,
      [phoneNorm]
    );
    if (parseInt(verifiedRows[0].cnt, 10) > 0) {
      flags.verified_user_phone_exists = true;
      score += 40;
    }

    const sessionCount = await this._countOnboardingSessions("phone", phoneNorm, sessionId);
    if (sessionCount > 0) {
      flags.previous_phone_attempts = sessionCount;
      flags.onboarding_session_phone_count = sessionCount;
      score += Math.min(sessionCount * 5, 20);
    }

    return { flags, score };
  }

  /**
   * Identity + behaviour signals. Hard duplicates only via verified_users
   * (citizenship/document number + phone). Other tables contribute counts only.
   */
  async checkDuplicates({ email, panNumber, phone, deviceFingerprint, ipAddress, submissionSpeedMs, sessionId }) {
    const riskFlags = {};
    let riskScore = 0;

    const norm = (v) => (v ? v.trim().toLowerCase() : null);

    if (phone) {
      const { flags, score } = await this.assessPhoneRisk(phone, sessionId);
      Object.assign(riskFlags, flags);
      riskScore += score;
    }

    if (email) {
      const emailNorm = norm(email);
      const sessionCount = await this._countOnboardingSessions("email", emailNorm, sessionId);
      if (sessionCount > 0) {
        riskFlags.previous_email_attempts = sessionCount;
        riskFlags.onboarding_session_email_count = sessionCount;
        riskScore += Math.min(sessionCount * 5, 20);
      }
    }

    if (panNumber) {
      const pan = panNumber.trim().toUpperCase();
      const sessionCount = await this._countOnboardingSessions("pan", pan, sessionId);
      if (sessionCount > 0) {
        riskFlags.previous_pan_attempts = sessionCount;
        riskFlags.onboarding_session_pan_count = sessionCount;
        riskScore += Math.min(sessionCount * 5, 15);
      }
    }

    // ── Device fingerprint checks (other sessions only — not the current one) ─
    if (deviceFingerprint) {
      const deviceParams = [deviceFingerprint];
      let deviceQuery = `SELECT COUNT(*) AS cnt
         FROM   onboarding_sessions
         WHERE  device_fingerprint = $1
           AND  status NOT IN ('expired')`;
      if (sessionId) {
        deviceParams.push(sessionId);
        deviceQuery += ` AND id != $${deviceParams.length}`;
      }
      const { rows } = await pool.query(deviceQuery, deviceParams);
      const prevDeviceAttempts = parseInt(rows[0].cnt, 10);
      if (prevDeviceAttempts > 0) {
        riskFlags.same_device_multiple_attempts = true;
        riskFlags.device_attempt_count = prevDeviceAttempts;
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
   * Send a single image buffer to FastAPI as multipart form-data.
   */
  async _callMLWithBuffer(endpoint, buffer, filename = "document.jpg", extraFields = {}) {
    const form = new FormData();
    form.append("image", buffer, { filename, contentType: "image/jpeg" });
    for (const [key, val] of Object.entries(extraFields)) {
      if (val != null) form.append(key, String(val));
    }
    const response = await axios.post(`${ML_URL}${endpoint}`, form, {
      headers: form.getHeaders(),
      timeout: ML_TIMEOUT,
    });
    return response.data;
  }

  /**
   * Send two image buffers (front + back) to the FastAPI dual-image OCR
   * endpoint for citizenship cards.  Field names must match the FastAPI
   * ``File(...)`` parameter names: ``front_image`` and ``back_image``.
   */
  async _callDualML(endpoint, frontBuffer, backBuffer) {
    const form = new FormData();
    form.append("front_image", frontBuffer, {
      filename: "front.jpg",
      contentType: "image/jpeg",
    });
    form.append("back_image", backBuffer, {
      filename: "back.jpg",
      contentType: "image/jpeg",
    });
    const response = await axios.post(`${ML_URL}${endpoint}`, form, {
      headers: form.getHeaders(),
      timeout: ML_TIMEOUT,
    });
    return response.data;
  }

  /**
   * Extract the most likely name from OCR extracted_fields.
   * Prefers English (Latin-script) names for cross-checking against the
   * Latin-script name the user typed.
   */
  _extractOCRName(extractedFields = {}) {
    const candidates = [
      extractedFields.full_name_english,   // citizenship / NID English
      extractedFields.full_name,            // driving license / generic
      extractedFields.applicant_name,
      extractedFields.holder_name,
      extractedFields.owner_name,
      extractedFields.full_name_nepali,     // fallback to Nepali if no English
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
      extractedFields.dl_number,
      extractedFields.nin,
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

    // ── 2. Cloudinary uploads + ML (forgery, OCR, face) in parallel ─────────
    const folder = `kyc-documents/${sessionId}`;

    let forgeryResult = null;
    let ocrResult = null;
    let docFaceExtraction = null;

    // Declared up-front because the face-extract block below accumulates into
    // them (document duplicate flags/score are finalised after the doc-number
    // check further down).
    let docDupFlags = {};
    let docDupScore = 0;

    const isCitizenship =
      documentType && documentType.toLowerCase() === "citizenship";
    const ocrPromise =
      isCitizenship && backBuffer
        ? this._callDualML("/api/v1/ocr/extract-citizenship", frontBuffer, backBuffer)
        : this._callMLWithBuffer("/api/v1/ocr/extract", frontBuffer, "front.jpg");

    const appSettings = await settingsService.getSettings();

    const [
      documentUrlOutcome,
      documentBackUrlOutcome,
      forgeryOutcome,
      ocrOutcome,
      faceExtractOutcome,
    ] = await Promise.allSettled([
      uploadBuffer(frontBuffer, { folder, publicId: `${sessionId}_front` }),
      backBuffer
        ? uploadBuffer(backBuffer, { folder, publicId: `${sessionId}_back` })
        : Promise.resolve(null),
      this._callMLWithBuffer("/api/v1/forgery/verify", frontBuffer, "front.jpg"),
      ocrPromise,
      this._callMLWithBuffer("/api/v1/face/extract", frontBuffer, "front.jpg", {
        similarity_threshold: appSettings.duplicate_face_threshold,
      }),
    ]);

    if (documentUrlOutcome.status === "rejected") {
      throw documentUrlOutcome.reason || new Error("Document upload failed");
    }
    const documentUrl = documentUrlOutcome.value;
    const documentBackUrl =
      documentBackUrlOutcome.status === "fulfilled"
        ? documentBackUrlOutcome.value
        : null;
    if (documentBackUrlOutcome.status === "rejected" && backBuffer) {
      console.warn(
        "[onboarding] Back image upload failed:",
        documentBackUrlOutcome.reason?.message
      );
    }

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

      // ── Face duplicate risk scoring ─────────────────────────────────────
      // Verified match: this face already belongs to an approved user.
      if (docFaceExtraction.is_duplicate && docFaceExtraction.duplicate_match) {
        docDupFlags.verified_face_exists = true;
        docDupFlags.verified_face_similarity = docFaceExtraction.duplicate_match.similarity_score;
        docDupScore += 40;
      }

      // Pending/unverified embeddings: count only (not a verified-user duplicate).
      const pendingCount = docFaceExtraction.pending_duplicate_count || 0;
      if (pendingCount > 0) {
        docDupFlags.pending_face_attempt_count = pendingCount;
        docDupFlags.onboarding_pending_face_count = pendingCount;
        docDupScore += Math.min(pendingCount * 2, 8);
      }
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

    const docToCheck = documentNumber || ocrDocNumber;
    if (docToCheck) {
      await this.assertDocumentNotInVerifiedUsers(docToCheck);
    }

    // ── 5b. Document number: pending attempt counts only (small risk bumps) ──
    if (docToCheck) {
      const docRisk = await this.assessDocumentNumberRisk(docToCheck, sessionId);
      docDupFlags = { ...docDupFlags, ...docRisk.flags };
      docDupScore += docRisk.score;
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
      // Mapped OCR values for pre-filling the Review/Edit personal-info form.
      prefill: this._ocrPrefill(ocrResult),
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
      documentBackUrl,
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
  async _compareFaceToDocument(
    selfieBuffer,
    kycSubmissionId,
    filename = "selfie.jpg",
    matchThreshold = 0.65
  ) {
    const form = new FormData();
    form.append("selfie_image", selfieBuffer, { filename, contentType: "image/jpeg" });
    form.append("submission_id", kycSubmissionId);
    form.append("match_threshold", String(matchThreshold));
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
    const {
      frontBuffer,
      leftBuffer,
      rightBuffer,
      livenessIsLive = null,
      livenessDecision = null,
      livenessConfidence = null,
    } = payload;

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

    const appSettings = await settingsService.getSettings();
    const matchThreshold = appSettings.face_match_threshold;
    const uncertainThreshold = Math.max(matchThreshold - 0.15, 0.35);

    if (kycSubmissionId) {
      const compareResult = await this._compareFaceToDocument(
        frontBuffer,
        kycSubmissionId,
        "selfie_front.jpg",
        matchThreshold
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

      if (faceSimilarity < uncertainThreshold) {
        addedFlags.face_mismatch = true;
        addedScore += 50;
      } else if (faceSimilarity < matchThreshold) {
        addedFlags.face_uncertain = true;
        addedScore += 20;
      }
    } else if (!kycSubmissionId) {
      addedFlags.face_comparison_skipped = true;
    } else if (!faceFound) {
      addedFlags.no_face_in_selfie = true;
      addedScore += 20;
    }

    // Liveness bonus: all 3 angles captured → slight risk reduction
    const hasAllAngles = Boolean(frontBuffer) && Boolean(leftBuffer) && Boolean(rightBuffer);
    if (hasAllAngles && faceSimilarity !== null && faceSimilarity >= uncertainThreshold) {
      addedScore -= 5; // liveness confirmed
      addedFlags.liveness_confirmed = true;
    }

    if (livenessIsLive === false) {
      addedFlags.liveness_failed = true;
      addedFlags.liveness_decision = livenessDecision || "SPOOF";
      if (livenessConfidence != null) {
        addedFlags.liveness_confidence = livenessConfidence;
      }
    } else if (livenessIsLive === true && livenessConfidence != null) {
      addedFlags.liveness_confidence = livenessConfidence;
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

    let decision;
    if (livenessIsLive === false) {
      decision = {
        outcome: "pending",
        status: "submitted",
        userMessage:
          "Your photos were saved, but liveness verification did not pass. Our team will review your application.",
        userReason: null,
      };
    } else {
      decision = await this.applyAutoDecision(
        sessionId,
        newRiskScore,
        mergedRiskFlags
      );
    }

    return {
      selfieUrl,
      faceSimilarity,
      isMatch: faceSimilarity !== null ? faceSimilarity >= matchThreshold : null,
      riskFlags: mergedRiskFlags,
      riskScore: newRiskScore,
      ...decision,
    };
  }

  /**
   * Plain-language rejection reason for the applicant (short, no jargon).
   */
  buildRejectionMessage(riskFlags = {}) {
    if (riskFlags.verified_user_document_exists) {
      return "This citizenship or ID number is already registered in our system.";
    }
    if (riskFlags.verified_face_exists) {
      return "This face is already linked to another verified account.";
    }
    if (riskFlags.face_mismatch) {
      return "Your selfie did not match the photo on your document.";
    }
    if (riskFlags.forgery_detected) {
      return "Your document could not be verified as authentic.";
    }
    if (riskFlags.forgery_suspicious) {
      return "Your document raised authenticity concerns we could not clear automatically.";
    }
    if (riskFlags.name_mismatch) {
      return "The name you entered does not match your document.";
    }
    if (riskFlags.document_number_mismatch) {
      return "The ID number you entered does not match your document.";
    }
    if (riskFlags.edited_name_mismatch || riskFlags.drastic_ocr_edit) {
      return "The details you entered differ too much from your document.";
    }
    if (riskFlags.bot_speed_suspected) {
      return "The application was completed too quickly to verify safely.";
    }
    return "Your application did not pass our automatic security checks.";
  }

  /**
   * Approve session and copy identity into verified_users (same as admin approve).
   */
  async approveSession(sessionId, reviewedBy = "system") {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query(
        `SELECT * FROM onboarding_sessions WHERE id = $1`,
        [sessionId]
      );
      if (!rows.length) throw new Error("Session not found");
      const s = rows[0];

      await client.query(
        `INSERT INTO verified_users (
           session_id, full_name, dob, gender, nationality,
           email, phone_number, pan_number, occupation,
           document_type, document_number,
           approved_at, approved_by
         ) VALUES (
           $1, $2, $3, $4, $5,
           $6, $7, $8, $9,
           $10, $11,
           now(), $12
         )
         ON CONFLICT DO NOTHING`,
        [
          s.id,
          s.full_name,
          s.dob,
          s.gender,
          s.nationality,
          s.email,
          s.phone_number,
          s.pan_number,
          s.occupation,
          s.document_type,
          s.document_number,
          reviewedBy,
        ]
      );

      await client.query(
        `UPDATE onboarding_sessions SET status = 'approved' WHERE id = $1`,
        [sessionId]
      );

      if (s.kyc_submission_id) {
        await client.query(
          `UPDATE face_embeddings SET is_verified = true WHERE submission_id = $1`,
          [s.kyc_submission_id]
        );
      }

      await client.query("COMMIT");
      return { status: "approved" };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Reject session with a stored reason for the applicant.
   */
  async rejectSession(sessionId, reason, reviewedBy = "system") {
    const { rowCount } = await pool.query(
      `UPDATE onboarding_sessions
       SET    status     = 'rejected',
              risk_flags = risk_flags || jsonb_build_object(
                             'rejection_reason', $1::text,
                             'rejected_by',      $2::text,
                             'rejected_at',      now()::text,
                             'auto_rejected',    true
                           )
       WHERE  id = $3`,
      [reason, reviewedBy, sessionId]
    );
    if (!rowCount) throw new Error("Session not found");
    return { status: "rejected", reason };
  }

  /**
   * After final risk score: auto-approve (≤ low threshold), auto-reject (≥80), else pending.
   */
  async applyAutoDecision(sessionId, riskScore, riskFlags = {}) {
    const score = Math.round(Number(riskScore) || 0);
    const { low_risk_threshold: lowMax = 40 } = await settingsService.getSettings();

    if (score <= lowMax) {
      await this.approveSession(sessionId, "auto-verify");
      return {
        outcome: "approved",
        status: "approved",
        userMessage:
          "Your identity has been verified. Your application is approved.",
        userReason: null,
      };
    }

    if (score >= AUTO_REJECT_MIN_SCORE) {
      const userReason = this.buildRejectionMessage(riskFlags);
      await this.rejectSession(sessionId, userReason, "auto-verify");
      return {
        outcome: "rejected",
        status: "rejected",
        userMessage: "We could not approve your application.",
        userReason,
      };
    }

    return {
      outcome: "pending",
      status: "submitted",
      userMessage:
        "Your application was submitted successfully. Our team will review it shortly.",
      userReason: null,
    };
  }

  // ─── Document-first flow helpers ─────────────────────────────────────────

  /**
   * Map OCR extracted_fields onto the front-end personal-info form keys so the
   * Review step can be pre-filled.
   *
   * Covers: fullName, dob, gender, fatherName, motherName, all address fields
   * (including province reverse-mapped from district), familySide (auto-set
   * from which parent name was extracted), maritalStatus (inferred from spouse
   * field), and nationality.
   */
  _ocrPrefill(ocrResult) {
    const f = ocrResult?.extracted_fields || {};
    const str = (v) => (v != null ? v.toString().trim() : "");
    const cap = (s) => {
      const t = str(s);
      return t ? t.charAt(0).toUpperCase() + t.slice(1).toLowerCase() : "";
    };

    // District → Province reverse map (must match the frontend <select> values
    // in PersonalInfoStep exactly).
    const DISTRICT_TO_PROVINCE = {
      Bhojpur:"Koshi",Dhankuta:"Koshi",Ilam:"Koshi",Jhapa:"Koshi",
      Khotang:"Koshi",Morang:"Koshi",Okhaldhunga:"Koshi",Panchthar:"Koshi",
      Sankhuwasabha:"Koshi",Solukhumbu:"Koshi",Sunsari:"Koshi",
      Taplejung:"Koshi",Terhathum:"Koshi",Udayapur:"Koshi",
      Bara:"Madhesh",Dhanusha:"Madhesh",Mahottari:"Madhesh",Parsa:"Madhesh",
      Rautahat:"Madhesh",Saptari:"Madhesh",Sarlahi:"Madhesh",Siraha:"Madhesh",
      Bhaktapur:"Bagmati",Chitwan:"Bagmati",Dhading:"Bagmati",Dolakha:"Bagmati",
      Kathmandu:"Bagmati",Kavrepalanchok:"Bagmati",Lalitpur:"Bagmati",
      Makwanpur:"Bagmati",Nuwakot:"Bagmati",Ramechhap:"Bagmati",
      Rasuwa:"Bagmati",Sindhuli:"Bagmati",Sindhupalchok:"Bagmati",
      Baglung:"Gandaki",Gorkha:"Gandaki",Kaski:"Gandaki",Lamjung:"Gandaki",
      Manang:"Gandaki",Mustang:"Gandaki",Myagdi:"Gandaki",Nawalpur:"Gandaki",
      Parbat:"Gandaki",Syangja:"Gandaki",Tanahun:"Gandaki",
      Arghakhanchi:"Lumbini",Banke:"Lumbini",Bardiya:"Lumbini",Dang:"Lumbini",
      "Eastern Rukum":"Lumbini",Gulmi:"Lumbini",Kapilvastu:"Lumbini",
      Palpa:"Lumbini",Parasi:"Lumbini",Pyuthan:"Lumbini",Rolpa:"Lumbini",
      Rupandehi:"Lumbini",
      Dailekh:"Karnali",Dolpa:"Karnali",Humla:"Karnali",Jajarkot:"Karnali",
      Jumla:"Karnali",Kalikot:"Karnali",Mugu:"Karnali",Salyan:"Karnali",
      Surkhet:"Karnali","Western Rukum":"Karnali",
      Achham:"Sudurpashchim",Baitadi:"Sudurpashchim",Bajhang:"Sudurpashchim",
      Bajura:"Sudurpashchim",Dadeldhura:"Sudurpashchim",Darchula:"Sudurpashchim",
      Doti:"Sudurpashchim",Kailali:"Sudurpashchim",Kanchanpur:"Sudurpashchim",
    };

    // Fuzzy-match an OCR district name against the known dropdown values.
    // Returns the matching dropdown value, or the original string if no match.
    const matchDistrict = (ocrVal) => {
      if (!ocrVal) return "";
      const lower = ocrVal.toLowerCase();
      const exact = Object.keys(DISTRICT_TO_PROVINCE).find(
        (d) => d.toLowerCase() === lower
      );
      if (exact) return exact;
      // Try substring / prefix match (e.g. "Kanchanpur" from "Kanchanpur District")
      const partial = Object.keys(DISTRICT_TO_PROVINCE).find(
        (d) => lower.includes(d.toLowerCase()) || d.toLowerCase().includes(lower)
      );
      return partial || ocrVal;
    };

    const rawDistrict = str(
      f.permanent_address_district_english || f.permanent_address_district
    );
    const district = matchDistrict(rawDistrict);
    const province = DISTRICT_TO_PROVINCE[district] || "";

    const fatherName = str(f.father_name_english || f.father_name_nepali);
    const motherName = str(f.mother_name_english || f.mother_name_nepali);

    // Auto-detect family side: if father's name is present pick father's side
    let familySide = "";
    if (fatherName) familySide = "Father's side";
    else if (motherName) familySide = "Mother's side";

    // Infer marital status from spouse field
    let maritalStatus = "";
    const spouseVal = str(f.spouse_name_english || f.spouse_name_nepali);
    if (!spouseVal) maritalStatus = "Single";

    const slashDate = (raw) => {
      const v = str(raw);
      if (!v) return "";
      return v.replace(/-/g, "/");
    };

    const prefill = {
      fullName: str(f.full_name_english || f.full_name || f.full_name_nepali),
      dob: slashDate(f.date_of_birth_ad),
      gender: cap(f.gender),
      nationality: ocrResult?.document_type === "citizenship"
        ? "Nepali"
        : (str(f.nationality) || ""),
      familySide,
      fatherName,
      motherName,
      maritalStatus,
      // Permanent address (from the document)
      permanentProvince: province,
      permanentDistrict: district,
      permanentMunicipality: str(
        f.permanent_address_municipality_english || f.permanent_address_municipality
      ),
      permanentWard: str(f.permanent_address_ward_number || f.ward_number),
      // Pre-fill current address with the same values (user can change later)
      currentProvince: province,
      currentDistrict: district,
      currentMunicipality: str(
        f.permanent_address_municipality_english || f.permanent_address_municipality
      ),
      currentWard: str(f.permanent_address_ward_number || f.ward_number),
      // Document metadata (reviewed/edited in Step 2)
      documentNumber: str(
        f.citizenship_number || f.dl_number || f.nin || f.document_number
      ),
      documentIssuedDate: slashDate(
        f.issued_date_bs || f.issued_date_ad || f.date_of_issue
      ),
      documentIssuedPlace: str(
        f.issued_district_english || f.issued_district
      ),
    };

    // Drop empty/null values so we never overwrite existing user input.
    return Object.fromEntries(
      Object.entries(prefill).filter(([, v]) => v !== "" && v != null)
    );
  }

  /**
   * Fuzzy/exact comparison between the values OCR extracted from the document
   * (the baseline) and the values the user submitted after editing.
   *
   * This is the anti-tamper "catch": OCR is allowed to be imperfect, so small
   * corrections are fine — but a drastic divergence between what the document
   * says and what the user typed is a fraud signal that raises the risk score.
   *
   * @returns {{ flags: object, score: number, diffs: Array }}
   */
  compareOcrVsEdited(ocrResult, formData = {}) {
    const f = ocrResult?.extracted_fields || {};
    const flags = {};
    const diffs = [];
    let score = 0;

    const clean = (v) => (v == null ? "" : v.toString().trim());

    // ── Full name (fuzzy) ────────────────────────────────────────────────
    const ocrName = clean(f.full_name_english || f.full_name);
    const userName = clean(formData.fullName);
    if (ocrName && userName) {
      const sim = compareTwoStrings(ocrName.toLowerCase(), userName.toLowerCase());
      const pct = Math.round(sim * 100);
      diffs.push({ field: "fullName", ocr: ocrName, edited: userName, similarity: pct });
      flags.edited_name_similarity = pct;
      if (sim < 0.5) {
        flags.edited_name_mismatch = true;
        score += 30;
      } else if (sim < 0.8) {
        flags.edited_name_minor_change = true;
        score += 10;
      }
    }

    // ── Date of birth (exact AD date) ────────────────────────────────────
    const normDate = (v) => clean(v).replace(/\//g, "-");
    const ocrDob = normDate(f.date_of_birth_ad);
    const userDob = normDate(formData.dob);
    if (ocrDob && userDob && ocrDob !== userDob) {
      flags.edited_dob_mismatch = true;
      flags.ocr_dob = ocrDob;
      flags.user_dob = userDob;
      score += 25;
      diffs.push({ field: "dob", ocr: ocrDob, edited: userDob, similarity: 0 });
    }

    // ── Gender (exact, case-insensitive) ─────────────────────────────────
    const ocrGender = clean(f.gender).toLowerCase();
    const userGender = clean(formData.gender).toLowerCase();
    if (ocrGender && userGender && ocrGender !== userGender) {
      flags.edited_gender_mismatch = true;
      score += 15;
      diffs.push({ field: "gender", ocr: ocrGender, edited: userGender, similarity: 0 });
    }

    // ── Permanent district (fuzzy) ───────────────────────────────────────
    const ocrDistrict = clean(
      f.permanent_address_district_english || f.permanent_address_district
    );
    const userDistrict = clean(
      formData.permanentSame ? formData.currentDistrict : formData.permanentDistrict
    );
    if (ocrDistrict && userDistrict) {
      const sim = compareTwoStrings(ocrDistrict.toLowerCase(), userDistrict.toLowerCase());
      diffs.push({
        field: "permanentDistrict",
        ocr: ocrDistrict,
        edited: userDistrict,
        similarity: Math.round(sim * 100),
      });
      if (sim < 0.6) {
        flags.edited_district_mismatch = true;
        score += 15;
      }
    }

    // ── Permanent ward (exact) ───────────────────────────────────────────
    const ocrWard = clean(f.permanent_address_ward_number || f.ward_number);
    const userWard = clean(
      formData.permanentSame ? formData.currentWard : formData.permanentWard
    );
    if (ocrWard && userWard && ocrWard !== userWard) {
      flags.edited_ward_mismatch = true;
      score += 10;
      diffs.push({ field: "permanentWard", ocr: ocrWard, edited: userWard, similarity: 0 });
    }

    // ── Father's name (fuzzy — only compared when family side matches) ───
    const ocrFather = clean(f.father_name_english || f.father_name_nepali);
    const userFather = clean(formData.fatherName);
    if (ocrFather && userFather && formData.familySide === "Father's side") {
      const sim = compareTwoStrings(ocrFather.toLowerCase(), userFather.toLowerCase());
      const pct = Math.round(sim * 100);
      diffs.push({ field: "fatherName", ocr: ocrFather, edited: userFather, similarity: pct });
      flags.edited_father_name_similarity = pct;
      if (sim < 0.5) {
        flags.edited_father_name_mismatch = true;
        score += 20;
      } else if (sim < 0.8) {
        flags.edited_father_name_minor_change = true;
        score += 5;
      }
    }

    // ── Mother's name (fuzzy — only when mother's side is chosen) ────────
    const ocrMother = clean(f.mother_name_english || f.mother_name_nepali);
    const userMother = clean(formData.motherName);
    if (ocrMother && userMother && formData.familySide === "Mother's side") {
      const sim = compareTwoStrings(ocrMother.toLowerCase(), userMother.toLowerCase());
      const pct = Math.round(sim * 100);
      diffs.push({ field: "motherName", ocr: ocrMother, edited: userMother, similarity: pct });
      flags.edited_mother_name_similarity = pct;
      if (sim < 0.5) {
        flags.edited_mother_name_mismatch = true;
        score += 20;
      } else if (sim < 0.8) {
        flags.edited_mother_name_minor_change = true;
        score += 5;
      }
    }

    // ── Document number (exact, normalised) ──────────────────────────────
    const ocrDocNum = this._normaliseDocNum(this._extractOCRDocNumber(f));
    const userDocNum = this._normaliseDocNum(formData.documentNumber);
    if (ocrDocNum && userDocNum && ocrDocNum !== userDocNum) {
      flags.edited_document_number_mismatch = true;
      flags.ocr_document_number = this._extractOCRDocNumber(f);
      flags.user_document_number = formData.documentNumber;
      score += 25;
      diffs.push({
        field: "documentNumber",
        ocr: this._extractOCRDocNumber(f),
        edited: formData.documentNumber,
        similarity: 0,
      });
    }

    // ── Drastic overall edit signal ──────────────────────────────────────
    const drasticFieldCount = [
      flags.edited_name_mismatch,
      flags.edited_dob_mismatch,
      flags.edited_gender_mismatch,
      flags.edited_district_mismatch,
      flags.edited_ward_mismatch,
      flags.edited_father_name_mismatch,
      flags.edited_mother_name_mismatch,
      flags.edited_document_number_mismatch,
    ].filter(Boolean).length;

    if (flags.edited_name_mismatch || drasticFieldCount >= 2) {
      flags.drastic_ocr_edit = true;
    }

    return { flags, score: Math.min(Math.round(score), 100), diffs };
  }

  /**
   * Create an empty onboarding_session BEFORE any personal info is known.
   * Used by the document-first flow where Step 1 is the document upload.
   * `full_name` is NOT NULL in the schema, so it is seeded with an empty
   * string and back-filled in `submitPersonalInfo`.
   */
  async createSessionShell(meta = {}) {
    const { rows } = await pool.query(
      `INSERT INTO onboarding_sessions (full_name, risk_score, risk_flags, status,
          device_fingerprint, ip_address, user_agent)
       VALUES ('', 0, '{}'::jsonb, 'step_1_document', $1, $2, $3)
       RETURNING id`,
      [
        meta.deviceFingerprint || null,
        meta.ipAddress || null,
        meta.userAgent || null,
      ]
    );
    return rows[0].id;
  }

  /**
   * Document-first Step 2: persist the (OCR-prefilled, user-edited) personal
   * info, run identity duplicate checks, and run the OCR-vs-edit tamper check.
   * Accumulates onto the risk already gathered during the document step.
   *
   * @returns {{ riskFlags, riskScore, editComparison }}
   */
  async submitPersonalInfo(sessionId, formData, meta = {}) {
    const session = await this.getSession(sessionId);
    if (!session) throw new Error("Session not found");

    if (formData.documentNumber) {
      await this.assertDocumentNotInVerifiedUsers(formData.documentNumber);
    }

    const existingRiskScore = session.risk_score || 0;
    const existingRiskFlags = session.risk_flags || {};

    // ── Identity + behaviour duplicate checks (moved here from createSession,
    //    because in the document-first flow these fields only exist now) ────
    const { riskFlags: dupFlags, riskScore: dupScore } = await this.checkDuplicates({
      email: formData.email,
      panNumber: formData.panNumber,
      phone: formData.phone || null,
      deviceFingerprint: formData.deviceFingerprint || session.device_fingerprint || null,
      ipAddress: meta.ipAddress || null,
      submissionSpeedMs: formData.submissionSpeedMs ?? null,
      sessionId,
    });

    // ── OCR-vs-edit tamper check ─────────────────────────────────────────
    const editComparison = this.compareOcrVsEdited(session.ocr_result, formData);

    // ── Document number (citizenship): verified duplicate + attempt counts ───
    let docDupFlags = {};
    let docDupScore = 0;
    if (formData.documentNumber) {
      const docRisk = await this.assessDocumentNumberRisk(formData.documentNumber, sessionId);
      docDupFlags = docRisk.flags;
      docDupScore = docRisk.score;
    }

    const mergedRiskFlags = {
      ...existingRiskFlags,
      ...dupFlags,
      ...editComparison.flags,
      ...docDupFlags,
      ocr_edit_comparison: {
        flags: editComparison.flags,
        score: editComparison.score,
      },
    };
    const newRiskScore = Math.min(
      Math.round(existingRiskScore + dupScore + editComparison.score + docDupScore),
      100
    );

    // ── Resolve permanent address (respect "same as current") ────────────
    const permanentSame = Boolean(formData.permanentSame);
    const pick = (perm, curr) => (permanentSame ? curr : perm);

    const pan = formData.panNumber ? formData.panNumber.trim().toUpperCase() : null;
    const email = formData.email ? formData.email.trim().toLowerCase() : null;
    const phone = formData.phone ? formData.phone.replace(/\s+/g, "") : null;

    await pool.query(
      `UPDATE onboarding_sessions SET
         full_name = $1, dob = $2, gender = $3, nationality = $4,
         family_side = $5, father_name = $6, grandfather_name = $7,
         mother_name = $8, grandmother_name = $9, marital_status = $10,
         occupation = $11, pan_number = $12, email = $13, phone_number = $14,
         current_province = $15, current_district = $16, current_municipality = $17,
         current_ward = $18, current_street = $19,
         permanent_province = $20, permanent_district = $21, permanent_municipality = $22,
         permanent_ward = $23, permanent_street = $24,
         document_number = $25, document_issued_date = $26, document_issued_place = $27,
         document_type = COALESCE($28, document_type),
         risk_score = $29, risk_flags = $30::jsonb, status = 'step_2_complete'
       WHERE id = $31`,
      [
        (formData.fullName || "").trim(),
        formData.dob ? String(formData.dob).trim().replace(/\//g, "-") : null,
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
        pick(formData.permanentProvince, formData.currentProvince) || null,
        pick(formData.permanentDistrict, formData.currentDistrict) || null,
        pick(formData.permanentMunicipality, formData.currentMunicipality) || null,
        pick(formData.permanentWard, formData.currentWard) || null,
        pick(formData.permanentStreet, formData.currentStreet) || null,
        formData.documentNumber?.trim() || null,
        formData.documentIssuedDate
          ? String(formData.documentIssuedDate).trim().replace(/\//g, "-")
          : null,
        formData.documentIssuedPlace?.trim() || null,
        formData.documentType || session.document_type || null,
        newRiskScore,
        JSON.stringify(mergedRiskFlags),
        sessionId,
      ]
    );

    return {
      riskFlags: mergedRiskFlags,
      riskScore: newRiskScore,
      editComparison,
    };
  }
}

module.exports = new OnboardingService();
