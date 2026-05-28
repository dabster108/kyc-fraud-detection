-- Postgres function used by the Supabase REST client as a fallback when the
-- asyncpg pool is unavailable.  The function accepts a 512-dim query vector
-- and returns the closest matching face embedding that exceeds the similarity
-- threshold, together with the submission_id and creation timestamp.
--
-- Run once in your Supabase SQL editor (or via psql):
--   \i 002_match_face_embeddings_fn.sql

CREATE OR REPLACE FUNCTION match_face_embeddings(
    query_embedding  vector(512),
    similarity_threshold float  DEFAULT 0.6,
    match_count      int        DEFAULT 1
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
    FROM face_embeddings
    WHERE (1 - (embedding <=> query_embedding)) > similarity_threshold
    ORDER BY embedding <=> query_embedding
    LIMIT match_count;
$$;
