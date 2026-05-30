-- Configurable low-risk band (auto-approve ceiling / admin "low" coloring)
INSERT INTO app_settings (key, value, updated_at)
VALUES ('low_risk_threshold', '40', now())
ON CONFLICT (key) DO NOTHING;
