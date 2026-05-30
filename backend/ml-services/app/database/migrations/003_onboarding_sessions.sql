-- Temporary onboarding sessions table
-- Holds ALL KYC attempts (incomplete, pending, submitted) — NOT the final verified users table
CREATE TABLE IF NOT EXISTS onboarding_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Step 1: Personal info
  full_name        TEXT NOT NULL,
  dob              DATE,
  gender           TEXT,
  nationality      TEXT,
  family_side      TEXT,
  father_name      TEXT,
  grandfather_name TEXT,
  mother_name      TEXT,
  grandmother_name TEXT,
  marital_status   TEXT,
  occupation       TEXT,
  pan_number       TEXT,
  email            TEXT,

  -- Step 1: Current address
  current_province     TEXT,
  current_district     TEXT,
  current_municipality TEXT,
  current_ward         TEXT,
  current_street       TEXT,

  -- Step 1: Permanent address
  permanent_province     TEXT,
  permanent_district     TEXT,
  permanent_municipality TEXT,
  permanent_ward         TEXT,
  permanent_street       TEXT,

  -- Step 2: Document info (filled later)
  document_type        TEXT,
  document_number      TEXT,
  document_issued_date DATE,
  document_issued_place TEXT,

  -- Step 2: KYC submission reference (linked when Step 2 completes)
  kyc_submission_id UUID REFERENCES kyc_submissions(id),

  -- Risk assessment (populated at Step 1 duplicate check)
  risk_score FLOAT   DEFAULT 0,
  risk_flags JSONB   DEFAULT '{}',

  -- Session lifecycle
  -- step_1_complete | step_2_complete | submitted | approved | rejected | expired
  status TEXT DEFAULT 'step_1_complete',

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT (now() + INTERVAL '24 hours')
);

-- Fast duplicate-check indexes
CREATE INDEX IF NOT EXISTS idx_onb_email
  ON onboarding_sessions(LOWER(email))
  WHERE email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_onb_pan
  ON onboarding_sessions(pan_number)
  WHERE pan_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_onb_status
  ON onboarding_sessions(status);

CREATE INDEX IF NOT EXISTS idx_onb_name_dob
  ON onboarding_sessions(LOWER(full_name), dob);

-- auto-update updated_at on row change
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_onboarding_sessions_updated_at ON onboarding_sessions;
CREATE TRIGGER trg_onboarding_sessions_updated_at
  BEFORE UPDATE ON onboarding_sessions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- Verified users table — ONLY approved, fully verified users land here
CREATE TABLE IF NOT EXISTS verified_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  session_id UUID REFERENCES onboarding_sessions(id),

  full_name      TEXT NOT NULL,
  dob            DATE,
  gender         TEXT,
  nationality    TEXT,
  email          TEXT,
  pan_number     TEXT,
  occupation     TEXT,

  document_type   TEXT,
  document_number TEXT,

  approved_at  TIMESTAMPTZ DEFAULT now(),
  approved_by  TEXT   -- admin user reference
);

-- Unique constraints so one person can't get verified twice
CREATE UNIQUE INDEX IF NOT EXISTS idx_verified_email
  ON verified_users(LOWER(email))
  WHERE email IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_verified_pan
  ON verified_users(pan_number)
  WHERE pan_number IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_verified_document
  ON verified_users(document_number)
  WHERE document_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_verified_name_dob
  ON verified_users(LOWER(full_name), dob);
