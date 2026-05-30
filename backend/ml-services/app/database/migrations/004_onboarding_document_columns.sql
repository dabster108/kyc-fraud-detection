-- Step 2 document + analysis columns for onboarding_sessions

ALTER TABLE onboarding_sessions
  ADD COLUMN IF NOT EXISTS document_url           TEXT,
  ADD COLUMN IF NOT EXISTS document_back_url      TEXT,
  ADD COLUMN IF NOT EXISTS document_face_url      TEXT,
  ADD COLUMN IF NOT EXISTS ocr_result             JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS forgery_result         JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS ocr_name               TEXT,
  ADD COLUMN IF NOT EXISTS ocr_document_number    TEXT;

-- Forgery decision as a computed-friendly index
CREATE INDEX IF NOT EXISTS idx_onb_forgery_decision
  ON onboarding_sessions ((forgery_result->>'decision'))
  WHERE forgery_result IS NOT NULL AND forgery_result != '{}';
