-- Admin-configurable KYC thresholds (read by Express + ML services)

CREATE TABLE IF NOT EXISTS app_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO app_settings (key, value) VALUES
  ('high_risk_threshold', '70'),
  ('duplicate_face_threshold', '0.6'),
  ('face_match_threshold', '0.65')
ON CONFLICT (key) DO NOTHING;
