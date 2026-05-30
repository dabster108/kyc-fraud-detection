/**
 * API service for KYC backend communication
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api/v1";

export class APIError extends Error {
  constructor(message, status, data) {
    super(message);
    this.name = "APIError";
    this.status = status;
    this.data = data;
  }
}

async function handleResponse(response) {
  const data = await response.json().catch(() => null);
  
  if (!response.ok) {
    throw new APIError(
      data?.detail || `Request failed with status ${response.status}`,
      response.status,
      data
    );
  }
  
  return data;
}

/**
 * Submit KYC details to the backend
 */
export async function submitKYCDetails(formData) {
  const payload = {
    nationality: formData.nationality,
    fullName: formData.fullName,
    dob: formData.dob,
    gender: formData.gender,
    familySide: formData.familySide,
    fatherName: formData.fatherName || null,
    grandfatherName: formData.grandfatherName || null,
    motherName: formData.motherName || null,
    grandmotherName: formData.grandmotherName || null,
    maritalStatus: formData.maritalStatus,
    currentProvince: formData.currentProvince,
    currentDistrict: formData.currentDistrict,
    currentMunicipality: formData.currentMunicipality,
    currentWard: formData.currentWard,
    currentStreet: formData.currentStreet || null,
    permanentSame: formData.permanentSame,
    permanentProvince: formData.permanentSame ? null : formData.permanentProvince || null,
    permanentDistrict: formData.permanentSame ? null : formData.permanentDistrict || null,
    permanentMunicipality: formData.permanentSame ? null : formData.permanentMunicipality || null,
    permanentWard: formData.permanentSame ? null : formData.permanentWard || null,
    permanentStreet: formData.permanentSame ? null : formData.permanentStreet || null,
    occupation: formData.occupation,
    panNumber: formData.panNumber || null,
    email: formData.email || null,
    documentType: formData.documentType || null,
    documentNumber: formData.documentNumber || null,
    documentImage: formData.documentImage || null,
    faceCaptures: formData.faceCaptures || null,
    faceVideoUrl: formData.faceVideoUrl || null,
  };

  const response = await fetch(`${API_BASE_URL}/kyc/submit-details`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return handleResponse(response);
}

/**
 * Get KYC details by submission ID
 */
export async function getKYCDetails(submissionId) {
  const response = await fetch(`${API_BASE_URL}/kyc/details/${submissionId}`);
  return handleResponse(response);
}

/**
 * List all KYC submissions
 */
export async function listKYCSubmissions({ status, limit = 50, offset = 0 } = {}) {
  const params = new URLSearchParams();
  if (status) params.append("status", status);
  params.append("limit", limit.toString());
  params.append("offset", offset.toString());

  const response = await fetch(`${API_BASE_URL}/kyc/details?${params}`);
  return handleResponse(response);
}

/**
 * Update KYC submission status
 */
export async function updateKYCStatus(submissionId, newStatus) {
  const response = await fetch(
    `${API_BASE_URL}/kyc/details/${submissionId}/status`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    }
  );
  return handleResponse(response);
}
