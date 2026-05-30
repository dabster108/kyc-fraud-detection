/**
 * Creates app_settings table and seeds default thresholds.
 * Run from repo root: node backend/express-app/scripts/apply_app_settings_migration.js
 */
const path = require("path");
const fs = require("fs");
require("dotenv").config({ path: path.join(__dirname, "../../../.env") });
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  const sqlPath = path.join(
    __dirname,
    "../../ml-services/app/database/migrations/009_app_settings.sql"
  );
  const sql = fs.readFileSync(sqlPath, "utf8");
  await pool.query(sql);
  const { rows } = await pool.query("SELECT key, value FROM app_settings ORDER BY key");
  console.log("app_settings ready:", rows);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
