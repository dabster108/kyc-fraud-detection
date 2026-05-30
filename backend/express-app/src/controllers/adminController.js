const pool = require("../services/dbClient");
const settingsService = require("../services/settingsService");
const { mapOnboardingSession } = require("../utils/mapOnboardingSession");

function mapOptionsFromSettings(s) {
  return {
    highRiskThreshold: s.high_risk_threshold,
    faceMatchThreshold: s.face_match_threshold,
  };
}

/**
 * GET /api/v1/admin/submissions
 * All onboarding sessions (Supabase/Postgres), newest first.
 */
exports.getAllSubmissions = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 200, 500);
    const appSettings = await settingsService.getSettings();
    const mapOpts = mapOptionsFromSettings(appSettings);
    const { rows } = await pool.query(
      `SELECT *
       FROM   onboarding_sessions
       WHERE  status IS DISTINCT FROM 'expired'
       ORDER  BY updated_at DESC NULLS LAST, created_at DESC
       LIMIT  $1`,
      [limit]
    );

    return res.json({
      success: true,
      count: rows.length,
      submissions: rows.map((r) => mapOnboardingSession(r, mapOpts)).filter(Boolean),
      settings: await settingsService.getApiSettings(),
    });
  } catch (error) {
    console.error("[admin] getAllSubmissions error:", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * GET /api/v1/admin/submissions/pending
 * Returns all sessions with status 'submitted' ordered by risk_score desc.
 */
exports.getPendingSubmissions = async (req, res) => {
  try {
    const appSettings = await settingsService.getSettings();
    const mapOpts = mapOptionsFromSettings(appSettings);
    const { rows } = await pool.query(
      `SELECT *
       FROM   onboarding_sessions
       WHERE  status = 'submitted'
       ORDER  BY risk_score DESC, created_at ASC`
    );

    return res.json({
      success: true,
      count: rows.length,
      submissions: rows.map((r) => mapOnboardingSession(r, mapOpts)).filter(Boolean),
    });
  } catch (error) {
    console.error("[admin] getPendingSubmissions error:", error.message);
    return res.status(500).json({ error: error.message });
  }
};

/**
 * GET /api/v1/admin/submissions/:id
 * Returns full session detail for admin review.
 */
exports.getSubmissionDetails = async (req, res) => {
  try {
    const appSettings = await settingsService.getSettings();
    const mapOpts = mapOptionsFromSettings(appSettings);
    const { rows } = await pool.query(
      `SELECT * FROM onboarding_sessions WHERE id = $1`,
      [req.params.id]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, error: "Submission not found" });
    }

    return res.json({
      success: true,
      submission: mapOnboardingSession(rows[0], mapOpts),
      settings: await settingsService.getApiSettings(),
    });
  } catch (error) {
    console.error("[admin] getSubmissionDetails error:", error.message);
    return res.status(500).json({ error: error.message });
  }
};

/**
 * POST /api/v1/admin/submissions/:id/approve
 * Step 7: Moves verified data from onboarding_sessions → verified_users.
 * Body: { reviewedBy?: string, notes?: string }
 */
exports.approveSubmission = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { id } = req.params;
    const reviewedBy = req.body.reviewedBy || "admin";

    // 1. Fetch the session
    const { rows } = await client.query(
      `SELECT * FROM onboarding_sessions WHERE id = $1`,
      [id]
    );
    if (!rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ success: false, error: "Session not found" });
    }
    const s = rows[0];

    // 2. Insert into verified_users
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

    // 3. Mark session as approved
    await client.query(
      `UPDATE onboarding_sessions SET status = 'approved' WHERE id = $1`,
      [id]
    );

    // 4. Mark the face embedding as verified so future KYC attempts are
    //    checked against this person's face as a known verified identity.
    if (s.kyc_submission_id) {
      await client.query(
        `UPDATE face_embeddings SET is_verified = true WHERE submission_id = $1`,
        [s.kyc_submission_id]
      );
    }

    await client.query("COMMIT");

    return res.json({
      success: true,
      message: "Submission approved and user verified",
      submissionId: id,
      reviewedBy,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("[admin] approveSubmission error:", error.message);
    return res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
};

/**
 * POST /api/v1/admin/submissions/:id/reject
 * Body: { reason?: string, reviewedBy?: string }
 */
exports.rejectSubmission = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason, reviewedBy } = req.body;

    const { rowCount } = await pool.query(
      `UPDATE onboarding_sessions
       SET    status     = 'rejected',
              risk_flags = risk_flags || jsonb_build_object(
                             'rejection_reason', $1::text,
                             'rejected_by',      $2::text,
                             'rejected_at',      now()::text
                           )
       WHERE  id = $3`,
      [reason || null, reviewedBy || "admin", id]
    );

    if (!rowCount) {
      return res.status(404).json({ success: false, error: "Session not found" });
    }

    return res.json({
      success: true,
      message: "Submission rejected",
      submissionId: id,
      reason,
    });
  } catch (error) {
    console.error("[admin] rejectSubmission error:", error.message);
    return res.status(500).json({ error: error.message });
  }
};

