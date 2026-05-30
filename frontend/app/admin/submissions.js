const STORAGE_KEY = "kycSubmissions";

export const seedSubmissions = [
  {
    id: "KYC-2026-0412",
    name: "Aarav Shrestha",
    email: "aarav.shrestha@example.com",
    phone: "+977-9800001122",
    status: "Approved",
    riskScore: 18,
    submittedAt: "May 28, 2026 09:42",
    channel: "Web",
    documentType: "Passport",
    documentNumber: "PA-7420191",
    address: "Lalitpur, Nepal",
    documentFileName: "passport_scan.jpg",
    faceCaptures: {},
  },
  {
    id: "KYC-2026-0413",
    name: "Sanjana Karki",
    email: "sanjana.karki@example.com",
    phone: "+977-9811103344",
    status: "Flagged",
    riskScore: 72,
    submittedAt: "May 28, 2026 10:05",
    channel: "Mobile",
    documentType: "Citizenship",
    documentNumber: "NP-12-88421",
    address: "Kathmandu, Nepal",
    documentFileName: "citizenship_card.png",
    faceCaptures: {},
  },
  {
    id: "KYC-2026-0414",
    name: "Rohan Maharjan",
    email: "rohan.maharjan@example.com",
    phone: "+977-9840019912",
    status: "Pending",
    riskScore: 54,
    submittedAt: "May 28, 2026 11:18",
    channel: "Partner Kiosk",
    documentType: "Driving License",
    documentNumber: "DL-22011",
    address: "Bhaktapur, Nepal",
    documentFileName: "license.png",
    faceCaptures: {},
  },
  {
    id: "KYC-2026-0415",
    name: "Nisha Lama",
    email: "nisha.lama@example.com",
    phone: "+977-9865500021",
    status: "Flagged",
    riskScore: 81,
    submittedAt: "May 28, 2026 12:01",
    channel: "Web",
    documentType: "Passport",
    documentNumber: "PA-1174492",
    address: "Pokhara, Nepal",
    documentFileName: "passport.png",
    faceCaptures: {},
  },
  {
    id: "KYC-2026-0416",
    name: "Dipesh Thapa",
    email: "dipesh.thapa@example.com",
    phone: "+977-9803334411",
    status: "Approved",
    riskScore: 26,
    submittedAt: "May 28, 2026 14:37",
    channel: "Mobile",
    documentType: "Citizenship",
    documentNumber: "NP-22-11410",
    address: "Biratnagar, Nepal",
    documentFileName: "citizenship.png",
    faceCaptures: {},
  },
];

const readStoredSubmissions = () => {
  if (typeof window === "undefined") {
    return seedSubmissions;
  }

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return seedSubmissions;
    }
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) {
      return seedSubmissions;
    }
    return parsed;
  } catch (error) {
    return seedSubmissions;
  }
};

const writeStoredSubmissions = (items) => {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
};

export const getStoredSubmissions = () => readStoredSubmissions();

export const addSubmission = (submission) => {
  const current = readStoredSubmissions();
  const next = [submission, ...current];
  writeStoredSubmissions(next);
  return next;
};

export const getSubmissionById = (id) =>
  readStoredSubmissions().find((item) => item.id === id);

export const updateSubmissionStatus = (id, status) => {
  const items = readStoredSubmissions();
  const updated = items.map((item) =>
    item.id === id ? { ...item, status } : item
  );
  writeStoredSubmissions(updated);
  return updated;
};
