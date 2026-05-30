"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  CalendarIcon,
  ChevronLeftIcon,
  MailIcon,
  PhoneIcon,
  ShieldIcon,
  UserIcon,
} from "../../components/icons";
import { getSubmissionById, updateSubmissionStatus } from "../submissions";

// ─── Risk flag metadata ──────────────────────────────────────────────────────
const FLAG_META = {
  forgery_detected:            { label: "Forgery Detected",              severity: "critical", desc: "Document shows strong signs of digital manipulation (ELA analysis).", impact: "+50 pts" },
  forgery_suspicious:          { label: "Document Suspicious",           severity: "high",     desc: "Forgery model flagged this document as potentially tampered.", impact: "+20 pts" },
  forgery_score:               { label: "Forgery Score (Raw)",           severity: "info",     desc: "Raw forgery detection probability from the ML model (0–100)." },
  face_mismatch:               { label: "Face Mismatch",                 severity: "critical", desc: "Selfie face does NOT match the document photo — identity concern.", impact: "+50 pts" },
  face_uncertain:              { label: "Face Match Uncertain",          severity: "high",     desc: "Similarity below confidence threshold — manual review required.", impact: "+20 pts" },
  face_similarity:             { label: "Face Similarity Score",         severity: "info",     desc: "Cosine similarity (0–1) between selfie embedding and document face." },
  liveness_confirmed:          { label: "Liveness Confirmed",            severity: "good",     desc: "All 3 capture angles (front/left/right) provided — liveness check passed.", impact: "−5 pts" },
  name_mismatch:               { label: "Name Mismatch",                 severity: "high",     desc: "OCR-extracted name differs significantly from the entered name.", impact: "+30 pts" },
  name_partial_mismatch:       { label: "Partial Name Mismatch",         severity: "medium",   desc: "OCR name has minor differences from entered name — possible typo.", impact: "+15 pts" },
  ocr_name_similarity:         { label: "OCR Name Match %",              severity: "info",     desc: "Fuzzy similarity between OCR-extracted name and the entered full name." },
  document_number_mismatch:    { label: "Document Number Mismatch",      severity: "high",     desc: "OCR-read document number differs from what the applicant entered.", impact: "+25 pts" },
  ocr_document_number:         { label: "OCR Document Number",           severity: "info",     desc: "Document number as read directly from the document by OCR." },
  user_document_number:        { label: "Entered Document Number",       severity: "info",     desc: "Document number manually entered by the applicant." },
  duplicate_document_number:   { label: "Duplicate Document",            severity: "critical", desc: "This document number was submitted in a previous KYC attempt.", impact: "+15 pts" },
  previous_document_attempts:  { label: "Prior Document Uses",           severity: "info",     desc: "Number of times this document number has been used in past submissions." },
  verified_user_document_exists: { label: "Verified Doc Exists",         severity: "critical", desc: "This document number already belongs to an approved verified user.", impact: "+50 pts" },
  duplicate_email:             { label: "Duplicate Email",               severity: "high",     desc: "This email was used in one or more previous KYC submissions.", impact: "varies" },
  previous_email_attempts:     { label: "Prior Email Attempts",          severity: "info",     desc: "Number of previous submissions using this email address." },
  duplicate_phone:             { label: "Duplicate Phone",               severity: "high",     desc: "This phone number was used in a previous KYC attempt.", impact: "+10 pts" },
  previous_phone_attempts:     { label: "Prior Phone Attempts",          severity: "info",     desc: "Number of previous submissions using this phone number." },
  duplicate_pan:               { label: "Duplicate PAN",                 severity: "high",     desc: "PAN number has been submitted before.", impact: "+20 pts" },
  verified_user_email_exists:  { label: "Verified Email Match",          severity: "critical", desc: "Email already belongs to an approved verified user.", impact: "+40 pts" },
  verified_user_phone_exists:  { label: "Verified Phone Match",          severity: "critical", desc: "Phone number already belongs to an approved verified user.", impact: "+40 pts" },
  verified_user_pan_exists:    { label: "Verified PAN Match",            severity: "critical", desc: "PAN already belongs to an approved verified user.", impact: "+40 pts" },
  name_dob_match_verified:     { label: "Name+DOB Already Verified",     severity: "critical", desc: "This exact name and date-of-birth combination is already in the verified users table.", impact: "+30 pts" },
  same_device_multiple_attempts: { label: "Multi-Attempt Device",        severity: "medium",   desc: "Multiple KYC submissions detected from the same device fingerprint." },
  device_attempt_count:        { label: "Device Attempt Count",          severity: "info",     desc: "Total previous KYC submissions from this specific device." },
  multiple_accounts_same_ip:   { label: "Multiple IP Accounts",          severity: "high",     desc: "Several distinct accounts submitted KYC from this IP within 24 hours.", impact: "+20 pts" },
  ip_account_count:            { label: "IP Account Count",              severity: "info",     desc: "Number of unique accounts seen from this IP address today." },
  bot_speed_suspected:         { label: "Bot Speed Suspected",           severity: "critical", desc: "Form completed in under 10 seconds — likely an automated/scripted submission.", impact: "+35 pts" },
  unusually_fast_submission:   { label: "Fast Submission",               severity: "medium",   desc: "Form completed faster than a typical human — warrants attention.", impact: "+15 pts" },
  submission_speed_ms:         { label: "Submission Speed",              severity: "info",     desc: "Time (ms) taken to complete the onboarding form from page load to submit." },
  face_comparison_skipped:     { label: "Face Compare Skipped",          severity: "medium",   desc: "Face comparison was not performed — document embedding was not available." },
  no_face_in_selfie:           { label: "No Face Detected in Selfie",    severity: "high",     desc: "The ML model could not detect a human face in the selfie images.", impact: "+20 pts" },
};

