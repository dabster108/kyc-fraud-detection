/**
 * Admin API — all submission data from Postgres (onboarding_sessions), not localStorage.
 */

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "/api/v1";

async function parseJson(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || data.message || `Request failed (${res.status})`);
  }
  return data;
}

export async function fetchSubmissions({ limit = 200 } = {}) {
  const res = await fetch(`${API_BASE_URL}/admin/submissions?limit=${limit}`);
  const data = await parseJson(res);
  return data.submissions || [];
}

export async function fetchSubmissionById(id) {
  const res = await fetch(`${API_BASE_URL}/admin/submissions/${id}`);
  const data = await parseJson(res);
  return data.submission;
}

export async function approveSubmission(id, body = {}) {
  const res = await fetch(`${API_BASE_URL}/admin/submissions/${id}/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseJson(res);
}

export async function rejectSubmission(id, body = {}) {
  const res = await fetch(`${API_BASE_URL}/admin/submissions/${id}/reject`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseJson(res);
}

export async function fetchDashboardMetrics() {
  const res = await fetch(`${API_BASE_URL}/admin/metrics/dashboard`);
  const data = await parseJson(res);
  return data.metrics;
}
