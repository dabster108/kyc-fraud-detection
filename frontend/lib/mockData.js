/** Landing page content — aligned with the real eKS onboarding + admin stack. */

export const STATS = [
  {
    label: "Nepali ID types supported",
    value: 3,
    display: "3",
    suffix: "",
  },
  {
    label: "Step verification flow",
    value: 3,
    display: "3",
    suffix: "",
  },
  {
    label: "Risk signals in admin review",
    value: 15,
    display: "15+",
    suffix: "",
    static: true,
  },
  {
    label: "Point risk scale (0–100)",
    value: 100,
    display: "100",
    suffix: "",
  },
];

export const FEATURES = [
  {
    title: "Document forgery detection",
    desc: "ELA, EXIF, edge, font, and copy-move checks on uploaded citizenship, NID, or license images.",
    icon: "shield-check",
    accent: "from-brand-500 to-brand-700",
  },
  {
    title: "OCR pre-fill & extraction",
    desc: "Mistral vision reads your ID, maps fields (including BS/AD dates), and pre-fills the review form.",
    icon: "file-search",
    accent: "from-emerald-400 to-brand-500",
  },
  {
    title: "Guided liveness & face match",
    desc: "Blink and head-turn challenges, then compare your live selfie to the portrait on your document.",
    icon: "scan-face",
    accent: "from-brand-400 to-emerald-500",
  },
  {
    title: "Duplicate & device checks",
    desc: "Blocks verified citizenship reuse, counts repeat phones/docs, and flags shared device fingerprints.",
    icon: "fingerprint",
    accent: "from-brand-500 to-lime-500",
  },
  {
    title: "OCR vs form tamper check",
    desc: "Compares what you type in step 2 against what was read from the document to catch edited fields.",
    icon: "sparkles",
    accent: "from-brand-600 to-green-600",
  },
  {
    title: "Risk score & admin review",
    desc: "Cumulative 0–100 risk score with explainable flags, auto-approve/reject thresholds, and an analyst dashboard.",
    icon: "check-circle",
    accent: "from-emerald-500 to-brand-600",
  },
];

export const HOW_IT_WORKS = [
  {
    step: "01",
    title: "Upload your document",
    desc: "Citizenship (front + back), National ID, or driving license. Forgery scan and OCR run immediately.",
    icon: "file-search",
  },
  {
    step: "02",
    title: "Review your details",
    desc: "Confirm OCR-filled name, addresses, and dates. Duplicate and tamper checks add to your risk score.",
    icon: "shield-check",
  },
  {
    step: "03",
    title: "Face verification",
    desc: "Complete liveness (blink, turn left/right), match selfie to ID photo, and get approve / pending / reject.",
    icon: "scan-face",
  },
  {
    step: "04",
    title: "Admin decision",
    desc: "Low-risk cases can auto-approve; others land in the dashboard with full flags, selfies, and OCR evidence.",
    icon: "check-circle",
  },
];

export const WHY_CHOOSE = [
  {
    title: "Built for Nepal IDs",
    desc: "Citizenship front/back OCR, BS issued dates, AD date of birth, and district-aware address fields.",
    icon: "file-search",
  },
  {
    title: "Explainable risk flags",
    desc: "Every score bump ties to a labeled signal—forgery, face match, duplicates, edited fields—not a black box.",
    icon: "shield-check",
  },
  {
    title: "Tunable thresholds",
    desc: "Admins set low/high risk bands, face-match similarity, and duplicate-face cosine limits in Settings.",
    icon: "sparkles",
  },
  {
    title: "One continuous flow",
    desc: "Document → review → liveness in a single session stored in Postgres with images on Cloudinary.",
    icon: "check-circle",
  },
];

export const ENGINES = [
  {
    title: "Forgery analyzer",
    desc: "FastAPI pipeline scores tampering from pixel, metadata, and layout signals on each upload.",
    icon: "shield-check",
  },
  {
    title: "OCR & face pipeline",
    desc: "Extracts structured fields, crops the ID portrait, and embeds the face for later selfie comparison.",
    icon: "scan-face",
  },
  {
    title: "Risk & decision engine",
    desc: "Merges forgery, face, duplicate, device, and edit signals—then auto-approves, rejects, or queues review.",
    icon: "activity",
  },
];