const SEVERITY_STYLE = {
  critical: { bg: "bg-red-50",    border: "border-red-200",   text: "text-red-800",   badge: "bg-red-100 text-red-700",   dot: "bg-red-500"   },
  high:     { bg: "bg-orange-50", border: "border-orange-200",text: "text-orange-800",badge: "bg-orange-100 text-orange-700", dot: "bg-orange-500" },
  medium:   { bg: "bg-amber-50",  border: "border-amber-200", text: "text-amber-800", badge: "bg-amber-100 text-amber-700", dot: "bg-amber-400"  },
  info:     { bg: "bg-slate-50",  border: "border-slate-200", text: "text-slate-700", badge: "bg-slate-100 text-slate-600", dot: "bg-slate-400"  },
  good:     { bg: "bg-emerald-50",border: "border-emerald-200",text: "text-emerald-800",badge: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-500" },
};

const STATUS_COLORS = {
  Approved: "bg-emerald-100 text-emerald-700 border-emerald-200",
  Flagged:  "bg-amber-100 text-amber-700 border-amber-200",
  Pending:  "bg-blue-100 text-blue-700 border-blue-200",
  Rejected: "bg-red-100 text-red-700 border-red-200",
};

const getRiskTone = (score) => {
  if (score >= 70) return { label: "High Risk",      pill: "bg-red-100 text-red-700",       color: "#EF4444", track: "#FEE2E2" };
  if (score >= 40) return { label: "Moderate Risk",  pill: "bg-amber-100 text-amber-700",   color: "#F59E0B", track: "#FEF3C7" };
  return              { label: "Low Risk",       pill: "bg-emerald-100 text-emerald-700", color: "#22C55E", track: "#DCFCE7" };
};

function InfoRow({ label, value }) {
  if (!value && value !== 0) return null;
  return (
    <div className="flex items-start justify-between gap-4 border-b border-[#F1F5F9] py-2.5 last:border-0">
      <span className="flex-shrink-0 text-xs text-[#94A3B8]">{label}</span>
      <span className="max-w-[60%] text-right text-sm font-semibold text-[#0B1324] break-words">{String(value)}</span>
    </div>
  );
}

function SectionCard({ title, badge, children }) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <p className="font-semibold text-[#0B1324]">{title}</p>
        {badge && (
          <span className="rounded-full bg-[#F1F5F9] px-2.5 py-1 text-xs font-medium text-[#64748B]">{badge}</span>
        )}
      </div>
      {children}
    </div>
  );
}

function ForgeryDecisionBadge({ decision, score }) {
  const styles = {
    genuine:    { cls: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: "✓", label: "Genuine",    range: "score < 35" },
    suspicious: { cls: "bg-amber-100 text-amber-700 border-amber-200",       icon: "⚑", label: "Suspicious", range: "35 ≤ score < 71" },
    forged:     { cls: "bg-red-100 text-red-700 border-red-200",             icon: "⚠", label: "Forged",     range: "score ≥ 71" },
    unknown:    { cls: "bg-slate-100 text-slate-600 border-slate-200",       icon: "?", label: "Unknown",    range: "—" },
  };
  const s = styles[decision] || styles.unknown;
  return (
    <div className={`flex items-center justify-between rounded-xl border px-4 py-3 ${s.cls}`}>
      <div className="flex items-center gap-2">
        <span className="text-lg font-bold">{s.icon}</span>
        <div>
          <p className="text-sm font-bold">{s.label}</p>
          <p className="text-xs opacity-75">Threshold: {s.range}</p>
        </div>
      </div>
      {score !== null && score !== undefined && (
        <div className="text-right">
          <p className="text-2xl font-bold font-mono">{typeof score === "number" ? score.toFixed(2) : score}</p>
          <p className="text-xs opacity-75">composite score</p>
        </div>
      )}
    </div>
  );
}

