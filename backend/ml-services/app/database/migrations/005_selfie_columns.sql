-- Step 3 selfie + face comparison columns for onboarding_sessions

ALTER TABLE onboarding_sessions
  ADD COLUMN IF NOT EXISTS selfie_url        TEXT,
  ADD COLUMN IF NOT EXISTS selfie_left_url   TEXT,
  ADD COLUMN IF NOT EXISTS selfie_right_url  TEXT,
  ADD COLUMN IF NOT EXISTS face_similarity   FLOAT;
