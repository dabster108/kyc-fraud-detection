-- Phone number column for onboarding_sessions + verified_users

ALTER TABLE onboarding_sessions
  ADD COLUMN IF NOT EXISTS phone_number TEXT;

ALTER TABLE verified_users
  ADD COLUMN IF NOT EXISTS phone_number TEXT;

CREATE INDEX IF NOT EXISTS idx_onb_phone
  ON onboarding_sessions(phone_number)
  WHERE phone_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_verified_phone
  ON verified_users(phone_number)
  WHERE phone_number IS NOT NULL;
