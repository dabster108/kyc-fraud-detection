# eKS — eSewa KYC Shield

<div align="center">

![Python](https://img.shields.io/badge/Python-3.12-3776AB?style=flat&logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.136-009688?style=flat&logo=fastapi&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-16-000000?style=flat&logo=next.js&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-pgvector-336791?style=flat&logo=postgresql&logoColor=white)
![InsightFace](https://img.shields.io/badge/InsightFace-buffalo__l-FF6B6B?style=flat)
![Mistral](https://img.shields.io/badge/Mistral-pixtral--12b-7C3AED?style=flat)

**AI-powered KYC fraud detection system built for the eSewa Hackathon.**  
Detects forged documents, duplicate identities, and suspicious onboarding behaviour in real time.

</div>

---

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [AI / ML Pipeline](#ai--ml-pipeline)
  - [1. Document OCR — Mistral Pixtral-12B](#1-document-ocr--mistral-pixtral-12b)
  - [2. Face Extraction — InsightFace ArcFace](#2-face-extraction--insightface-arcface)
  - [3. Duplicate Detection — pgvector Cosine Similarity](#3-duplicate-detection--pgvector-cosine-similarity)
  - [4. Forgery Detection — 6-Check Pipeline](#4-forgery-detection--6-check-pipeline)
- [Decision Thresholds](#decision-thresholds)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Repository Structure](#repository-structure)
- [API Reference](#api-reference)
- [Database Schema](#database-schema)
- [Team](#team)

---

## Overview

**eKS (eSewa KYC Shield)** is a three-service system that runs document forensics, face identity deduplication, and AI-powered OCR in parallel on every KYC submission.

```
Upload ID Document
        │
        ├──► OCR (Mistral)        → Structured fields (name, DOB, document number …)
        ├──► Face Extraction      → 512-dim ArcFace embedding → duplicate check
        └──► Forgery Detection    → 6-check weighted score → genuine / suspicious / forged
                                            │
                                            ▼
                                   Risk Score per Submission
                                   Auto-approve / Review / Reject
```

---

## Key Features

- **Document OCR** — Extracts structured fields from Nepali Citizenship Cards, National ID Cards, and Driving Licenses using the Mistral `pixtral-12b-2409` vision model; handles Devanagari script and BS→AD date conversion
- **Face Identity Deduplication** — InsightFace `buffalo_l` generates a 512-dim ArcFace embedding; pgvector cosine similarity finds duplicate identities across all prior submissions in sub-linear time
- **Forgery Detection** — Six weighted forensic checks (ELA, EXIF metadata, font consistency, noise pattern, copy-move, edge analysis) produce a composite 0–100 forgery score
- **Full Audit Trail** — Every embedding, OCR result, and forgery score is persisted to Supabase (PostgreSQL); document and face images stored on Cloudinary
- **Resilient Design** — Every ML pipeline catches all failures internally; errors surface as structured response fields, not HTTP 500s

---

## Architecture

![eKS System Architecture](architecture/image.png)

**Layers:**

- **Frontend Layer** — Next.js 16 (React 19 · Tailwind CSS · FingerprintJS) communicates with the backend over REST API
- **Orchestration Layer** — Express.js Backend (Node.js) routes traffic across KYC Routes, Admin Routes, and Onboarding Routes; forwards ML tasks to FastAPI over HTTP
- **ML Services Layer (FastAPI · Python)** — three parallel services: InsightFace `buffalo_l` (ArcFace 512-dim + RetinaFace), Mistral OCR Service (pixtral-12b-2409), and Forgery Detector (6-check pipeline)
- **Data & Storage Layer** — Supabase PostgreSQL + pgvector (`kyc_submissions · face_embeddings (vector 512) · ocr_results · forgery_results · kyc_details`); Cloudinary CDN for original ID images and cropped face images

---

## Tech Stack

### Frontend

| Technology | Version | Purpose |
|---|---|---|
| Next.js | 16.2.6 | App framework (App Router + Turbopack) |
| React | 19.2.4 | UI library |
| Tailwind CSS | 4.x | Utility-first styling |
| Framer Motion | 12.x | Page and component animations |
| FingerprintJS | 5.x | Browser fingerprinting for behavioural analytics |
| TypeScript | 5.x | Type safety |

### Backend — Express (Node.js · :5001)

| Technology | Version | Purpose |
|---|---|---|
| Express.js | 5.x | REST API server |
| Multer | 2.x | Multipart file upload handling |
| Sharp | 0.34 | Server-side image pre-processing |
| pg | 8.x | PostgreSQL client |
| Cloudinary SDK | 2.x | Image upload to CDN |
| Helmet / Morgan | latest | Security headers + request logging |
| string-similarity | 4.x | Name-matching utility |

### Backend — ML Services (FastAPI · :8000)

| Technology | Version | Purpose |
|---|---|---|
| FastAPI | 0.136+ | Async REST API framework |
| Python | 3.12 | Runtime |
| **InsightFace** | 1.0+ | Face detection + ArcFace 512-dim embedding (`buffalo_l`) |
| **ONNX Runtime** | 1.26+ | CPU inference for InsightFace ONNX models |
| **TensorFlow** | 2.21+ | Deep learning framework |
| **scikit-learn** | 1.8+ | ML utilities and preprocessing |
| **Mistral AI** | 1.0+ | Vision LLM OCR via `pixtral-12b-2409` |
| OpenCV | 4.13 | Image decoding, ELA, Canny edges, ORB keypoints |
| Pillow | 12.x | JPEG/PNG I/O, ELA re-save, EXIF tag parsing |
| NumPy | 2.x | Embedding arithmetic and array operations |
| asyncpg | 0.31+ | Async PostgreSQL driver for pgvector raw SQL |
| pgvector | 0.4+ | Python bindings for the pgvector extension |
| Supabase SDK | 2.30+ | REST fallback client for RPC calls |
| Cloudinary | 1.44+ | Document + face crop image storage |
| Pydantic / pydantic-settings | 2.x | Response models and settings management |
| uvicorn | 0.47+ | ASGI server |

### Database & Storage

| Technology | Purpose |
|---|---|
| PostgreSQL (via Supabase) | Primary relational data store |
| pgvector extension | 512-dim embedding storage and cosine similarity search |
| IVFFlat index (`lists=100`) | Approximate nearest-neighbour; sub-linear duplicate search |
| Cloudinary CDN | Original ID images and cropped face images |

---

## AI / ML Pipeline

### 1. Document OCR — Mistral Pixtral-12B

The document image is base64-encoded and sent to `pixtral-12b-2409` with a strict system prompt that enforces a single raw JSON response — no markdown, no prose.

**Supported documents:**

| Document | Script |
|---|---|
| Citizenship Card (नागरिकता पत्र) | Devanagari + English |
| National ID Card (राष्ट्रिय परिचयपत्र) | Devanagari + English |
| Driving License | English |

**Post-processing steps applied to every response:**

| Step | What it does |
|---|---|
| Devanagari normalisation | Converts ०–९ → 0–9 in all numeric fields |
| BS → AD date conversion | `AD = BS - 57` (month ≤ 9) or `BS - 56` (month > 9) |
| NID name recomposition | Forces `full_name = "<given_name> <surname>"` in both scripts |
| JSON fence stripping | Removes ` ```json ``` ` wrapping if the model adds it |
| Confidence scoring | `0.90` all required fields present · `0.65` partial · `0.10` unknown |
| Photo region | Returns hardcoded `[x1,y1,x2,y2]` bounding box per document type |

---

### 2. Face Extraction — InsightFace ArcFace

> The model is **InsightFace `buffalo_l`** — not FaceNet. ArcFace uses angular margin loss giving better inter-class separation than FaceNet's triplet loss.

**Model components inside `buffalo_l`:**

| Component | Architecture | Role |
|---|---|---|
| Face Detector | RetinaFace | Bounding box + confidence (`det_score`) |
| Face Recogniser | ArcFace R100 | 512-dim float32 embedding |
| Runtime | ONNX Runtime (CPU) | Inference engine |

**Step-by-step pipeline:**

```
Image bytes
    │
    ▼
cv2.imdecode()                   ← decode to BGR numpy array
    │
    ▼
FaceAnalysis.get(img)            ← RetinaFace detection + ArcFace embedding (one pass)
    │
    ├── No face found → return face_found: false
    │
    ▼
max(faces, key=det_score)        ← pick highest-confidence face
    │
    ├── bbox [x1,y1,x2,y2] + 10px padding → cv2.imencode → JPEG bytes
    │
    ├── Upload original ID image → Cloudinary  (id_image_url)
    ├── Upload face crop         → Cloudinary  (face_image_url)
    │
    ▼
512-dim float32 embedding
    │
    ▼
pgvector duplicate check  ──► duplicate found → HTTP 409
    │
    ▼
INSERT into face_embeddings (Supabase)
```

---

### 3. Duplicate Detection — pgvector Cosine Similarity

The 512-dim embedding is compared against every stored embedding using the pgvector `<=>` (cosine distance) operator:

```sql
SELECT submission_id, created_at,
       1 - (embedding <=> $1::vector) AS similarity
FROM face_embeddings
ORDER BY embedding <=> $1::vector
LIMIT 1
```

Search is accelerated by an **IVFFlat approximate nearest-neighbour index**:

```sql
CREATE INDEX face_embeddings_vector_idx
ON face_embeddings
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);
```

**Threshold: `similarity > 0.60` = duplicate**

| Similarity | Result |
|---|---|
| > 0.60 | HTTP 409 · `is_duplicate = true` · matched submission returned |
| ≤ 0.60 | New identity · embedding persisted to Supabase |

**Two query paths (automatic fallback):**

| Path | Trigger | Speed |
|---|---|---|
| `asyncpg` pool → raw SQL | `DATABASE_URL` is configured | Fastest |
| Supabase REST RPC `match_face_embeddings()` | `DATABASE_URL` not set | Fallback |

---

### 4. Forgery Detection — 6-Check Pipeline

All six checks run in a **thread-pool executor** (never blocks the async event loop). Each returns a 0–100 score; the final `forgery_score` is a weighted composite.

| # | Check | Weight | Method | Signal |
|---|---|---|---|---|
| 1 | **ELA** | **47 %** | Re-save at JPEG q90, amplify pixel diff ×10, measure mean brightness | JPEG re-compression artefacts from editing tools |
| 2 | **EXIF Metadata** | **20 %** | Parse `Software`, `DateTimeOriginal`, `Make`/`Model` EXIF tags | Editing software signatures; stripped metadata on JPEG |
| 3 | **Font Consistency** | **10 %** | Connected-component glyph heights → coefficient of variation (threshold CV > 0.55) | Pasted text with mismatched font size |
| 4 | **Noise Pattern** | **10 %** | `original − GaussianBlur(5×5)` → `std(noise)` (flag if > 15 or < 1) | Spliced regions with inconsistent sensor noise |
| 5 | **Copy-Move** | **8 %** | ORB 1000 keypoints self-matched via BFMatcher-Hamming; flag `dist < 35` && `spatial > 60px` | Copy-pasted cloned regions |
| 6 | **Edge Inconsistency** | **5 %** | Canny on 4×4 grid → `std(edge densities per cell)` | Unnatural transitions (low weight: ID cards always mix photo + text + seal) |

**Composite formula:**

```
forgery_score = ELA×0.47 + EXIF×0.20 + Font×0.10 + Noise×0.10 + CopyMove×0.08 + Edge×0.05
```

---

## Decision Thresholds

**Forgery score → decision:**

| Score | Decision | Action |
|---|---|---|
| 0 – 34 | `genuine` | Auto-approve |
| 35 – 70 | `suspicious` | Flag for manual review |
| 71 – 100 | `forged` | Auto-reject |

**Duplicate face → decision:**

| Cosine Similarity | Decision |
|---|---|
| > 0.60 | Duplicate — HTTP 409 returned |
| ≤ 0.60 | New identity — embedding saved |

**Per-check scoring details:**

| Check | Scoring Rule |
|---|---|
| ELA | `min((mean_brightness / 255) × 300, 100)` |
| EXIF editing software | +80 pts |
| EXIF stripped on JPEG | +30 pts |
| EXIF missing `DateTimeOriginal` | +20 pts |
| Font CV | `max(0, (CV − 0.55) / 0.35) × 100` |
| Copy-move | `min(suspicious_ratio × 300, 100)` |

---

## Getting Started

### Prerequisites

- Node.js 20+
- Python 3.12+
- [uv](https://github.com/astral-sh/uv) (Python package manager)
- Supabase project with `pgvector` extension enabled
- Cloudinary account
- Mistral AI API key

### 1. Clone the repository

```bash
git clone https://github.com/your-org/kyc-fraud-detection.git
cd kyc-fraud-detection
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env with your Supabase, Cloudinary, and Mistral credentials
```

### 3. Apply database migrations

Run the following files in order in your **Supabase SQL Editor**:

```
backend/ml-services/app/database/migrations/001_face_embeddings.sql
backend/ml-services/app/database/migrations/002_match_face_embeddings_fn.sql
backend/ml-services/migrations/001_create_kyc_details.sql
```

### 4. Start ML Services (FastAPI · :8000)

```bash
cd backend/ml-services
uv sync
uv run uvicorn app.main:app --reload --port 8000
```

> The server binds immediately. InsightFace `buffalo_l` ONNX models download and load in the background (10–30 s).  
> Check readiness: `GET http://localhost:8000/api/v1/ready`

### 5. Start Express Backend (:5001)

```bash
cd backend/express-app
npm install
npm run dev
```

### 6. Start Frontend (:3000)

```bash
cd frontend
npm install
npm run dev
```

---

## Environment Variables

A single `.env` file at the repository root is shared across all services.

```env
# ── Supabase ─────────────────────────────────────
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-role-key

# Direct Postgres connection for asyncpg / pgvector queries
DATABASE_URL=postgresql://postgres:password@db.your-project.supabase.co:5432/postgres

# ── Cloudinary ────────────────────────────────────
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret

# ── Mistral AI ────────────────────────────────────
MISTRAL_API_KEY=your-mistral-api-key
```

**Tunable ML settings (`backend/ml-services/app/core/config.py`):**

| Setting | Default | Description |
|---|---|---|
| `DUPLICATE_SIMILARITY_THRESHOLD` | `0.60` | Cosine similarity above which a face is flagged as duplicate |
| `FACE_MODEL_NAME` | `buffalo_l` | InsightFace model pack name |
| `MISTRAL_MODEL` | `pixtral-12b-2409` | Vision model used for OCR |
| `MAX_UPLOAD_MB` | `10` | Max upload size in megabytes |

---

## Repository Structure

```
kyc-fraud-detection/
│
├── .env                                  # Shared env for all services
│
├── frontend/                             # Next.js 16 application
│   ├── app/
│   │   ├── layout.js
│   │   └── page.js                       # Multi-step KYC submission form
│   ├── lib/
│   │   ├── api.js                        # REST client (submit, status, admin)
│   │   ├── mockData.js
│   │   └── utils.js
│   └── package.json
│
├── backend/
│   │
│   ├── express-app/                      # Node.js REST API  (:5001)
│   │   ├── server.js
│   │   └── src/routes/
│   │       ├── kycRoutes.js
│   │       ├── adminRoutes.js
│   │       └── onboardingRoutes.js
│   │
│   └── ml-services/                      # FastAPI ML backend (:8000)
│       ├── app/
│       │   ├── main.py                   # FastAPI app + startup/shutdown hooks
│       │   ├── core/
│       │   │   └── config.py             # Pydantic settings (all thresholds here)
│       │   ├── api/endpoints/
│       │   │   ├── face.py               # POST /face/extract
│       │   │   ├── forgery.py            # POST /forgery/verify
│       │   │   ├── ocr.py                # POST /ocr/extract
│       │   │   └── health.py             # GET  /health  GET /ready
│       │   ├── services/
│       │   │   ├── face_extractor.py     # InsightFace + pgvector duplicate pipeline
│       │   │   ├── forgery_detector.py   # 6-check ELA / EXIF / ORB pipeline
│       │   │   ├── mistral_ocr.py        # Pixtral-12B OCR + post-processing
│       │   │   └── cloudinary_service.py # Image upload helpers
│       │   ├── models/
│       │   │   ├── face_models.py        # FaceExtractionResult · DuplicateMatch
│       │   │   └── ocr_models.py         # OCRResult · ForgeryResult
│       │   └── database/
│       │       ├── supabase_client.py    # Supabase + asyncpg pool init
│       │       └── migrations/
│       │           ├── 001_face_embeddings.sql           # Tables + IVFFlat index
│       │           └── 002_match_face_embeddings_fn.sql  # Supabase RPC fallback fn
│       └── pyproject.toml
│
└── README.md
```

---

## API Reference

### ML Services — FastAPI (:8000)

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/v1/health` | Service health check |
| `GET` | `/api/v1/ready` | Face model loading status |
| `POST` | `/api/v1/ocr/extract` | Extract structured fields from ID image (multipart) |
| `POST` | `/api/v1/ocr/extract-base64` | Same — base64 input |
| `GET` | `/api/v1/ocr/supported-documents` | List supported document types and fields |
| `POST` | `/api/v1/forgery/verify` | Run 6-check forgery analysis (multipart) |
| `POST` | `/api/v1/forgery/verify-base64` | Same — base64 input |
| `POST` | `/api/v1/face/extract` | Detect face, generate embedding, check duplicates |
| `GET` | `/api/v1/face/latest` | Most recent face embedding with linked OCR data |

**Duplicate detected response (`POST /api/v1/face/extract`):**

```json
HTTP 409 Conflict
{
  "error": "duplicate_face_detected",
  "message": "This face already exists in the system.",
  "matched_submission_id": "3f7a1c2e-...",
  "similarity_score": 0.8732,
  "matched_at": "2026-05-30T09:00:00Z"
}
```

### Express API (:5001)

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/kyc/submit` | Submit full KYC form |
| `POST` | `/api/v1/kyc/submit-details` | Submit KYC personal details (JSON) |
| `GET` | `/api/v1/kyc/details/:id` | Get submission by ID |
| `GET` | `/api/v1/kyc/details` | List submissions (status filter + pagination) |
| `PATCH` | `/api/v1/kyc/details/:id/status` | Update submission status |
| `GET` | `/api/v1/admin/submissions/pending` | Admin: list pending submissions |
| `POST` | `/api/v1/onboarding/session` | Start onboarding session |
| `GET` | `/health` | Express health check |

---

## Database Schema

```sql
-- Enable pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- Submission anchor — every other table references this
CREATE TABLE kyc_submissions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status        TEXT    DEFAULT 'pending',
  risk_score    FLOAT   DEFAULT 0,
  document_type TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- 512-dim ArcFace embeddings
CREATE TABLE face_embeddings (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id         UUID REFERENCES kyc_submissions(id) ON DELETE CASCADE,
  embedding             vector(512),
  detection_confidence  FLOAT,
  face_region           JSONB,           -- {x1,y1,x2,y2}
  is_duplicate          BOOLEAN DEFAULT false,
  matched_submission_id UUID REFERENCES kyc_submissions(id),
  id_image_url          TEXT,
  face_image_url        TEXT,
  created_at            TIMESTAMPTZ DEFAULT now()
);

-- IVFFlat index for approximate nearest-neighbour cosine search
CREATE INDEX face_embeddings_vector_idx
ON face_embeddings
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Structured OCR output
CREATE TABLE ocr_results (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id    UUID REFERENCES kyc_submissions(id) ON DELETE CASCADE,
  document_type    TEXT,
  extracted_fields JSONB,
  confidence_score FLOAT,
  created_at       TIMESTAMPTZ DEFAULT now()
);

-- Per-check forgery scores + composite result
CREATE TABLE forgery_results (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id      UUID REFERENCES kyc_submissions(id) ON DELETE CASCADE,
  forgery_score      FLOAT,
  decision           TEXT,   -- genuine | suspicious | forged
  suspicious_regions JSONB,
  details            JSONB,  -- per-check breakdown
  created_at         TIMESTAMPTZ DEFAULT now()
);

-- Full KYC form submission
CREATE TABLE kyc_details (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id VARCHAR(50) UNIQUE NOT NULL,
  full_name     VARCHAR(255) NOT NULL,
  date_of_birth DATE NOT NULL,
  gender        TEXT NOT NULL,
  nationality   VARCHAR(100) NOT NULL,
  -- ... address, family info, document info, face capture URLs
  status        TEXT DEFAULT 'Pending',
  risk_score    INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Team

| Name | Role |
|---|---|
| **Dikshanta Chapagain** | Backend · AI/ML Engineer |
| **Pawan Acharya** | Frontend Engineer |
| **Pratik Joshi** | Backend Engineer |
| **Eshika Sharma** | System Design |

---

<div align="center">

*Built for the eSewa Hackathon · eKS — eSewa KYC Shield*

</div>
