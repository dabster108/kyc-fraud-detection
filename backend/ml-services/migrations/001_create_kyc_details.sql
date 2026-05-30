-- KYC Details Table
-- Run this SQL in your Supabase SQL Editor: https://supabase.com/dashboard

-- Create enum types for constrained fields
CREATE TYPE gender_type AS ENUM ('Male', 'Female', 'Other');
CREATE TYPE family_side_type AS ENUM ('Father''s side', 'Mother''s side');
CREATE TYPE marital_status_type AS ENUM ('Single', 'Married', 'Divorced', 'Widowed');
CREATE TYPE kyc_status_type AS ENUM ('Pending', 'Approved', 'Rejected', 'Under Review');
CREATE TYPE province_type AS ENUM ('Koshi', 'Madhesh', 'Bagmati', 'Gandaki', 'Lumbini', 'Karnali', 'Sudurpashchim');

-- Main KYC Details Table
CREATE TABLE IF NOT EXISTS kyc_details (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id VARCHAR(50) UNIQUE NOT NULL,
    
    -- Section 1: Residence & Identity (Personal Details)
    nationality VARCHAR(100) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    date_of_birth DATE NOT NULL,
    gender gender_type NOT NULL,
    
    -- Section 2: Family Information
    family_side family_side_type NOT NULL,
    father_name VARCHAR(255),
    grandfather_name VARCHAR(255),
    mother_name VARCHAR(255),
    grandmother_name VARCHAR(255),
    marital_status marital_status_type NOT NULL,
    
    -- Section 3: Current Address
    current_province province_type NOT NULL,
    current_district VARCHAR(100) NOT NULL,
    current_municipality VARCHAR(255) NOT NULL,
    current_ward VARCHAR(20) NOT NULL,
    current_street VARCHAR(255),
    
    -- Section 4: Permanent Address
    permanent_same_as_current BOOLEAN DEFAULT FALSE,
    permanent_province province_type,
    permanent_district VARCHAR(100),
    permanent_municipality VARCHAR(255),
    permanent_ward VARCHAR(20),
    permanent_street VARCHAR(255),
    
    -- Other Information
    occupation VARCHAR(255) NOT NULL,
    pan_number VARCHAR(50),
    email VARCHAR(255),
    
    -- Document Information
    document_type VARCHAR(50),
    document_number VARCHAR(100),
    document_image_url TEXT,
    
    -- Face Verification
    face_front_url TEXT,
    face_left_url TEXT,
    face_right_url TEXT,
    face_video_url TEXT,
    
    -- KYC Status & Metadata
    status kyc_status_type DEFAULT 'Pending',
    risk_score INTEGER DEFAULT 0,
    channel VARCHAR(50) DEFAULT 'Web',
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    submitted_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for common queries
CREATE INDEX idx_kyc_details_submission_id ON kyc_details(submission_id);
CREATE INDEX idx_kyc_details_status ON kyc_details(status);
CREATE INDEX idx_kyc_details_full_name ON kyc_details(full_name);
CREATE INDEX idx_kyc_details_created_at ON kyc_details(created_at DESC);
CREATE INDEX idx_kyc_details_email ON kyc_details(email) WHERE email IS NOT NULL;

-- Enable Row Level Security (RLS)
ALTER TABLE kyc_details ENABLE ROW LEVEL SECURITY;

-- Policy: Allow service role full access
CREATE POLICY "Service role can do anything" ON kyc_details
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- Trigger to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_kyc_details_updated_at
    BEFORE UPDATE ON kyc_details
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Grant permissions
GRANT ALL ON kyc_details TO service_role;
GRANT SELECT, INSERT ON kyc_details TO anon;
GRANT SELECT, INSERT, UPDATE ON kyc_details TO authenticated;

-- Liveness Detection Results Table
CREATE TABLE IF NOT EXISTS liveness_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID,
  is_live BOOLEAN,
  decision TEXT,
  blink_count INT,
  movement_count INT,
  confidence_score FLOAT,
  duration_seconds FLOAT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_liveness_results_submission_id ON liveness_results(submission_id);
CREATE INDEX IF NOT EXISTS idx_liveness_results_created_at ON liveness_results(created_at DESC);

GRANT ALL ON liveness_results TO service_role;
GRANT SELECT, INSERT ON liveness_results TO anon;
GRANT SELECT, INSERT, UPDATE ON liveness_results TO authenticated;
