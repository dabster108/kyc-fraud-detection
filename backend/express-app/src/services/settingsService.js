const pool = require("./dbClient");

const DEFAULTS = {
  low_risk_threshold: 40,
  high_risk_threshold: 70,
  duplicate_face_threshold: 0.6,
  face_match_threshold: 0.65,
};

let cache = null;
let cacheAt = 0;
const CACHE_MS = 5000;

function parseValue(key, raw) {
  if (key === "duplicate_face_threshold" || key === "face_match_threshold") {
    return parseFloat(raw);
  }
  return parseInt(raw, 10);
}

function toApiShape(row) {
  return {
    lowRiskThreshold: row.low_risk_threshold,
    highRiskThreshold: row.high_risk_threshold,
    duplicateFaceThreshold: row.duplicate_face_threshold,
    faceMatchThreshold: row.face_match_threshold,
  };
}

class SettingsService {
  async getSettings({ fresh = false } = {}) {
    const now = Date.now();
    if (!fresh && cache && now - cacheAt < CACHE_MS) {
      return { ...cache };
    }

    const merged = { ...DEFAULTS };
    try {
      const { rows } = await pool.query(
        `SELECT key, value FROM app_settings`
      );
      for (const row of rows) {
        if (row.key in merged) {
          merged[row.key] = parseValue(row.key, row.value);
        }
      }
    } catch (err) {
      console.warn("[settings] Could not load app_settings:", err.message);
    }

    cache = merged;
    cacheAt = now;
    return { ...merged };
  }

  async updateSettings(updates) {
    const allowed = Object.keys(DEFAULTS);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const [apiKey, val] of Object.entries(updates)) {
        const dbKey =
          apiKey === "lowRiskThreshold"
            ? "low_risk_threshold"
            : apiKey === "highRiskThreshold"
              ? "high_risk_threshold"
              : apiKey === "duplicateFaceThreshold"
                ? "duplicate_face_threshold"
                : apiKey === "faceMatchThreshold"
                  ? "face_match_threshold"
                  : null;
        if (!dbKey || !allowed.includes(dbKey)) continue;
        const strVal = String(val);
        await client.query(
          `INSERT INTO app_settings (key, value, updated_at)
           VALUES ($1, $2, now())
           ON CONFLICT (key) DO UPDATE
             SET value = EXCLUDED.value, updated_at = now()`,
          [dbKey, strVal]
        );
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
    cache = null;
    return this.getSettings({ fresh: true });
  }

  async getApiSettings() {
    const row = await this.getSettings();
    return toApiShape(row);
  }
}

module.exports = new SettingsService();
