-- Mark which face embeddings belong to fully approved/verified users.
-- Unverified (pending) embeddings are kept for selfie comparison during the
-- onboarding session, but are excluded from the identity-duplicate search.
--
-- Run once:
--   \i 008_face_verified_column.sql

ALTER TABLE face_embeddings
  ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT false;

-- Partial index so the verified-only similarity search stays fast
-- even as the pending-embeddings table grows.
CREATE INDEX IF NOT EXISTS idx_face_embeddings_verified
  ON face_embeddings (is_verified)
  WHERE is_verified = true;

-- ── Verified-only duplicate detection ────────────────────────────────────────
-- Replaces the original match_face_embeddings function.
-- Only matches against embeddings that belong to approved users.
CREATE OR REPLACE FUNCTION match_verified_face_embeddings(
    query_embedding      vector(512),
    similarity_threshold float  DEFAULT 0.6,
    match_count          int    DEFAULT 1
)
RETURNS TABLE (
    id                uuid,
    submission_id     uuid,
    similarity        float,
    created_at        timestamptz
)
LANGUAGE sql STABLE
AS $$
    SELECT
        id,
        submission_id,
        (1 - (embedding <=> query_embedding))::float AS similarity,
        created_at
    FROM  face_embeddings
    WHERE is_verified = true
      AND (1 - (embedding <=> query_embedding)) > similarity_threshold
    ORDER BY embedding <=> query_embedding
    LIMIT match_count;
$$;

-- ── Pending-face count (silent risk signal) ───────────────────────────────────
-- Returns the number of NOT-YET-verified submissions whose stored face is
-- similar to the query.  Used to inflate the risk score silently without
-- blocking the user.
CREATE OR REPLACE FUNCTION count_pending_face_matches(
    query_embedding      vector(512),
    similarity_threshold float  DEFAULT 0.6
)
RETURNS integer
LANGUAGE sql STABLE
AS $$
    SELECT COUNT(*)::integer
    FROM  face_embeddings
    WHERE is_verified = false
      AND (1 - (embedding <=> query_embedding)) > similarity_threshold;
$$;
