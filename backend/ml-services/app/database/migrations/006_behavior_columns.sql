-- Behavior / device fingerprinting columns for onboarding_sessions

ALTER TABLE onboarding_sessions
  ADD COLUMN IF NOT EXISTS device_fingerprint   TEXT,
  ADD COLUMN IF NOT EXISTS ip_address           TEXT,
  ADD COLUMN IF NOT EXISTS user_agent           TEXT,
  ADD COLUMN IF NOT EXISTS submission_speed_ms  INTEGER,
  ADD COLUMN IF NOT EXISTS retry_count          INTEGER DEFAULT 0;

-- Fast lookup: same device across multiple sessions
CREATE INDEX IF NOT EXISTS idx_onb_device_fp
  ON onboarding_sessions(device_fingerprint)
  WHERE device_fingerprint IS NOT NULL;

-- Fast lookup: multiple accounts from same IP
CREATE INDEX IF NOT EXISTS idx_onb_ip
  ON onboarding_sessions(ip_address)
  WHERE ip_address IS NOT NULL;
