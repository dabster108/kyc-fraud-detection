"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  CalendarIcon,
  ChevronLeftIcon,
  MailIcon,
  PhoneIcon,
  ShieldIcon,
  UserIcon,
} from "../../components/icons";
import { getSubmissionById } from "../submissions";

const getRiskTone = (score) => {
  if (score >= 70) {
    return {
      label: "High Risk",
      pill: "bg-red-100 text-red-700",
      color: "#EF4444",
      track: "#FEE2E2",
      caption: "Multiple matches on watchlists and document anomalies detected.",
    };
  }

  if (score >= 40) {
    return {
      label: "Moderate Risk",
      pill: "bg-amber-100 text-amber-700",
      color: "#F59E0B",
      track: "#FEF3C7",
      caption: "Minor mismatches in metadata fields requiring confirmation.",
    };
  }

  return {
    label: "Low Risk",
    pill: "bg-green-100 text-green-700",
    color: "#22C55E",
    track: "#DCFCE7",
    caption: "No conflicting signals across document or face match checks.",
  };
};

const progressStyle = (value, color) => ({
  width: `${value}%`,
  backgroundColor: color,
});

export default function SubmissionDetailPage() {
  const routeParams = useParams();
  const submissionId = Array.isArray(routeParams?.id)
    ? routeParams.id[0]
    : routeParams?.id;
  const [submission, setSubmission] = useState(null);
  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => {
    if (!submissionId) {
      return;
    }
    setSubmission(getSubmissionById(submissionId));
    setHasLoaded(true);
  }, [submissionId]);

  const resolvedSubmission = submission;

  const risk = useMemo(() => {
    if (!resolvedSubmission) {
      return getRiskTone(0);
    }
    return getRiskTone(resolvedSubmission.riskScore || 0);
  }, [resolvedSubmission]);

  const gaugeStyle = useMemo(() => {
    const score = resolvedSubmission?.riskScore || 0;
    return {
      background: `conic-gradient(${risk.color} ${score}%, ${risk.track} 0)`,
    };
  }, [resolvedSubmission, risk]);

  if (!hasLoaded) {
    return (
      <div className="min-h-screen bg-[var(--canvas)] text-[var(--ink)]">
        <main className="mx-auto flex w-full max-w-4xl flex-col items-center px-6 py-20">
          <div className="rounded-2xl bg-white p-10 text-center shadow-[0_20px_50px_rgba(15,23,42,0.08)]">
            <p className="text-sm text-[#64748B]">Loading submission...</p>
          </div>
        </main>
      </div>
    );
  }

  if (!resolvedSubmission) {
    return (
      <div className="min-h-screen bg-[var(--canvas)] text-[var(--ink)]">
        <main className="mx-auto flex w-full max-w-4xl flex-col items-center px-6 py-20">
          <div className="rounded-2xl bg-white p-10 text-center shadow-[0_20px_50px_rgba(15,23,42,0.08)]">
            <h1 className="text-2xl font-semibold text-[#0B1324]">
              Submission not found
            </h1>
            <p className="mt-2 text-sm text-[#64748B]">
              The requested KYC submission could not be located.
            </p>
            <Link
              href="/admin"
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-[var(--brand)] px-5 py-2 text-sm font-semibold text-white"
            >
              <ChevronLeftIcon className="h-4 w-4" />
              Back to dashboard
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--canvas)] text-[var(--ink)]">
      <header className="sticky top-0 z-10 w-full border-b border-white/70 bg-white/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--brand)]/10 text-[var(--brand)]">
              <ShieldIcon className="h-6 w-6" />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[#94A3B8]">
                KYC Review Desk
              </p>
              <p className="font-display text-xl font-semibold text-[#0B1324]">eKS Admin</p>
            </div>
          </div>
          <nav className="flex items-center gap-4 text-sm font-semibold text-[#64748B]">
            <Link href="/" className="transition hover:text-[#0F172A]">
              Core Dashboard
            </Link>
            <Link href="/admin" className="transition hover:text-[#0F172A]">
              Admin Queue
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-10">
        <section className="rounded-2xl bg-white p-8 shadow-[0_20px_50px_rgba(15,23,42,0.08)]">
          <Link
            href="/admin"
            className="inline-flex items-center gap-2 text-sm font-semibold text-[#64748B] transition hover:text-[#0F172A]"
          >
            <ChevronLeftIcon className="h-4 w-4" />
            Back to submissions
          </Link>

          <div className="mt-6 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-5">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#E2E8F0] text-xl font-semibold text-[#0B1324]">
                {resolvedSubmission.name
                  .split(" ")
                  .map((part) => part[0])
                  .slice(0, 2)
                  .join("")}
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="text-2xl font-semibold text-[#0B1324]">
                    {resolvedSubmission.name}
                  </h1>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${risk.pill}`}>
                    {risk.label}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-[#64748B]">
                  <span className="inline-flex items-center gap-2">
                    <MailIcon className="h-4 w-4" />
                    {resolvedSubmission.email}
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <CalendarIcon className="h-4 w-4" />
                    {resolvedSubmission.submittedAt}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <button className="rounded-full bg-green-500 px-5 py-2 text-sm font-semibold text-white">
                Approve
              </button>
              <button className="rounded-full bg-amber-500 px-5 py-2 text-sm font-semibold text-white">
                Flag
              </button>
              <button className="rounded-full bg-red-500 px-5 py-2 text-sm font-semibold text-white">
                Reject
              </button>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="flex flex-col gap-6 lg:col-span-5">
            <div className="rounded-2xl bg-white p-6 shadow-[0_20px_50px_rgba(15,23,42,0.08)]">
              <div className="flex items-center justify-between text-sm font-semibold text-[#64748B]">
                <span className="inline-flex items-center gap-2">
                  <UserIcon className="h-4 w-4 text-[#94A3B8]" />
                  Uploaded Document
                </span>
                <span className="rounded-full bg-[#F8FAFC] px-3 py-1 text-xs text-[#64748B]">
                  {resolvedSubmission.documentType}
                </span>
              </div>
              <div className="mt-4 flex aspect-[4/3] items-center justify-center overflow-hidden rounded-2xl border border-dashed border-[#CBD5E1] bg-[#F8FAFC]">
                {resolvedSubmission.documentImage ? (
                  <img
                    src={resolvedSubmission.documentImage}
                    alt="Submitted document"
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <div className="text-center">
                    <p className="text-sm font-semibold text-[#0B1324]">
                      Document Preview
                    </p>
                    <p className="mt-1 text-xs text-[#64748B]">
                      Secure scan stored in vault
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-2xl bg-white p-6 shadow-[0_20px_50px_rgba(15,23,42,0.08)]">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#64748B]">
                <ShieldIcon className="h-4 w-4 text-[#94A3B8]" />
                Computed Attributes
              </div>
              <div className="mt-4 rounded-2xl bg-[#F8FAFC] p-4 text-sm text-[#0F172A]">
                <div className="flex items-center justify-between border-b border-[#E2E8F0] py-2">
                  <span className="text-[#64748B]">Submission ID</span>
                  <span className="font-semibold">{resolvedSubmission.id}</span>
                </div>
                <div className="flex items-center justify-between border-b border-[#E2E8F0] py-2">
                  <span className="text-[#64748B]">Document Number</span>
                  <span className="font-semibold">{resolvedSubmission.documentNumber}</span>
                </div>
                <div className="flex items-center justify-between border-b border-[#E2E8F0] py-2">
                  <span className="text-[#64748B]">Document File</span>
                  <span className="font-semibold">
                    {resolvedSubmission.documentFileName || "-"}
                  </span>
                </div>
                <div className="flex items-center justify-between border-b border-[#E2E8F0] py-2">
                  <span className="text-[#64748B]">Registered Address</span>
                  <span className="font-semibold">{resolvedSubmission.address}</span>
                </div>
                <div className="flex items-center justify-between border-b border-[#E2E8F0] py-2">
                  <span className="text-[#64748B]">Date of Birth</span>
                  <span className="font-semibold">{resolvedSubmission.dob || "-"}</span>
                </div>
                <div className="flex items-center justify-between border-b border-[#E2E8F0] py-2">
                  <span className="text-[#64748B]">Nationality</span>
                  <span className="font-semibold">
                    {resolvedSubmission.nationality || "-"}
                  </span>
                </div>
                <div className="flex items-center justify-between border-b border-[#E2E8F0] py-2">
                  <span className="text-[#64748B]">Gender</span>
                  <span className="font-semibold">{resolvedSubmission.gender || "-"}</span>
                </div>
                <div className="flex items-center justify-between border-b border-[#E2E8F0] py-2">
                  <span className="text-[#64748B]">Family Side</span>
                  <span className="font-semibold">
                    {resolvedSubmission.familySide || "-"}
                  </span>
                </div>
                <div className="flex items-center justify-between border-b border-[#E2E8F0] py-2">
                  <span className="text-[#64748B]">Father / Husband</span>
                  <span className="font-semibold">
                    {resolvedSubmission.fatherName || "-"}
                  </span>
                </div>
                <div className="flex items-center justify-between border-b border-[#E2E8F0] py-2">
                  <span className="text-[#64748B]">Grandfather / Father-in-law</span>
                  <span className="font-semibold">
                    {resolvedSubmission.grandfatherName || "-"}
                  </span>
                </div>
                <div className="flex items-center justify-between border-b border-[#E2E8F0] py-2">
                  <span className="text-[#64748B]">Marital Status</span>
                  <span className="font-semibold">
                    {resolvedSubmission.maritalStatus || "-"}
                  </span>
                </div>
                <div className="flex items-center justify-between border-b border-[#E2E8F0] py-2">
                  <span className="text-[#64748B]">Contact Phone</span>
                  <span className="inline-flex items-center gap-2 font-semibold">
                    <PhoneIcon className="h-4 w-4" />
                    {resolvedSubmission.phone || "-"}
                  </span>
                </div>
                <div className="flex items-center justify-between border-b border-[#E2E8F0] py-2">
                  <span className="text-[#64748B]">Status</span>
                  <span className="font-semibold">{resolvedSubmission.status}</span>
                </div>
                <div className="flex items-center justify-between border-b border-[#E2E8F0] py-2">
                  <span className="text-[#64748B]">Occupation</span>
                  <span className="font-semibold">
                    {resolvedSubmission.occupation || "-"}
                  </span>
                </div>
                <div className="flex items-center justify-between border-b border-[#E2E8F0] py-2">
                  <span className="text-[#64748B]">PAN Number</span>
                  <span className="font-semibold">
                    {resolvedSubmission.panNumber || "-"}
                  </span>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-[#64748B]">Verification Channel</span>
                  <span className="font-semibold">{resolvedSubmission.channel}</span>
                </div>
              </div>
            </div>

            <div className="rounded-2xl bg-white p-6 shadow-[0_20px_50px_rgba(15,23,42,0.08)]">
              <div className="flex items-center justify-between text-sm font-semibold text-[#64748B]">
                <span>Address Details</span>
                <span className="rounded-full bg-[#F8FAFC] px-3 py-1 text-xs text-[#64748B]">
                  Current / Permanent
                </span>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#94A3B8]">
                    Current Address
                  </p>
                  <div className="mt-3 space-y-2 text-sm text-[#0F172A]">
                    <p>
                      <span className="text-[#64748B]">Province:</span>{" "}
                      {resolvedSubmission.currentAddress?.province || "-"}
                    </p>
                    <p>
                      <span className="text-[#64748B]">District:</span>{" "}
                      {resolvedSubmission.currentAddress?.district || "-"}
                    </p>
                    <p>
                      <span className="text-[#64748B]">Municipality:</span>{" "}
                      {resolvedSubmission.currentAddress?.municipality || "-"}
                    </p>
                    <p>
                      <span className="text-[#64748B]">Ward:</span>{" "}
                      {resolvedSubmission.currentAddress?.ward || "-"}
                    </p>
                    <p>
                      <span className="text-[#64748B]">Street:</span>{" "}
                      {resolvedSubmission.currentAddress?.street || "-"}
                    </p>
                  </div>
                </div>
                <div className="rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#94A3B8]">
                    Permanent Address
                  </p>
                  <div className="mt-3 space-y-2 text-sm text-[#0F172A]">
                    <p>
                      <span className="text-[#64748B]">Province:</span>{" "}
                      {resolvedSubmission.permanentAddress?.province || "-"}
                    </p>
                    <p>
                      <span className="text-[#64748B]">District:</span>{" "}
                      {resolvedSubmission.permanentAddress?.district || "-"}
                    </p>
                    <p>
                      <span className="text-[#64748B]">Municipality:</span>{" "}
                      {resolvedSubmission.permanentAddress?.municipality || "-"}
                    </p>
                    <p>
                      <span className="text-[#64748B]">Ward:</span>{" "}
                      {resolvedSubmission.permanentAddress?.ward || "-"}
                    </p>
                    <p>
                      <span className="text-[#64748B]">Street:</span>{" "}
                      {resolvedSubmission.permanentAddress?.street || "-"}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl bg-white p-6 shadow-[0_20px_50px_rgba(15,23,42,0.08)]">
              <div className="flex items-center justify-between text-sm font-semibold text-[#64748B]">
                <span>Face Capture Frames</span>
                <span className="rounded-full bg-[#F8FAFC] px-3 py-1 text-xs text-[#64748B]">
                  Front / Left / Right
                </span>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {["front", "left", "right"].map((angle) => (
                  <div
                    key={angle}
                    className="flex flex-col items-center gap-3 rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-3"
                  >
                    <div className="flex h-24 w-full items-center justify-center overflow-hidden rounded-xl bg-white">
                      {resolvedSubmission.faceCaptures?.[angle] ? (
                        <img
                          src={resolvedSubmission.faceCaptures[angle]}
                          alt={`${angle} capture`}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="text-xs font-semibold text-[#94A3B8]">
                          No image
                        </span>
                      )}
                    </div>
                    <span className="text-xs font-semibold text-[#64748B]">
                      {angle.charAt(0).toUpperCase() + angle.slice(1)}
                    </span>
                  </div>
                ))}
              </div>
              {resolvedSubmission.faceVideoUrl ? (
                <div className="mt-4">
                  <p className="text-xs font-semibold text-[#64748B]">
                    Face Capture Video
                  </p>
                  <video
                    className="mt-2 w-full rounded-2xl border border-[#E2E8F0]"
                    src={resolvedSubmission.faceVideoUrl}
                    controls
                  />
                </div>
              ) : null}
            </div>
          </div>

          <div className="flex flex-col gap-6 lg:col-span-7">
            <div className="rounded-2xl bg-white p-6 shadow-[0_20px_50px_rgba(15,23,42,0.08)]">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-[#64748B]">Risk Score</p>
                  <p className="text-xs text-[#94A3B8]">Automated decision engine</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${risk.pill}`}>
                  {risk.label}
                </span>
              </div>
              <div className="mt-6 flex flex-col items-center gap-4">
                <div className="relative flex h-48 w-48 items-center justify-center">
                  <div
                    className="absolute inset-0 rounded-full"
                    style={gaugeStyle}
                  />
                  <div className="absolute inset-3 rounded-full bg-white" />
                  <div className="relative z-10 text-center">
                    <p className="text-4xl font-semibold text-[#0B1324]">
                      {resolvedSubmission.riskScore}
                    </p>
                    <p className="text-xs font-semibold uppercase tracking-wide text-[#94A3B8]">
                      Risk Index
                    </p>
                  </div>
                </div>
                <p className="text-sm text-[#64748B]">{risk.caption}</p>
              </div>
            </div>

            <div className="rounded-2xl bg-white p-6 shadow-[0_20px_50px_rgba(15,23,42,0.08)]">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-[#0B1324]">
                  Score Breakdown
                </h3>
                <span className="rounded-full bg-[#F8FAFC] px-3 py-1 text-xs font-semibold text-[#64748B]">
                  Last updated 2h ago
                </span>
              </div>

              <div className="mt-6 flex flex-col gap-5">
                <div>
                  <div className="flex items-center justify-between text-sm font-semibold">
                    <span>Document Authenticity</span>
                    <span className="text-red-600">+24</span>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-[#F1F5F9]">
                    <div className="h-2 rounded-full" style={progressStyle(78, "#EF4444")} />
                  </div>
                  <p className="mt-2 text-xs text-[#94A3B8]">
                    OCR mismatch on microprint layer and MRZ checksum alert.
                  </p>
                </div>

                <div>
                  <div className="flex items-center justify-between text-sm font-semibold">
                    <span>Face Match Confidence</span>
                    <span className="text-amber-600">+14</span>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-[#F1F5F9]">
                    <div className="h-2 rounded-full" style={progressStyle(56, "#F59E0B")} />
                  </div>
                  <p className="mt-2 text-xs text-[#94A3B8]">
                    Lighting variance created partial mismatch in contour map.
                  </p>
                </div>

                <div>
                  <div className="flex items-center justify-between text-sm font-semibold">
                    <span>Device Integrity</span>
                    <span className="text-green-600">-8</span>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-[#F1F5F9]">
                    <div className="h-2 rounded-full" style={progressStyle(28, "#22C55E")} />
                  </div>
                  <p className="mt-2 text-xs text-[#94A3B8]">
                    Known device and stable IP history reduced risk.
                  </p>
                </div>

                <div>
                  <div className="flex items-center justify-between text-sm font-semibold">
                    <span>Geolocation Consistency</span>
                    <span className="text-amber-600">+9</span>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-[#F1F5F9]">
                    <div className="h-2 rounded-full" style={progressStyle(42, "#F59E0B")} />
                  </div>
                  <p className="mt-2 text-xs text-[#94A3B8]">
                    GPS session originated outside declared city limits.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