export default function SubmissionDetailPage() {
  const routeParams = useParams();
  const router = useRouter();
  const submissionId = Array.isArray(routeParams?.id) ? routeParams.id[0] : routeParams?.id;
  const [submission, setSubmission] = useState(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [actionMsg, setActionMsg] = useState("");
  const [activeSection, setActiveSection] = useState("overview");

  useEffect(() => {
    if (!submissionId) return;
    setSubmission(getSubmissionById(submissionId));
    setHasLoaded(true);
  }, [submissionId]);

  const risk = useMemo(() => getRiskTone(submission?.riskScore || 0), [submission]);

  const handleAction = (newStatus) => {
    if (!submissionId) return;
    updateSubmissionStatus(submissionId, newStatus);
    setSubmission((prev) => prev ? { ...prev, status: newStatus } : prev);
    setActionMsg(`Marked as ${newStatus}`);
    setTimeout(() => setActionMsg(""), 3000);
  };

  const riskFlagEntries = useMemo(() => {
    if (!submission?.riskFlags) return [];
    return Object.entries(submission.riskFlags).map(([key, val]) => ({
      key,
      val,
      meta: FLAG_META[key] || { label: key.replace(/_/g, " "), severity: "info", desc: "Custom or unlabelled risk signal." },
    }));
  }, [submission]);

  const criticalFlags = riskFlagEntries.filter((f) => f.meta.severity === "critical");
  const highFlags     = riskFlagEntries.filter((f) => f.meta.severity === "high");
  const otherFlags    = riskFlagEntries.filter((f) => !["critical", "high"].includes(f.meta.severity));

  const ocrFields = useMemo(() => {
    const fields = submission?.ocrData?.extractedFields || {};
    return Object.entries(fields).filter(([, v]) => v !== null && v !== undefined && v !== "");
  }, [submission]);

  if (!hasLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F1F5F9]">
        <p className="text-sm text-[#94A3B8]">Loading…</p>
      </div>
    );
  }

  if (!submission) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F1F5F9]">
        <div className="rounded-2xl bg-white p-10 text-center shadow-sm">
          <h1 className="text-xl font-bold text-[#0B1324]">Submission not found</h1>
          <p className="mt-2 text-sm text-[#64748B]">The KYC submission could not be located.</p>
          <Link href="/admin" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[var(--brand)] px-5 py-2 text-sm font-bold text-white">
            <ChevronLeftIcon className="h-4 w-4" /> Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  const gaugeStyle = {
    background: `conic-gradient(${risk.color} ${submission.riskScore}%, ${risk.track} 0)`,
  };

  const TABS = [
    { id: "overview",  label: "Overview" },
    { id: "documents", label: "Document & OCR" },
    { id: "forgery",   label: "Forgery Analysis" },
    { id: "face",      label: "Face Verification" },
    { id: "risk",      label: `Risk Flags (${riskFlagEntries.length})` },
    { id: "details",   label: "Full Details" },
  ];

  return (
    <div className="flex min-h-screen bg-[#F1F5F9]">
      {/* Sidebar */}
      <aside className="flex w-56 flex-shrink-0 flex-col bg-[#0F172A] text-white">
        <div className="flex h-16 items-center gap-3 border-b border-white/10 px-4">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-[var(--brand)] text-sm font-bold">e</div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-white/50">eKS</p>
            <p className="text-sm font-bold">Admin Panel</p>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-1 py-4 px-2">
          <Link href="/admin" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-white/60 hover:bg-white/10 hover:text-white">
            <span>⬡</span> Dashboard
          </Link>
          <div className="flex items-center gap-3 rounded-xl bg-[var(--brand)] px-3 py-2.5 text-sm font-semibold text-white">
            <span>≡</span> Reviewing
          </div>
          <Link href="/admin" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-white/60 hover:bg-white/10 hover:text-white">
            <span>◈</span> Analytics
          </Link>
        </nav>
        {/* Applicant quick info */}
        <div className="border-t border-white/10 p-3 space-y-2">
          <div className="flex items-center gap-2 px-2 py-1">
            <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-[var(--brand)]/20 text-xs font-bold text-[var(--brand)]">
              {submission.name?.split(" ").map((p) => p[0]).slice(0, 2).join("")}
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-white">{submission.name}</p>
              <p className="truncate text-[10px] text-white/40">{submission.id}</p>
            </div>
          </div>
          <div className={`rounded-lg px-2 py-1 text-center text-xs font-semibold ${STATUS_COLORS[submission.status] || "bg-gray-100 text-gray-600"}`}>
            {submission.status}
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Top bar */}
        <header className="flex h-16 flex-shrink-0 items-center justify-between border-b border-[#E2E8F0] bg-white px-6">
          <Link href="/admin" className="flex items-center gap-2 text-sm font-semibold text-[#64748B] hover:text-[#0B1324]">
            <ChevronLeftIcon className="h-4 w-4" /> All Submissions
          </Link>
          <div className="flex items-center gap-2">
            {actionMsg && (
              <span className="rounded-xl bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">✓ {actionMsg}</span>
            )}
            <button onClick={() => handleAction("Approved")} disabled={submission.status === "Approved"}
              className="rounded-xl bg-emerald-500 px-4 py-2 text-xs font-bold text-white transition hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed">
              ✓ Approve
            </button>
            <button onClick={() => handleAction("Flagged")} disabled={submission.status === "Flagged"}
              className="rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-white transition hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed">
              ⚑ Flag
            </button>
            <button onClick={() => handleAction("Rejected")} disabled={submission.status === "Rejected"}
              className="rounded-xl bg-red-500 px-4 py-2 text-xs font-bold text-white transition hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed">
              ✕ Reject
            </button>
          </div>
        </header>

        {/* Applicant identity bar */}
        <div className="border-b border-[#E2E8F0] bg-white px-6 py-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[var(--brand)] to-emerald-700 text-lg font-bold text-white shadow">
              {submission.name?.split(" ").map((p) => p[0]).slice(0, 2).join("")}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-bold text-[#0B1324]">{submission.name}</h1>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${risk.pill}`}>{risk.label}</span>
                <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_COLORS[submission.status] || ""}`}>{submission.status}</span>
              </div>
              <div className="mt-1 flex flex-wrap gap-3 text-xs text-[#64748B]">
                {submission.email && <span className="flex items-center gap-1"><MailIcon className="h-3 w-3" />{submission.email}</span>}
                {submission.phone && <span className="flex items-center gap-1"><PhoneIcon className="h-3 w-3" />{submission.phone}</span>}
                <span className="flex items-center gap-1"><CalendarIcon className="h-3 w-3" />{submission.submittedAt}</span>
                <span className="flex items-center gap-1"><ShieldIcon className="h-3 w-3" />{submission.documentType} · {submission.documentNumber}</span>
              </div>
            </div>
            {/* Risk score mini gauge */}
            <div className="flex items-center gap-3 rounded-xl border border-[#E2E8F0] px-4 py-2">
              <div className="relative h-10 w-10">
                <div className="absolute inset-0 rounded-full" style={gaugeStyle} />
                <div className="absolute inset-1 rounded-full bg-white" />
                <p className="absolute inset-0 flex items-center justify-center text-xs font-bold text-[#0B1324]">{submission.riskScore}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-[#0B1324]">Risk Score</p>
                <p className="text-xs text-[#94A3B8]">{risk.label}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 overflow-x-auto border-b border-[#E2E8F0] bg-white px-6">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveSection(tab.id)}
              className={`flex-shrink-0 border-b-2 px-4 py-3 text-xs font-semibold transition ${
                activeSection === tab.id
                  ? "border-[var(--brand)] text-[var(--brand)]"
                  : "border-transparent text-[#64748B] hover:text-[#0B1324]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <main className="flex-1 overflow-y-auto p-6">
          {/* ── OVERVIEW ── */}
          {activeSection === "overview" && (
            <div className="grid gap-5 lg:grid-cols-2">
              {/* Risk gauge */}
              <SectionCard title="Risk Score" badge={risk.label}>
                <div className="flex flex-col items-center gap-3 py-2">
                  <div className="relative flex h-40 w-40 items-center justify-center">
                    <div className="absolute inset-0 rounded-full" style={gaugeStyle} />
                    <div className="absolute inset-4 rounded-full bg-white" />
                    <div className="relative z-10 text-center">
                      <p className="text-4xl font-bold text-[#0B1324]">{submission.riskScore}</p>
                      <p className="text-xs font-semibold uppercase tracking-wide text-[#94A3B8]">/ 100</p>
                    </div>
                  </div>
                  <div className="w-full space-y-2">
                    {[
                      { label: "Low (0–39)",      range: [0,39],  color: "bg-emerald-400" },
                      { label: "Moderate (40–69)", range: [40,69], color: "bg-amber-400"   },
                      { label: "High (70–100)",    range: [70,100],color: "bg-red-500"     },
                    ].map((band) => (
                      <div key={band.label} className="flex items-center gap-2 text-xs">
                        <span className={`h-2 w-2 flex-shrink-0 rounded-full ${band.color}`} />
                        <span className="text-[#64748B]">{band.label}</span>
                        {submission.riskScore >= band.range[0] && submission.riskScore <= band.range[1] && (
                          <span className="ml-auto font-semibold text-[#0B1324]">← current</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </SectionCard>

              {/* Critical alerts */}
              <SectionCard title="Active Alerts" badge={`${criticalFlags.length + highFlags.length} issues`}>
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {criticalFlags.length === 0 && highFlags.length === 0 ? (
                    <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                      ✓ No critical or high-severity flags detected.
                    </div>
                  ) : (
                    [...criticalFlags, ...highFlags].map(({ key, val, meta }) => {
                      const s = SEVERITY_STYLE[meta.severity];
                      return (
                        <div key={key} className={`rounded-xl border px-3 py-2.5 ${s.bg} ${s.border}`}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-start gap-2">
                              <span className={`mt-0.5 h-2 w-2 flex-shrink-0 rounded-full ${s.dot}`} />
                              <div>
                                <p className={`text-xs font-bold ${s.text}`}>{meta.label}</p>
                                <p className={`mt-0.5 text-xs ${s.text} opacity-80`}>{meta.desc}</p>
                              </div>
                            </div>
                            <div className="flex-shrink-0 text-right">
                              <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${s.badge}`}>
                                {typeof val === "boolean" ? (val ? "YES" : "NO") : String(val)}
                              </span>
                              {meta.impact && (
                                <p className={`mt-0.5 text-[10px] font-semibold ${s.text}`}>{meta.impact}</p>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </SectionCard>

              {/* Document summary */}
              <SectionCard title="Document Summary">
                <div className="space-y-1">
                  <InfoRow label="Document Type" value={submission.documentType} />
                  <InfoRow label="Document Number" value={submission.documentNumber} />
                  <InfoRow label="Issued Date" value={submission.documentIssuedDate} />
                  <InfoRow label="Issued Place" value={submission.documentIssuedPlace} />
                  {submission.forgeryDecision && (
                    <div className="pt-2">
                      <ForgeryDecisionBadge decision={submission.forgeryDecision} score={submission.forgeryScore} />
                    </div>
                  )}
                </div>
              </SectionCard>

              {/* Face match summary */}
              <SectionCard title="Face Verification Summary">
                <div className="space-y-3">
                  {submission.faceSimilarity !== null && submission.faceSimilarity !== undefined ? (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-[#64748B]">Similarity Score</span>
                        <span className={`text-2xl font-bold ${submission.faceSimilarity >= 0.65 ? "text-emerald-600" : submission.faceSimilarity >= 0.5 ? "text-amber-600" : "text-red-600"}`}>
                          {(submission.faceSimilarity * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div className="h-3 rounded-full bg-[#F1F5F9]">
                        <div
                          className={`h-3 rounded-full transition-all ${submission.faceSimilarity >= 0.65 ? "bg-emerald-500" : submission.faceSimilarity >= 0.5 ? "bg-amber-400" : "bg-red-500"}`}
                          style={{ width: `${submission.faceSimilarity * 100}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-xs text-[#94A3B8]">
                        <span>0% (no match)</span>
                        <span className="font-semibold text-[#64748B]">threshold: 65%</span>
                        <span>100% (identical)</span>
                      </div>
                      <div className={`rounded-xl border px-4 py-2.5 text-sm font-semibold ${
                        submission.faceIsMatch
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : submission.faceSimilarity >= 0.5
                          ? "border-amber-200 bg-amber-50 text-amber-700"
                          : "border-red-200 bg-red-50 text-red-700"
                      }`}>
                        {submission.faceIsMatch
                          ? "✓ Face match confirmed — selfie matches document photo"
                          : submission.faceSimilarity >= 0.5
                          ? "⚑ Uncertain match — below the 65% confidence threshold"
                          : "✕ Face mismatch — selfie does not match the document photo"}
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-[#94A3B8]">Face comparison data not available.</p>
                  )}
                </div>
              </SectionCard>
            </div>
          )}

          {/* ── DOCUMENTS & OCR ── */}
          {activeSection === "documents" && (
            <div className="grid gap-5 lg:grid-cols-2">
              {/* Document images */}
              <SectionCard title="Document Images" badge={submission.documentType}>
                <div className="space-y-3">
                  {submission.documentImage || submission.documentUrl ? (
                    <div>
                      <p className="mb-1.5 text-xs font-semibold text-[#94A3B8] uppercase tracking-wide">Front</p>
                      <div className="overflow-hidden rounded-xl border border-dashed border-[#CBD5E1] bg-[#F8FAFC]">
                        <img
                          src={submission.documentImage || submission.documentUrl}
                          alt="Document front"
                          className="w-full object-contain max-h-64"
                        />
                      </div>
                      {submission.documentUrl && (
                        <a href={submission.documentUrl} target="_blank" rel="noreferrer"
                          className="mt-1.5 block text-xs font-semibold text-[var(--brand)] hover:underline">
                          Open Cloudinary original ↗
                        </a>
                      )}
                    </div>
                  ) : (
                    <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-[#CBD5E1] bg-[#F8FAFC]">
                      <p className="text-sm text-[#94A3B8]">No document image available</p>
                    </div>
                  )}
                  {(submission.documentBackImage) && (
                    <div>
                      <p className="mb-1.5 text-xs font-semibold text-[#94A3B8] uppercase tracking-wide">Back</p>
                      <div className="overflow-hidden rounded-xl border border-dashed border-[#CBD5E1] bg-[#F8FAFC]">
                        <img src={submission.documentBackImage} alt="Document back" className="w-full object-contain max-h-64" />
                      </div>
                    </div>
                  )}
                </div>
              </SectionCard>

              {/* OCR Results */}
              <SectionCard title="OCR Extracted Data" badge={submission.ocrData?.documentType || "—"}>
                {submission.ocrData ? (
                  <div className="space-y-4">
                    {/* Key OCR identifiers */}
                    <div className="rounded-xl bg-[#F8FAFC] p-4 space-y-1">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#94A3B8]">Identified Values</p>
                      <InfoRow label="Name on Document" value={submission.ocrData.name} />
                      <InfoRow label="Document Number (OCR)" value={submission.ocrData.documentNumber} />
                      <InfoRow label="Document Type (OCR)" value={submission.ocrData.documentType} />
                      {submission.ocrData.confidenceScore !== null && (
                        <div className="flex items-center justify-between border-b border-[#F1F5F9] py-2.5">
                          <span className="text-xs text-[#94A3B8]">OCR Confidence</span>
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-20 rounded-full bg-[#E2E8F0]">
                              <div className="h-1.5 rounded-full bg-[var(--brand)]" style={{ width: `${(submission.ocrData.confidenceScore * 100).toFixed(0)}%` }} />
                            </div>
                            <span className="text-sm font-semibold text-[#0B1324]">{(submission.ocrData.confidenceScore * 100).toFixed(1)}%</span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Cross-check result */}
                    {submission.ocrData.name && submission.name && (
                      <div className={`rounded-xl border px-3 py-2.5 text-xs ${
                        submission.riskFlags?.name_mismatch
                          ? "border-red-200 bg-red-50 text-red-700"
                          : submission.riskFlags?.name_partial_mismatch
                          ? "border-amber-200 bg-amber-50 text-amber-700"
                          : "border-emerald-200 bg-emerald-50 text-emerald-700"
                      }`}>
                        <p className="font-bold mb-1">Name cross-check</p>
                        <p><span className="opacity-70">Entered: </span><strong>{submission.name}</strong></p>
                        <p><span className="opacity-70">On document: </span><strong>{submission.ocrData.name}</strong></p>
                        {submission.riskFlags?.ocr_name_similarity !== undefined && (
                          <p className="mt-1"><span className="opacity-70">Similarity: </span><strong>{submission.riskFlags.ocr_name_similarity}%</strong></p>
                        )}
                      </div>
                    )}

                    {/* All extracted fields */}
                    {ocrFields.length > 0 && (
                      <div>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#94A3B8]">All Extracted Fields</p>
                        <div className="divide-y divide-[#F1F5F9] rounded-xl border border-[#E2E8F0]">
                          {ocrFields.map(([key, val]) => (
                            <div key={key} className="flex items-start justify-between gap-3 px-3 py-2">
                              <span className="text-xs capitalize text-[#94A3B8]">{key.replace(/_/g, " ")}</span>
                              <span className="max-w-[60%] text-right text-xs font-semibold text-[#0B1324] break-words">
                                {Array.isArray(val) ? val.join(", ") : String(val)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Raw OCR text */}
                    {submission.ocrData.rawText && (
                      <div>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#94A3B8]">Raw OCR Text</p>
                        <pre className="max-h-40 overflow-y-auto rounded-xl bg-[#0F172A] p-3 text-xs text-[#94A3B8] whitespace-pre-wrap break-words">
                          {submission.ocrData.rawText}
                        </pre>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-[#94A3B8]">OCR data not available for this submission.</p>
                )}
              </SectionCard>
            </div>
          )}

          {/* ── FORGERY ANALYSIS ── */}
          {activeSection === "forgery" && (
            <div className="grid gap-5 lg:grid-cols-2">
              <div className="space-y-5">
                {/* Decision */}
                <SectionCard title="Forgery Verdict">
                  {submission.forgeryDecision ? (
                    <div className="space-y-4">
                      <ForgeryDecisionBadge decision={submission.forgeryDecision} score={submission.forgeryScore} />

                      {/* Score bar */}
                      {submission.forgeryScore !== null && submission.forgeryScore !== undefined && (
                        <div>
                          <div className="flex justify-between text-xs text-[#64748B] mb-1.5">
                            <span>Composite forgery score</span>
                            <span className="font-bold font-mono">{typeof submission.forgeryScore === "number" ? submission.forgeryScore.toFixed(2) : submission.forgeryScore}</span>
                          </div>
                          <div className="h-3 rounded-full bg-[#F1F5F9] relative">
                            <div
                              className={`h-3 rounded-full transition-all ${
                                submission.forgeryScore >= 71 ? "bg-red-500"
                                : submission.forgeryScore >= 35 ? "bg-amber-400"
                                : "bg-emerald-500"
                              }`}
                              style={{ width: `${Math.min(submission.forgeryScore, 100)}%` }}
                            />
                            {/* Decision threshold lines */}
                            <div className="absolute top-0 bottom-0 border-l-2 border-dashed border-emerald-500/50" style={{ left: "35%" }} title="Genuine threshold (35)" />
                            <div className="absolute top-0 bottom-0 border-l-2 border-dashed border-red-500/50" style={{ left: "71%" }} title="Forged threshold (71)" />
                          </div>
                          <div className="flex justify-between text-[10px] mt-1">
                            <span className="text-emerald-600 font-semibold">0–34: Genuine</span>
                            <span className="text-amber-600 font-semibold">35–70: Suspicious</span>
                            <span className="text-red-600 font-semibold">71–100: Forged</span>
                          </div>
                        </div>
                      )}

                      <div className="rounded-xl bg-[#F8FAFC] px-4 py-3 text-xs text-[#64748B] space-y-1">
                        <p><strong className="text-[#0B1324]">Genuine (0–34):</strong> All 6 forensic checks below acceptable thresholds.</p>
                        <p><strong className="text-[#0B1324]">Suspicious (35–70):</strong> One or more checks exceeded threshold. Manual review required.</p>
                        <p><strong className="text-[#0B1324]">Forged (71–100):</strong> Multiple strong signals of tampering detected.</p>
                        <p className="mt-1 text-[#94A3B8]">Score is a weighted sum of 6 checks (ELA 47% · EXIF 20% · Edge 5% · Font 10% · Noise 10% · Copy-Move 8%). For every check, <strong className="text-[#CBD5E1]">↑ higher score = more suspicious</strong>.</p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-[#94A3B8]">Forgery analysis was not performed or data unavailable.</p>
                  )}
                </SectionCard>

                {/* All 6 signal scores */}
                {submission.forgeryDetails && (
                  <SectionCard title="Weighted Signal Breakdown" badge="6 forensic checks">
                    <div className="space-y-3">
                      {(() => {
                        const fd = submission.forgeryDetails;
                        const details = fd.details || {};
                        const signals = [
                          {
                            label: "ELA (Error Level Analysis)",
                            weight: 0.42,
                            score: details.ela_score ?? null,
                            desc: "↑ Higher = more suspicious. JPEG re-compression artifacts reveal edited regions. Clean originals score near 0.",
                            subDetails: details.ela_mean_brightness != null ? [
                              { k: "ELA mean brightness", v: details.ela_mean_brightness?.toFixed(2) },
                            ] : [],
                          },
                          {
                            label: "EXIF Metadata Anomaly",
                            weight: 0.20,
                            score: fd.exif_anomaly_score ?? details.exif_anomaly_score ?? null,
                            desc: "↑ Higher = more suspicious. Missing, stripped or editing-software EXIF tags indicate post-processing. Unedited phone photos retain full EXIF.",
                            subDetails: details.exif ? [
                              details.exif.software != null && { k: "Software tag", v: details.exif.software || "absent" },
                              details.exif.exif_stripped != null && { k: "EXIF stripped", v: String(details.exif.exif_stripped) },
                              details.exif.missing_datetime_original && { k: "DateTimeOriginal", v: "missing" },
                              details.exif.editing_software_detected && { k: "Editing software", v: "detected ⚠" },
                              details.exif.exif_tag_count != null && { k: "EXIF tag count", v: String(details.exif.exif_tag_count) },
                            ].filter(Boolean) : [],
                          },
                          {
                            label: "Edge Inconsistency",
                            weight: 0.05,
                            score: fd.edge_consistency_score ?? null,
                            desc: "↑ Higher = more inconsistent edges = more suspicious. ⚠ Low-reliability signal for ID cards — citizenship documents always have mixed zones (photo, text, seal, border) that create naturally high edge variance. Weight reduced to 10%.",
                            subDetails: [],
                          },
                          {
                            label: "Font / Text Inconsistency",
                            weight: 0.10,
                            score: fd.font_consistency_score ?? details.font_consistency_score ?? null,
                            desc: "↑ Higher = more font-size variance = more suspicious. ⚠ ID documents intentionally use multiple font sizes (small field labels, medium values, large title) so moderate variance is normal. Threshold calibrated for document context (CV 0.55+).",
                            subDetails: details.font ? [
                              details.font.char_blobs != null && { k: "Character blobs", v: String(details.font.char_blobs) },
                              details.font.mean_char_height != null && { k: "Mean char height", v: `${details.font.mean_char_height}px` },
                              details.font.height_cv != null && { k: "Height CV (variance)", v: details.font.height_cv?.toFixed(4) },
                              details.font.height_cv != null && { k: "CV interpretation", v: details.font.height_cv < 0.55 ? "Normal for ID docs" : details.font.height_cv < 0.75 ? "Slightly elevated" : "High variance" },
                              details.font.skipped && { k: "Skipped", v: details.font.skipped },
                            ].filter(Boolean) : [],
                          },
                          {
                            label: "Noise Pattern",
                            weight: 0.10,
                            score: fd.noise_score ?? null,
                            desc: "↑ Higher = more abnormal noise = more suspicious. Pasted or composited regions break the camera's native noise profile.",
                            subDetails: details.noise_std != null ? [
                              { k: "Noise std deviation", v: details.noise_std?.toFixed(2) },
                            ] : [],
                          },
                          {
                            label: "Copy-Move Detection",
                            weight: 0.08,
                            score: fd.copy_move_score ?? details.copy_move_score ?? null,
                            desc: "↑ Higher = more suspected cloned regions = more suspicious. ⚠ Weight reduced to 8%: documents with watermarks, seals and decorative borders generate many false-positive keypoint matches.",
                            subDetails: details.copy_move ? [
                              details.copy_move.keypoints_found != null && { k: "Keypoints detected", v: String(details.copy_move.keypoints_found) },
                              details.copy_move.suspicious_matches != null && { k: "Suspicious matches", v: String(details.copy_move.suspicious_matches) },
                              details.copy_move.suspicious_ratio != null && { k: "Suspicious ratio", v: `${(details.copy_move.suspicious_ratio * 100).toFixed(2)}%` },
                              details.copy_move.skipped && { k: "Skipped", v: details.copy_move.skipped },
                            ].filter(Boolean) : [],
                          },
                        ];
                        return signals.map((sig) => {
                          if (sig.score === null || sig.score === undefined) return null;
                          const contribution = sig.score * sig.weight;
                          const barColor = sig.score >= 70 ? "bg-red-500" : sig.score >= 35 ? "bg-amber-400" : "bg-emerald-500";
                          return (
                            <div key={sig.label} className="rounded-xl border border-[#E2E8F0] p-3">
                              <div className="flex items-start justify-between gap-2 mb-2">
                                <div>
                                  <span className="text-sm font-semibold text-[#0F172A]">{sig.label}</span>
                                  <span className="ml-2 rounded-full bg-[#F1F5F9] px-2 py-0.5 text-[10px] font-bold text-[#64748B]">
                                    {(sig.weight * 100).toFixed(0)}% weight
                                  </span>
                                </div>
                                <div className="flex-shrink-0 text-right">
                                  <span className={`text-sm font-bold ${sig.score >= 70 ? "text-red-600" : sig.score >= 35 ? "text-amber-600" : "text-emerald-600"}`}>
                                    {sig.score.toFixed(1)}
                                  </span>
                                  <span className="ml-1 text-[10px] text-[#94A3B8]">→ <strong className="text-[#64748B]">{contribution.toFixed(2)} pts</strong></span>
                                </div>
                              </div>
                              <div className="h-2 rounded-full bg-[#F1F5F9]">
                                <div className={`h-2 rounded-full transition-all ${barColor}`} style={{ width: `${Math.min(sig.score, 100)}%` }} />
                              </div>
                              <p className="mt-1.5 text-xs text-[#94A3B8]">{sig.desc}</p>
                              {sig.subDetails.length > 0 && (
                                <div className="mt-2 rounded-lg bg-[#F8FAFC] divide-y divide-[#F1F5F9]">
                                  {sig.subDetails.map(({ k, v }) => (
                                    <div key={k} className="flex items-center justify-between px-3 py-1.5">
                                      <span className="text-[10px] text-[#94A3B8]">{k}</span>
                                      <span className="text-[10px] font-semibold font-mono text-[#0B1324]">{v}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        });
                      })()}
                      {submission.forgeryScore !== null && submission.forgeryScore !== undefined && (
                        <div className="rounded-xl bg-[#0F172A] px-4 py-3 flex items-center justify-between">
                          <span className="text-sm font-semibold text-white/70">Total weighted score</span>
                          <span className={`text-lg font-bold ${
                            submission.forgeryScore >= 71 ? "text-red-400"
                            : submission.forgeryScore >= 35 ? "text-amber-400"
                            : "text-emerald-400"
                          }`}>{typeof submission.forgeryScore === "number" ? submission.forgeryScore.toFixed(2) : submission.forgeryScore}</span>
                        </div>
                      )}
                      {submission.forgeryDetails.processing_time_ms && (
                        <p className="text-xs text-[#94A3B8]">Analysis completed in {submission.forgeryDetails.processing_time_ms}ms</p>
                      )}
                    </div>
                  </SectionCard>
                )}
              </div>

              {/* Suspicious regions */}
              <div className="space-y-5">
                {submission.forgeryDetails?.suspicious_regions?.length > 0 ? (
                  <SectionCard title="Suspicious Regions" badge={`${submission.forgeryDetails.suspicious_regions.length} detected`}>
                    <div className="space-y-3 max-h-80 overflow-y-auto">
                      {submission.forgeryDetails.suspicious_regions.map((region, i) => (
                        <div key={i} className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                          <p className="text-xs font-bold text-red-700 mb-1">Region {i + 1}</p>
                          <div className="space-y-1">
                            {Object.entries(region).map(([k, v]) => (
                              <div key={k} className="flex items-center justify-between text-xs">
                                <span className="text-red-600 opacity-70 capitalize">{k.replace(/_/g, " ")}</span>
                                <span className="font-semibold text-red-800">{Array.isArray(v) ? `[${v.join(", ")}]` : String(v)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </SectionCard>
                ) : (
                  <SectionCard title="Suspicious Regions">
                    <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3">
                      <p className="text-sm font-semibold text-emerald-700">✓ No suspicious regions detected</p>
                      <p className="mt-0.5 text-xs text-emerald-600">The ELA analysis found no anomalous regions in the document image.</p>
                    </div>
                  </SectionCard>
                )}

                {/* Forgery details raw */}
                {submission.forgeryDetails?.details && Object.keys(submission.forgeryDetails.details).length > 0 && (
                  <SectionCard title="Raw Model Output">
                    <div className="space-y-1">
                      {Object.entries(submission.forgeryDetails.details).map(([k, v]) => {
                        const isNested = v !== null && typeof v === "object" && !Array.isArray(v);
                        if (isNested) {
                          return (
                            <div key={k} className="rounded-xl border border-[#E2E8F0] overflow-hidden">
                              <p className="bg-[#F8FAFC] px-3 py-1.5 text-xs font-bold text-[#64748B] capitalize">{k.replace(/_/g, " ")}</p>
                              <div className="divide-y divide-[#F8FAFC]">
                                {Object.entries(v).map(([sk, sv]) => (
                                  <div key={sk} className="flex items-start justify-between gap-3 px-3 py-1.5">
                                    <span className="text-xs capitalize text-[#94A3B8]">{sk.replace(/_/g, " ")}</span>
                                    <span className="max-w-[60%] text-right text-xs font-semibold text-[#0B1324] break-words">
                                      {Array.isArray(sv) ? sv.join(", ") : String(sv)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        }
                        return (
                          <div key={k} className="flex items-start justify-between gap-3 border-b border-[#F1F5F9] py-1.5">
                            <span className="text-xs capitalize text-[#94A3B8]">{k.replace(/_/g, " ")}</span>
                            <span className="max-w-[60%] text-right text-xs font-semibold text-[#0B1324] break-words font-mono">
                              {Array.isArray(v) ? v.join(", ") : String(v)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </SectionCard>
                )}
              </div>
            </div>
          )}

          {/* ── FACE VERIFICATION ── */}
          {activeSection === "face" && (
            <div className="grid gap-5 lg:grid-cols-2">
              <div className="space-y-5">
                {/* Document face crop */}
                <SectionCard title="Face from Document" badge="ML Extracted">
                  <div className="flex aspect-square max-h-64 items-center justify-center overflow-hidden rounded-xl border border-dashed border-[#CBD5E1] bg-[#F8FAFC]">
                    {submission.documentFaceUrl ? (
                      <img src={submission.documentFaceUrl} alt="Document face" className="h-full w-full object-contain" />
                    ) : (
                      <div className="text-center">
                        <p className="text-sm font-semibold text-[#94A3B8]">Not available</p>
                        <p className="mt-1 text-xs text-[#CBD5E1]">Face was not extracted from document</p>
                      </div>
                    )}
                  </div>
                  {submission.documentFaceUrl && (
                    <a href={submission.documentFaceUrl} target="_blank" rel="noreferrer"
                      className="mt-2 block text-xs font-semibold text-[var(--brand)] hover:underline">
                      View full resolution ↗
                    </a>
                  )}
                </SectionCard>

                {/* Selfie images */}
                <SectionCard title="Selfie Captures" badge="Front · Left · Right">
                  <div className="grid grid-cols-3 gap-2">
                    {["front", "left", "right"].map((angle) => (
                      <div key={angle} className="flex flex-col items-center gap-1.5 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-2">
                        <div className="flex h-24 w-full items-center justify-center overflow-hidden rounded-lg bg-white">
                          {submission.faceCaptures?.[angle] ? (
                            <img src={submission.faceCaptures[angle]} alt={`${angle} selfie`} className="h-full w-full object-cover" />
                          ) : (
                            <span className="text-[10px] text-[#CBD5E1]">—</span>
                          )}
                        </div>
                        <span className="text-xs font-semibold capitalize text-[#64748B]">{angle}</span>
                      </div>
                    ))}
                  </div>
                  {submission.selfieUrl && (
                    <a href={submission.selfieUrl} target="_blank" rel="noreferrer"
                      className="mt-2 block text-xs font-semibold text-[var(--brand)] hover:underline">
                      View uploaded selfie on Cloudinary ↗
                    </a>
                  )}
                  {submission.faceVideoUrl && (
                    <div className="mt-3">
                      <p className="mb-1.5 text-xs font-semibold text-[#94A3B8] uppercase tracking-wide">Face Video</p>
                      <video className="w-full rounded-xl border border-[#E2E8F0]" src={submission.faceVideoUrl} controls />
                    </div>
                  )}
                </SectionCard>
              </div>

              <div className="space-y-5">
                {/* Similarity deep-dive */}
                <SectionCard title="Similarity Analysis">
                  {submission.faceSimilarity !== null && submission.faceSimilarity !== undefined ? (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-[#64748B]">Cosine Similarity</p>
                          <p className="text-4xl font-bold text-[#0B1324]">{(submission.faceSimilarity * 100).toFixed(2)}%</p>
                        </div>
                        <div className={`rounded-xl px-4 py-2 text-center text-sm font-bold ${
                          submission.faceIsMatch ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                        }`}>
                          {submission.faceIsMatch ? "✓ MATCH" : "✕ NO MATCH"}
                        </div>
                      </div>
                      <div className="h-4 rounded-full bg-[#F1F5F9] relative">
                        <div
                          className={`h-4 rounded-full transition-all ${submission.faceSimilarity >= 0.65 ? "bg-emerald-500" : submission.faceSimilarity >= 0.5 ? "bg-amber-400" : "bg-red-500"}`}
                          style={{ width: `${submission.faceSimilarity * 100}%` }}
                        />
                        {/* Threshold line at 65% */}
                        <div className="absolute top-0 bottom-0 border-l-2 border-dashed border-[#0B1324]/30" style={{ left: "65%" }} />
                      </div>
                      <p className="text-xs text-[#94A3B8] text-center">Dashed line = 65% match threshold</p>
                      <div className="rounded-xl bg-[#F8FAFC] p-4 space-y-1 text-xs">
                        <p><span className="text-[#94A3B8]">Raw value: </span><span className="font-mono font-semibold text-[#0B1324]">{submission.faceSimilarity}</span></p>
                        <p><span className="text-[#94A3B8]">Algorithm: </span><span className="font-semibold text-[#0B1324]">InsightFace buffalo_l (ArcFace)</span></p>
                        <p><span className="text-[#94A3B8]">Threshold: </span><span className="font-semibold text-[#0B1324]">0.65</span></p>
                        <p><span className="text-[#94A3B8]">Match: </span><span className={`font-semibold ${submission.faceIsMatch ? "text-emerald-600" : "text-red-600"}`}>{submission.faceIsMatch ? "Yes" : "No"}</span></p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-[#94A3B8]">Face comparison data not available.</p>
                  )}
                </SectionCard>
              </div>
            </div>
          )}

          {/* ── RISK FLAGS ── */}
          {activeSection === "risk" && (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-[#0B1324]">All Risk Flags</h2>
                  <p className="text-sm text-[#64748B]">{riskFlagEntries.length} signals detected across all checks</p>
                </div>
                <div className="flex gap-2 text-xs">
                  {criticalFlags.length > 0 && <span className="rounded-full bg-red-100 px-3 py-1 font-semibold text-red-700">{criticalFlags.length} critical</span>}
                  {highFlags.length > 0 && <span className="rounded-full bg-orange-100 px-3 py-1 font-semibold text-orange-700">{highFlags.length} high</span>}
                </div>
              </div>

              {riskFlagEntries.length === 0 ? (
                <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
                  <p className="text-2xl mb-2">✓</p>
                  <p className="font-semibold text-emerald-700">No risk flags detected</p>
                  <p className="text-sm text-[#94A3B8] mt-1">This submission passed all automated checks.</p>
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {[...criticalFlags, ...highFlags, ...otherFlags].map(({ key, val, meta }) => {
                    const s = SEVERITY_STYLE[meta.severity];
                    const displayVal = typeof val === "boolean"
                      ? (val ? "TRUE" : "FALSE")
                      : typeof val === "number" && (key.includes("similarity") || key.includes("score"))
                      ? val.toString().length > 8 ? Number(val).toFixed(4) : String(val)
                      : String(val);
                    return (
                      <div key={key} className={`rounded-2xl border p-4 ${s.bg} ${s.border}`}>
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div className="flex items-center gap-2">
                            <span className={`h-2 w-2 flex-shrink-0 rounded-full ${s.dot}`} />
                            <span className={`text-xs font-bold uppercase tracking-wide ${s.text}`}>{meta.severity}</span>
                          </div>
                          {meta.impact && (
                            <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${s.badge}`}>{meta.impact}</span>
                          )}
                        </div>
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className={`font-bold text-sm ${s.text}`}>{meta.label}</p>
                            <p className={`mt-0.5 text-xs ${s.text} opacity-75`}>{meta.desc}</p>
                          </div>
                          <div className={`flex-shrink-0 rounded-lg px-3 py-1.5 text-center font-mono text-sm font-bold ${s.badge}`}>
                            {displayVal}
                          </div>
                        </div>
                        <p className="mt-2 text-[10px] font-mono text-[#94A3B8] opacity-60">{key}</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── FULL DETAILS ── */}
          {activeSection === "details" && (
            <div className="grid gap-5 lg:grid-cols-2">
              <SectionCard title="Personal Information">
                <InfoRow label="Full Name" value={submission.name} />
                <InfoRow label="Date of Birth" value={submission.dob} />
                <InfoRow label="Gender" value={submission.gender} />
                <InfoRow label="Nationality" value={submission.nationality} />
                <InfoRow label="Marital Status" value={submission.maritalStatus} />
                <InfoRow label="Family Side" value={submission.familySide} />
                <InfoRow label="Father / Husband" value={submission.fatherName} />
                <InfoRow label="Grandfather / Father-in-law" value={submission.grandfatherName} />
                <InfoRow label="Mother / Wife" value={submission.motherName} />
                <InfoRow label="Grandmother / Mother-in-law" value={submission.grandmotherName} />
                <InfoRow label="Occupation" value={submission.occupation} />
                <InfoRow label="PAN Number" value={submission.panNumber} />
                <InfoRow label="Phone" value={submission.phone} />
                <InfoRow label="Email" value={submission.email} />
              </SectionCard>

              <SectionCard title="Submission Metadata">
                <InfoRow label="Submission ID" value={submission.id} />
                <InfoRow label="Session ID" value={submission.sessionId} />
                <InfoRow label="Submitted At" value={submission.submittedAt} />
                <InfoRow label="Channel" value={submission.channel} />
                <InfoRow label="Status" value={submission.status} />
                <InfoRow label="Risk Score" value={submission.riskScore} />
              </SectionCard>

              <SectionCard title="Current Address">
                <InfoRow label="Province" value={submission.currentAddress?.province} />
                <InfoRow label="District" value={submission.currentAddress?.district} />
                <InfoRow label="Municipality" value={submission.currentAddress?.municipality} />
                <InfoRow label="Ward" value={submission.currentAddress?.ward} />
                <InfoRow label="Street / Tole" value={submission.currentAddress?.street} />
              </SectionCard>

              <SectionCard title="Permanent Address">
                <InfoRow label="Province" value={submission.permanentAddress?.province} />
                <InfoRow label="District" value={submission.permanentAddress?.district} />
                <InfoRow label="Municipality" value={submission.permanentAddress?.municipality} />
                <InfoRow label="Ward" value={submission.permanentAddress?.ward} />
                <InfoRow label="Street / Tole" value={submission.permanentAddress?.street} />
              </SectionCard>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
