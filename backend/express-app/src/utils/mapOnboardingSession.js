function safeJson(value) {
  if (value == null) return {};
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function formatTimestamp(value) {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/**
 * Map onboarding_sessions DB row → shape expected by the admin UI.
 */
function mapOnboardingSession(row, options = {}) {
  if (!row) return null;

  const highRiskThreshold = options.highRiskThreshold ?? 70;
  const faceMatchThreshold = options.faceMatchThreshold ?? 0.65;

  const riskScore = Math.round(Number(row.risk_score) || 0);
  const riskFlags =
    typeof row.risk_flags === "object" && row.risk_flags !== null
      ? row.risk_flags
      : safeJson(row.risk_flags);

  let status = "Pending";
  if (row.status === "approved") status = "Approved";
  else if (row.status === "rejected") status = "Rejected";
  else if (riskScore >= highRiskThreshold) status = "Flagged";

  const forgeryResult = safeJson(row.forgery_result);
  const ocrResult = safeJson(row.ocr_result);

  const displayName =
    (row.full_name && String(row.full_name).trim()) ||
    row.ocr_name ||
    row.email ||
    row.phone_number ||
    "Incomplete session";

  return {
    id: row.id,
    sessionId: row.id,
    name: displayName,
    email: row.email || "",
    phone: row.phone_number || "",
    dob: row.dob,
    gender: row.gender,
    nationality: row.nationality,
    familySide: row.family_side,
    fatherName: row.father_name,
    grandfatherName: row.grandfather_name,
    motherName: row.mother_name,
    grandmotherName: row.grandmother_name,
    maritalStatus: row.marital_status,
    occupation: row.occupation,
    panNumber: row.pan_number,
    status,
    dbStatus: row.status,
    riskScore,
    riskFlags,
    faceSimilarity: row.face_similarity,
    faceIsMatch:
      row.face_similarity != null
        ? Number(row.face_similarity) >= faceMatchThreshold
        : null,
    submittedAt: formatTimestamp(row.updated_at || row.created_at),
    createdAt: row.created_at,
    channel: "Web",
    documentType: row.document_type,
    documentNumber: row.document_number,
    documentIssuedDate: row.document_issued_date,
    documentIssuedPlace: row.document_issued_place,
    documentUrl: row.document_url,
    documentBackUrl: row.document_back_url,
    documentFaceUrl: row.document_face_url,
    documentImage: row.document_url,
    documentBackImage: row.document_back_url,
    selfieUrl: row.selfie_url,
    selfieLeftUrl: row.selfie_left_url,
    selfieRightUrl: row.selfie_right_url,
    faceCaptures: {
      front: row.selfie_url || null,
      left: row.selfie_left_url || null,
      right: row.selfie_right_url || null,
    },
    ocrName: row.ocr_name,
    ocrDocumentNumber: row.ocr_document_number,
    ocrData: Object.keys(ocrResult).length
      ? {
          extractedFields: ocrResult.extracted_fields || ocrResult,
          documentType: ocrResult.document_type,
          confidenceScore: ocrResult.confidence_score,
          rawText: ocrResult.raw_text,
        }
      : null,
    forgeryDecision: forgeryResult.decision || null,
    forgeryScore: forgeryResult.forgery_score ?? null,
    forgeryDetails: Object.keys(forgeryResult).length ? forgeryResult : null,
    currentAddress: {
      province: row.current_province,
      district: row.current_district,
      municipality: row.current_municipality,
      ward: row.current_ward,
      street: row.current_street,
    },
    permanentAddress: {
      province: row.permanent_province,
      district: row.permanent_district,
      municipality: row.permanent_municipality,
      ward: row.permanent_ward,
      street: row.permanent_street,
    },
    deviceFingerprint: row.device_fingerprint,
    ipAddress: row.ip_address,
    userAgent: row.user_agent,
    submissionSpeedMs: row.submission_speed_ms,
    retryCount: row.retry_count,
    kycSubmissionId: row.kyc_submission_id,
    ocrEditComparison: riskFlags.ocr_edit_comparison || null,
  };
}

module.exports = { mapOnboardingSession, formatTimestamp };
