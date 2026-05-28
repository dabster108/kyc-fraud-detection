-- Enable pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- KYC submissions
CREATE TABLE IF NOT EXISTS kyc_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now(),
  status TEXT DEFAULT 'pending',
  risk_score FLOAT DEFAULT 0,
  document_type TEXT
);

-- Face embeddings
CREATE TABLE IF NOT EXISTS face_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID REFERENCES kyc_submissions(id) ON DELETE CASCADE,
  embedding vector(512),
  detection_confidence FLOAT,
  face_region JSONB,
  is_duplicate BOOLEAN DEFAULT false,
  matched_submission_id UUID REFERENCES kyc_submissions(id),
  id_image_url TEXT,
  face_image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Fast cosine similarity index
CREATE INDEX IF NOT EXISTS face_embeddings_vector_idx 
ON face_embeddings 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- OCR results
CREATE TABLE IF NOT EXISTS ocr_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID REFERENCES kyc_submissions(id) ON DELETE CASCADE,
  document_type TEXT,
  extracted_fields JSONB,
  confidence_score FLOAT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Forgery results
CREATE TABLE IF NOT EXISTS forgery_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID REFERENCES kyc_submissions(id) ON DELETE CASCADE,
  forgery_score FLOAT,
  decision TEXT,
  suspicious_regions JSONB,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
