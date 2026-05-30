"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchSubmissions } from "../../lib/adminApi";
import AdminSidebar from "./AdminSidebar";

const AUTH_KEY = "adminAuthed";

const STATUS_COLORS = {
  Approved: "bg-emerald-100 text-emerald-700",
  Flagged: "bg-amber-100 text-amber-700",
  Pending: "bg-blue-100 text-blue-700",
  Rejected: "bg-red-100 text-red-700",
};

const RISK_COLOR = (score) => {
  if (score >= 70) return "text-red-600 font-bold";
  if (score >= 40) return "text-amber-600 font-semibold";
  return "text-emerald-600 font-semibold";
};

const RISK_BAR_COLOR = (score) => {
  if (score >= 70) return "bg-red-500";
  if (score >= 40) return "bg-amber-400";
  return "bg-emerald-500";
};

export default function AdminPanelPage() {
  const router = useRouter();
  const [credentials, setCredentials] = useState({ username: "", password: "" });
  const [isAuthed, setIsAuthed] = useState(false);
  const [authError, setAuthError] = useState("");
  const [activeTab, setActiveTab] = useState("overview");
  const [submissions, setSubmissions] = useState([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [docFilter, setDocFilter] = useState("All");
  const [loadError, setLoadError] = useState("");

  const loadSubmissions = async () => {
    try {
      setLoadError("");
      const rows = await fetchSubmissions();
      setSubmissions(rows);
    } catch (err) {
      setLoadError(err.message || "Could not load submissions from server.");
      setSubmissions([]);
    }
  };

  useEffect(() => {
    const stored =
      typeof window !== "undefined" ? window.sessionStorage.getItem(AUTH_KEY) : null;
    if (stored === "1") {
      setIsAuthed(true);
      loadSubmissions();
    }
  }, []);

  const stats = useMemo(() => {
    const total = submissions.length;
    const pending = submissions.filter((s) => s.status === "Pending").length;
    const approved = submissions.filter((s) => s.status === "Approved").length;
    const flagged = submissions.filter((s) => s.status === "Flagged").length;
    const rejected = submissions.filter((s) => s.status === "Rejected").length;
    const highRisk = submissions.filter((s) => s.riskScore >= 70).length;
    const avgRisk = total
      ? Math.round(submissions.reduce((sum, s) => sum + (s.riskScore || 0), 0) / total)
      : 0;
    const approvalRate = total ? Math.round((approved / total) * 100) : 0;
    return { total, pending, approved, flagged, rejected, highRisk, avgRisk, approvalRate };
  }, [submissions]);

  const docTypeCounts = useMemo(() => {
    const counts = {};
    submissions.forEach((s) => {
      counts[s.documentType] = (counts[s.documentType] || 0) + 1;
    });
    return counts;
  }, [submissions]);

  const channelCounts = useMemo(() => {
    const counts = {};
    submissions.forEach((s) => {
      counts[s.channel || "Web"] = (counts[s.channel || "Web"] || 0) + 1;
    });
    return counts;
  }, [submissions]);

  const filteredSubmissions = useMemo(() => {
    return submissions.filter((s) => {
      const matchSearch =
        !search ||
        s.name?.toLowerCase().includes(search.toLowerCase()) ||
        s.email?.toLowerCase().includes(search.toLowerCase()) ||
        s.id?.toLowerCase().includes(search.toLowerCase()) ||
        s.documentNumber?.toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === "All" || s.status === statusFilter;
      const matchDoc = docFilter === "All" || s.documentType === docFilter;
      return matchSearch && matchStatus && matchDoc;
    });
  }, [submissions, search, statusFilter, docFilter]);

  const flaggedSubmissions = useMemo(
    () => submissions.filter((s) => s.status === "Flagged" || s.riskScore >= 70),
    [submissions]
  );

  const handleLogin = (e) => {
    e.preventDefault();
    if (credentials.username.trim() === "admin" && credentials.password.trim() === "admin") {
      setIsAuthed(true);
      if (typeof window !== "undefined") window.sessionStorage.setItem(AUTH_KEY, "1");
      setAuthError("");
      loadSubmissions();
    } else {
      setAuthError("Invalid credentials. Use admin / admin.");
    }
  };

  const handleLogout = () => {
    setIsAuthed(false);
    if (typeof window !== "undefined") window.sessionStorage.removeItem(AUTH_KEY);
  };

  if (!isAuthed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#0F172A] to-[#1E293B] px-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-10 shadow-2xl">
          <div className="mb-8 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--brand)] text-white text-lg font-bold">e</div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-[#94A3B8]">eKS Platform</p>
              <p className="font-display text-xl font-bold text-[#0B1324]">Admin Portal</p>
            </div>
          </div>
          <h1 className="text-2xl font-bold text-[#0B1324]">Sign in</h1>
          <p className="mt-1 text-sm text-[#64748B]">Access the KYC review dashboard.</p>
          <form className="mt-6 flex flex-col gap-4" onSubmit={handleLogin}>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-[#64748B]">Username</label>
              <input
                type="text"
                value={credentials.username}
                onChange={(e) => { setCredentials((c) => ({ ...c, username: e.target.value })); setAuthError(""); }}
                placeholder="admin"
                className="rounded-xl border border-[#E2E8F0] px-4 py-3 text-sm focus:border-[var(--brand)] focus:outline-none focus:ring-2 focus:ring-[rgba(82,196,26,0.2)]"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-[#64748B]">Password</label>
              <input
                type="password"
                value={credentials.password}
                onChange={(e) => { setCredentials((c) => ({ ...c, password: e.target.value })); setAuthError(""); }}
                placeholder="••••••"
                className="rounded-xl border border-[#E2E8F0] px-4 py-3 text-sm focus:border-[var(--brand)] focus:outline-none focus:ring-2 focus:ring-[rgba(82,196,26,0.2)]"
              />
            </div>
            {authError && (
              <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{authError}</p>
            )}
            <button
              type="submit"
              className="mt-2 rounded-xl bg-[var(--brand)] py-3 text-sm font-bold text-white transition hover:brightness-95"
            >
              Continue to Dashboard
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-[#F1F5F9]">
      <AdminSidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        stats={{ total: stats.total, flaggedCount: flaggedSubmissions.length }}
        onLogout={handleLogout}
      />

      {/* Main content */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Top bar */}
        <header className="flex h-16 flex-shrink-0 items-center justify-between border-b border-[#E2E8F0] bg-white px-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[#94A3B8]">
              {{ overview: "Overview", submissions: "All Submissions", flagged: "Flagged & High Risk", analytics: "Analytics", settings: "Settings" }[activeTab]}
            </p>
            <p className="font-semibold text-[#0B1324]">KYC Review Dashboard</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
              ● Live
            </span>
            <button
              onClick={() => loadSubmissions()}
              className="rounded-xl border border-[#E2E8F0] bg-white px-4 py-2 text-xs font-semibold text-[#64748B] transition hover:border-[#CBD5E1] hover:text-[#0F172A]"
            >
              ↻ Refresh
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          {loadError ? (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {loadError}
            </div>
          ) : null}
          {/* ── OVERVIEW ── */}
          {activeTab === "overview" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-[#0B1324]">Overview</h2>
                <p className="mt-1 text-sm text-[#64748B]">Real-time KYC submission metrics and risk summary.</p>
              </div>

              {/* Stats grid */}
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                {[
                  { label: "Total Submissions", value: stats.total, sub: "All time", color: "bg-indigo-50 text-indigo-600", dot: "bg-indigo-500" },
                  { label: "Pending Review", value: stats.pending, sub: "Awaiting manual check", color: "bg-blue-50 text-blue-600", dot: "bg-blue-500" },
                  { label: "Approved", value: stats.approved, sub: `${stats.approvalRate}% approval rate`, color: "bg-emerald-50 text-emerald-600", dot: "bg-emerald-500" },
                  { label: "Rejected", value: stats.rejected, sub: "Declined", color: "bg-red-50 text-red-600", dot: "bg-red-500" },
                ].map((card) => (
                  <div key={card.label} className="rounded-2xl bg-white p-5 shadow-sm">
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${card.dot}`} />
                      <p className="text-xs font-semibold uppercase tracking-wide text-[#94A3B8]">{card.label}</p>
                    </div>
                    <p className={`mt-3 text-4xl font-bold ${card.color.split(" ")[1]}`}>{card.value}</p>
                    <p className="mt-1.5 text-xs text-[#64748B]">{card.sub}</p>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                {[
                  { label: "Flagged", value: stats.flagged, sub: "Needs escalation", color: "text-amber-600", dot: "bg-amber-400" },
                  { label: "High Risk (≥70)", value: stats.highRisk, sub: "Critical cases", color: "text-red-600", dot: "bg-red-500" },
                  { label: "Avg Risk Score", value: `${stats.avgRisk}`, sub: "Across all submissions", color: "text-[#0B1324]", dot: "bg-slate-400" },
                ].map((card) => (
                  <div key={card.label} className="rounded-2xl bg-white p-5 shadow-sm">
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${card.dot}`} />
                      <p className="text-xs font-semibold uppercase tracking-wide text-[#94A3B8]">{card.label}</p>
                    </div>
                    <p className={`mt-3 text-4xl font-bold ${card.color}`}>{card.value}</p>
                    <p className="mt-1.5 text-xs text-[#64748B]">{card.sub}</p>
                  </div>
                ))}
              </div>

              {/* Status breakdown */}
              <div className="rounded-2xl bg-white p-6 shadow-sm">
                <h3 className="font-semibold text-[#0B1324]">Status Breakdown</h3>
                <p className="mt-0.5 text-xs text-[#94A3B8]">Distribution of all {stats.total} submissions</p>
                <div className="mt-5 space-y-3">
                  {[
                    { label: "Pending", count: stats.pending, color: "bg-blue-400" },
                    { label: "Approved", count: stats.approved, color: "bg-emerald-500" },
                    { label: "Flagged", count: stats.flagged, color: "bg-amber-400" },
                    { label: "Rejected", count: stats.rejected, color: "bg-red-500" },
                  ].map((row) => (
                    <div key={row.label}>
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium text-[#0F172A]">{row.label}</span>
                        <span className="text-[#64748B]">{row.count} / {stats.total}</span>
                      </div>
                      <div className="mt-1.5 h-2 rounded-full bg-[#F1F5F9]">
                        <div
                          className={`h-2 rounded-full ${row.color} transition-all`}
                          style={{ width: stats.total ? `${(row.count / stats.total) * 100}%` : "0%" }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Recent submissions */}
              <div className="rounded-2xl bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-[#0B1324]">Recent Submissions</h3>
                  <button
                    onClick={() => setActiveTab("submissions")}
                    className="text-xs font-semibold text-[var(--brand)] hover:underline"
                  >
                    View all →
                  </button>
                </div>
                <div className="mt-4 space-y-2">
                  {submissions.slice(0, 5).map((s) => (
                    <div
                      key={s.id}
                      onClick={() => router.push(`/admin/${s.id}`)}
                      className="flex cursor-pointer items-center gap-4 rounded-xl px-4 py-3 transition hover:bg-[#F8FAFC]"
                    >
                      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[#E2E8F0] text-sm font-bold text-[#0B1324]">
                        {s.name?.split(" ").map((p) => p[0]).slice(0, 2).join("")}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-sm font-semibold text-[#0B1324]">{s.name}</p>
                        <p className="text-xs text-[#94A3B8]">{s.id} · {s.submittedAt}</p>
                      </div>
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_COLORS[s.status] || "bg-gray-100 text-gray-600"}`}>
                        {s.status}
                      </span>
                      <span className={`text-sm ${RISK_COLOR(s.riskScore)}`}>{s.riskScore}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── SUBMISSIONS ── */}
          {(activeTab === "submissions" || activeTab === "flagged") && (
            <div className="space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-bold text-[#0B1324]">
                    {activeTab === "flagged" ? "Flagged & High Risk" : "All Submissions"}
                  </h2>
                  <p className="mt-1 text-sm text-[#64748B]">
                    {activeTab === "flagged"
                      ? `${flaggedSubmissions.length} cases requiring escalation`
                      : `${filteredSubmissions.length} of ${stats.total} submissions`}
                  </p>
                </div>
              </div>

              {activeTab === "submissions" && (
                <div className="flex flex-wrap gap-3">
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search by name, email, ID or doc number…"
                    className="flex-1 min-w-[220px] rounded-xl border border-[#E2E8F0] bg-white px-4 py-2.5 text-sm focus:border-[var(--brand)] focus:outline-none"
                  />
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="rounded-xl border border-[#E2E8F0] bg-white px-4 py-2.5 text-sm text-[#0F172A] focus:border-[var(--brand)] focus:outline-none"
                  >
                    {["All", "Pending", "Approved", "Flagged", "Rejected"].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                  <select
                    value={docFilter}
                    onChange={(e) => setDocFilter(e.target.value)}
                    className="rounded-xl border border-[#E2E8F0] bg-white px-4 py-2.5 text-sm text-[#0F172A] focus:border-[var(--brand)] focus:outline-none"
                  >
                    {["All", "Passport", "Citizenship", "Driving License"].map((d) => (
                      <option key={d}>{d}</option>
                    ))}
                  </select>
                  {(search || statusFilter !== "All" || docFilter !== "All") && (
                    <button
                      onClick={() => { setSearch(""); setStatusFilter("All"); setDocFilter("All"); }}
                      className="rounded-xl border border-[#E2E8F0] bg-white px-4 py-2.5 text-sm text-[#64748B] hover:text-red-500"
                    >
                      ✕ Clear
                    </button>
                  )}
                </div>
              )}

              <div className="rounded-2xl bg-white shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[#F1F5F9]">
                        <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wide text-[#94A3B8]">Submission ID</th>
                        <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wide text-[#94A3B8]">Applicant</th>
                        <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wide text-[#94A3B8]">Document</th>
                        <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wide text-[#94A3B8]">Status</th>
                        <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wide text-[#94A3B8]">Risk Score</th>
                        <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wide text-[#94A3B8]">Submitted</th>
                        <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wide text-[#94A3B8]">Channel</th>
                        <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wide text-[#94A3B8]">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(activeTab === "flagged" ? flaggedSubmissions : filteredSubmissions).map((item) => (
                        <tr
                          key={item.id}
                          className="border-b border-[#F8FAFC] transition hover:bg-[#F8FAFC]"
                        >
                          <td className="px-5 py-4 font-mono text-xs font-semibold text-[#0B1324]">{item.id}</td>
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-3">
                              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#E2E8F0] text-xs font-bold text-[#0B1324]">
                                {item.name?.split(" ").map((p) => p[0]).slice(0, 2).join("")}
                              </div>
                              <div>
                                <p className="font-semibold text-[#0B1324]">{item.name}</p>
                                <p className="text-xs text-[#94A3B8]">{item.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-4">
                            <p className="font-medium text-[#0F172A]">{item.documentType}</p>
                            <p className="text-xs text-[#94A3B8]">{item.documentNumber}</p>
                          </td>
                          <td className="px-5 py-4">
                            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_COLORS[item.status] || "bg-gray-100 text-gray-600"}`}>
                              {item.status}
                            </span>
                          </td>
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 w-16 rounded-full bg-[#F1F5F9]">
                                <div
                                  className={`h-1.5 rounded-full ${RISK_BAR_COLOR(item.riskScore)}`}
                                  style={{ width: `${item.riskScore}%` }}
                                />
                              </div>
                              <span className={`text-sm ${RISK_COLOR(item.riskScore)}`}>{item.riskScore}%</span>
                            </div>
                          </td>
                          <td className="px-5 py-4 text-xs text-[#64748B]">{item.submittedAt}</td>
                          <td className="px-5 py-4">
                            <span className="rounded-full border border-[#E2E8F0] px-2.5 py-1 text-xs font-medium text-[#64748B]">
                              {item.channel}
                            </span>
                          </td>
                          <td className="px-5 py-4">
                            <button
                              onClick={() => router.push(`/admin/${item.id}`)}
                              className="rounded-lg bg-[#F8FAFC] px-3 py-1.5 text-xs font-semibold text-[#0B1324] transition hover:bg-[var(--brand)] hover:text-white"
                            >
                              Review →
                            </button>
                          </td>
                        </tr>
                      ))}
                      {(activeTab === "flagged" ? flaggedSubmissions : filteredSubmissions).length === 0 && (
                        <tr>
                          <td colSpan={8} className="px-5 py-16 text-center text-sm text-[#94A3B8]">
                            No submissions match your filters.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ── ANALYTICS ── */}
          {activeTab === "analytics" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-[#0B1324]">Analytics</h2>
                <p className="mt-1 text-sm text-[#64748B]">Patterns and distributions across all KYC submissions.</p>
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                {/* Document type distribution */}
                <div className="rounded-2xl bg-white p-6 shadow-sm">
                  <h3 className="font-semibold text-[#0B1324]">Document Type Distribution</h3>
                  <p className="mt-0.5 text-xs text-[#94A3B8]">{stats.total} total submissions</p>
                  <div className="mt-5 space-y-3">
                    {Object.entries(docTypeCounts).map(([type, count]) => (
                      <div key={type}>
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium text-[#0F172A]">{type}</span>
                          <span className="text-[#64748B]">{count} ({stats.total ? Math.round((count / stats.total) * 100) : 0}%)</span>
                        </div>
                        <div className="mt-1.5 h-2.5 rounded-full bg-[#F1F5F9]">
                          <div
                            className="h-2.5 rounded-full bg-[var(--brand)] transition-all"
                            style={{ width: stats.total ? `${(count / stats.total) * 100}%` : "0%" }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Channel distribution */}
                <div className="rounded-2xl bg-white p-6 shadow-sm">
                  <h3 className="font-semibold text-[#0B1324]">Submission Channel</h3>
                  <p className="mt-0.5 text-xs text-[#94A3B8]">How applicants completed KYC</p>
                  <div className="mt-5 space-y-3">
                    {Object.entries(channelCounts).map(([channel, count]) => (
                      <div key={channel}>
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium text-[#0F172A]">{channel}</span>
                          <span className="text-[#64748B]">{count}</span>
                        </div>
                        <div className="mt-1.5 h-2.5 rounded-full bg-[#F1F5F9]">
                          <div
                            className="h-2.5 rounded-full bg-indigo-400 transition-all"
                            style={{ width: stats.total ? `${(count / stats.total) * 100}%` : "0%" }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Risk score histogram */}
                <div className="rounded-2xl bg-white p-6 shadow-sm lg:col-span-2">
                  <h3 className="font-semibold text-[#0B1324]">Risk Score Distribution</h3>
                  <p className="mt-0.5 text-xs text-[#94A3B8]">Bucketed into 10-point bands</p>
                  <div className="mt-5 flex items-end gap-2 h-32">
                    {Array.from({ length: 10 }, (_, i) => {
                      const lo = i * 10, hi = lo + 10;
                      const cnt = submissions.filter((s) => s.riskScore >= lo && s.riskScore < hi).length;
                      const maxCnt = Math.max(...Array.from({ length: 10 }, (_, j) =>
                        submissions.filter((s) => s.riskScore >= j * 10 && s.riskScore < j * 10 + 10).length
                      ), 1);
                      const pct = (cnt / maxCnt) * 100;
                      const barColor = hi <= 40 ? "bg-emerald-400" : hi <= 70 ? "bg-amber-400" : "bg-red-500";
                      return (
                        <div key={lo} className="flex flex-1 flex-col items-center gap-1">
                          <span className="text-[10px] font-semibold text-[#94A3B8]">{cnt}</span>
                          <div className="flex w-full items-end justify-center">
                            <div
                              className={`w-full rounded-t-lg ${barColor} transition-all`}
                              style={{ height: `${Math.max(pct * 0.9, cnt > 0 ? 8 : 2)}px` }}
                            />
                          </div>
                          <span className="text-[10px] text-[#94A3B8]">{lo}–{hi}</span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-3 flex gap-4 text-xs">
                    <span className="flex items-center gap-1.5"><span className="h-2 w-3 rounded bg-emerald-400" /> Low (0–40)</span>
                    <span className="flex items-center gap-1.5"><span className="h-2 w-3 rounded bg-amber-400" /> Moderate (40–70)</span>
                    <span className="flex items-center gap-1.5"><span className="h-2 w-3 rounded bg-red-500" /> High (70–100)</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── SETTINGS ── */}
          {activeTab === "settings" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-[#0B1324]">Settings</h2>
                <p className="mt-1 text-sm text-[#64748B]">Admin panel configuration.</p>
              </div>
              <div className="rounded-2xl bg-white p-8 shadow-sm">
                <div className="space-y-6 divide-y divide-[#F1F5F9]">
                  {[
                    { label: "Administrator Account", value: "admin", sub: "Username cannot be changed in demo mode." },
                    { label: "KYC API Endpoint", value: "http://localhost:5000/api/v1", sub: "Express backend base URL." },
                    { label: "ML Services Endpoint", value: "http://localhost:8000/api/v1", sub: "FastAPI ML services base URL." },
                    { label: "Risk Threshold — High", value: "70", sub: "Submissions above this score are flagged as high risk." },
                    { label: "Duplicate Face Threshold", value: "0.6", sub: "Cosine similarity threshold for face duplicate detection." },
                  ].map((row) => (
                    <div key={row.label} className="flex items-start justify-between gap-6 pt-5 first:pt-0">
                      <div>
                        <p className="text-sm font-semibold text-[#0F172A]">{row.label}</p>
                        <p className="mt-0.5 text-xs text-[#94A3B8]">{row.sub}</p>
                      </div>
                      <span className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-1.5 font-mono text-sm text-[#0B1324]">
                        {row.value}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-8 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                  <p className="text-sm font-semibold text-emerald-800">Data storage</p>
                  <p className="mt-1 text-xs text-emerald-700">
                    Submissions load from Postgres (onboarding_sessions). Images on Cloudinary; embeddings in Supabase.
                  </p>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
