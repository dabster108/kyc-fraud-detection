/**
 * @deprecated Use lib/adminApi.js — kept for import compatibility only.
 */
export {
  fetchSubmissions as getStoredSubmissions,
  fetchSubmissionById as getSubmissionById,
} from "../../lib/adminApi";

export async function updateSubmissionStatus() {
  throw new Error(
    "updateSubmissionStatus is deprecated. Use approveSubmission/rejectSubmission from lib/adminApi.js"
  );
}

export function addSubmission() {
  throw new Error(
    "addSubmission is removed. Submissions are stored in Supabase via the onboarding API."
  );
}