/**
 * GET /api/v1/admin/metrics/dashboard
 */
exports.getSettings = async (req, res) => {
  try {
    const settings = await settingsService.getApiSettings();
    return res.json({ success: true, settings });
  } catch (error) {
    console.error("[admin] getSettings error:", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
};

exports.updateSettings = async (req, res) => {
  try {
    const { highRiskThreshold, duplicateFaceThreshold, faceMatchThreshold } =
      req.body || {};

    if (highRiskThreshold != null) {
      const n = Number(highRiskThreshold);
      if (!Number.isFinite(n) || n < 1 || n > 100) {
        return res.status(400).json({
          success: false,
          error: "highRiskThreshold must be between 1 and 100",
        });
      }
    }
    for (const val of [duplicateFaceThreshold, faceMatchThreshold]) {
      if (val != null) {
        const f = Number(val);
        if (!Number.isFinite(f) || f < 0.1 || f > 1) {
          return res.status(400).json({
            success: false,
            error: "Face thresholds must be between 0.1 and 1.0",
          });
        }
      }
    }

    const updated = await settingsService.updateSettings(req.body);
    return res.json({
      success: true,
      settings: {
        highRiskThreshold: updated.high_risk_threshold,
        duplicateFaceThreshold: updated.duplicate_face_threshold,
        faceMatchThreshold: updated.face_match_threshold,
      },
    });
  } catch (error) {
    console.error("[admin] updateSettings error:", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
};

exports.getDashboardMetrics = async (req, res) => {
  try {
    const { high_risk_threshold: highRisk } = await settingsService.getSettings();
    const { rows } = await pool.query(
      `SELECT
         COUNT(*)                                                 AS total_submissions,
         COUNT(*) FILTER (WHERE status = 'submitted')            AS pending_reviews,
         COUNT(*) FILTER (WHERE status = 'approved')             AS approved,
         COUNT(*) FILTER (WHERE status = 'rejected')             AS rejected,
         COUNT(*) FILTER (WHERE risk_score >= $1)                AS high_risk,
         ROUND(AVG(risk_score)::numeric, 1)                      AS avg_risk_score,
         COUNT(*) FILTER (WHERE risk_flags ? 'forgery_detected') AS forgery_flagged,
         COUNT(*) FILTER (WHERE risk_flags ? 'face_mismatch')    AS face_mismatch,
         COUNT(*) FILTER (WHERE risk_flags ? 'bot_speed_suspected') AS bot_suspected
       FROM onboarding_sessions`,
      [highRisk]
    );

    const m = rows[0];
    return res.json({
      success: true,
      metrics: {
        totalSubmissions:  parseInt(m.total_submissions,  10),
        pendingReviews:    parseInt(m.pending_reviews,    10),
        approved:          parseInt(m.approved,           10),
        rejected:          parseInt(m.rejected,           10),
        highRisk:          parseInt(m.high_risk,          10),
        averageRiskScore:  parseFloat(m.avg_risk_score)   || 0,
        forgeryFlagged:    parseInt(m.forgery_flagged,    10),
        faceMismatch:      parseInt(m.face_mismatch,      10),
        botSuspected:      parseInt(m.bot_suspected,      10),
      },
    });
  } catch (error) {
    console.error("[admin] getDashboardMetrics error:", error.message);
    return res.status(500).json({ error: error.message });
  }
};

/**
 * GET /api/v1/admin/audit-logs
 * Returns recent sessions ordered by created_at desc (lightweight audit trail).
 */
exports.getAuditLogs = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);

    const { rows } = await pool.query(
      `SELECT
         id, full_name, email, phone_number,
         document_type, document_number,
         status, risk_score,
         ip_address, device_fingerprint,
         created_at, updated_at
       FROM   onboarding_sessions
       ORDER  BY created_at DESC
       LIMIT  $1`,
      [limit]
    );

    return res.json({ success: true, logs: rows, total: rows.length });
  } catch (error) {
    console.error("[admin] getAuditLogs error:", error.message);
    return res.status(500).json({ error: error.message });
  }
};
