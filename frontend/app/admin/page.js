"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import TopNav from "../components/TopNav";
import { getStoredSubmissions } from "./submissions";

export default function AdminPanelPage() {
  const router = useRouter();
  const [credentials, setCredentials] = useState({
    username: "",
    password: "",
  });
  const [isAuthed, setIsAuthed] = useState(false);
  const [error, setError] = useState("");
  const [submissionList, setSubmissionList] = useState([]);

  useEffect(() => {
    setSubmissionList(getStoredSubmissions());
  }, []);

  const stats = useMemo(() => {
    const pending = submissionList.filter((item) => item.status === "Pending");
    const highRisk = submissionList.filter((item) => item.riskScore >= 70);
    const approved = submissionList.filter((item) => item.status === "Approved");

    return {
      pending: pending.length,
      highRisk: highRisk.length,
      approved: approved.length,
    };
  }, [submissionList]);

  const handleChange = (field) => (event) => {
    const value = event.target.value;
    setCredentials((current) => ({ ...current, [field]: value }));
    setError("");
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (
      credentials.username.trim() === "admin" &&
      credentials.password.trim() === "admin"
    ) {
      setIsAuthed(true);
      setError("");
      return;
    }

    setError("Invalid username or password. Try admin / admin.");
  };

  const handleRowClick = (id) => {
    router.push(`/admin/${id}`);
  };

  return (
    <div className="min-h-screen bg-[var(--canvas)] text-[var(--ink)]">
      <TopNav />

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-6 py-12">
        {!isAuthed ? (
          <section className="mx-auto flex w-full max-w-xl flex-col gap-8 rounded-2xl bg-white p-10 shadow-[0_20px_50px_rgba(15,23,42,0.08)]">
            <div>
              <h1 className="font-display text-3xl text-[#0B1324]">
                Admin Access
              </h1>
              <p className="mt-2 text-sm text-[#64748B]">
                Enter your admin credentials to access the KYC dashboard.
              </p>
            </div>

            <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
              <label className="flex flex-col gap-2 text-sm font-semibold text-[#0F172A]">
                Username
                <input
                  type="text"
                  value={credentials.username}
                  onChange={handleChange("username")}
                  placeholder="admin"
                  className="rounded-xl border border-[#E2E8F0] bg-white px-4 py-3 text-sm text-[#0F172A] shadow-sm focus:border-[#94A3B8] focus:outline-none"
                />
              </label>
              <label className="flex flex-col gap-2 text-sm font-semibold text-[#0F172A]">
                Password
                <input
                  type="password"
                  value={credentials.password}
                  onChange={handleChange("password")}
                  placeholder="admin"
                  className="rounded-xl border border-[#E2E8F0] bg-white px-4 py-3 text-sm text-[#0F172A] shadow-sm focus:border-[#94A3B8] focus:outline-none"
                />
              </label>
              {error ? (
                <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
                  {error}
                </p>
              ) : null}
              <button
                type="submit"
                className="rounded-full bg-[var(--brand)] px-6 py-3 text-sm font-semibold text-white transition hover:brightness-95"
              >
                Continue to dashboard
              </button>
            </form>
          </section>
        ) : (
          <section className="flex w-full flex-col gap-8">
            <header className="rounded-2xl bg-white p-10 shadow-[0_20px_50px_rgba(15,23,42,0.08)]">
              <h1 className="font-display text-3xl text-[#0B1324]">
                Admin Dashboard
              </h1>
              <p className="mt-2 text-sm text-[#64748B]">
                Monitor submissions and review KYC verification results in one place.
              </p>
              <div className="mt-8 grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#94A3B8]">
                    Pending Review
                  </p>
                  <p className="mt-3 text-3xl font-semibold text-[#0B1324]">
                    {stats.pending}
                  </p>
                  <p className="mt-2 text-xs text-[#64748B]">Awaiting manual check</p>
                </div>
                <div className="rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#94A3B8]">
                    High Risk
                  </p>
                  <p className="mt-3 text-3xl font-semibold text-[#0B1324]">
                    {stats.highRisk}
                  </p>
                  <p className="mt-2 text-xs text-[#64748B]">Requires escalation</p>
                </div>
                <div className="rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#94A3B8]">
                    Auto Approved
                  </p>
                  <p className="mt-3 text-3xl font-semibold text-[#0B1324]">
                    {stats.approved}
                  </p>
                  <p className="mt-2 text-xs text-[#64748B]">Cleared in the last 24h</p>
                </div>
              </div>
            </header>

            <div className="rounded-2xl bg-white p-8 shadow-[0_20px_50px_rgba(15,23,42,0.08)]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-[#0B1324]">
                    Submitted KYCs
                  </h2>
                  <p className="text-sm text-[#64748B]">
                    Click any submission row to open the detailed review screen.
                  </p>
                </div>
                <div className="rounded-full border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-2 text-xs font-semibold text-[#64748B]">
                  {submissionList.length} total submissions
                </div>
              </div>

              <div className="mt-6 overflow-x-auto">
                <table className="w-full border-separate border-spacing-y-2 text-left text-sm">
                  <thead className="text-xs uppercase tracking-wide text-[#94A3B8]">
                    <tr>
                      <th className="px-4 py-2">Submission ID</th>
                      <th className="px-4 py-2">Applicant</th>
                      <th className="px-4 py-2">Status</th>
                      <th className="px-4 py-2">Risk</th>
                      <th className="px-4 py-2">Submitted</th>
                      <th className="px-4 py-2">Channel</th>
                    </tr>
                  </thead>
                  <tbody className="text-[#0F172A]">
                    {submissionList.map((item) => (
                      <tr
                        key={item.id}
                        onClick={() => handleRowClick(item.id)}
                        className="cursor-pointer rounded-xl bg-[#F8FAFC] transition hover:bg-[#EEF2F7]"
                      >
                        <td className="rounded-l-xl px-4 py-4 font-semibold text-[#0B1324]">
                          {item.id}
                        </td>
                        <td className="px-4 py-4">
                          <p className="font-semibold text-[#0B1324]">{item.name}</p>
                          <p className="text-xs text-[#64748B]">{item.email}</p>
                        </td>
                        <td className="px-4 py-4">
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-semibold ${
                              item.status === "Approved"
                                ? "bg-green-100 text-green-700"
                                : item.status === "Flagged"
                                ? "bg-amber-100 text-amber-700"
                                : "bg-red-100 text-red-700"
                            }`}
                          >
                            {item.status}
                          </span>
                        </td>
                        <td className="px-4 py-4 font-semibold">{item.riskScore}%</td>
                        <td className="px-4 py-4 text-[#64748B]">
                          {item.submittedAt}
                        </td>
                        <td className="rounded-r-xl px-4 py-4 text-[#64748B]">
                          {item.channel}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
