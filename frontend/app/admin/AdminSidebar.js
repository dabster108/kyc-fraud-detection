"use client";

import { useState } from "react";
import Link from "next/link";

const NAV_ITEMS = [
  { id: "overview",    label: "Overview",           icon: "⬡" },
  { id: "submissions", label: "All Submissions",     icon: "≡" },
  { id: "flagged",     label: "Flagged & High Risk", icon: "⚑" },
  { id: "analytics",   label: "Analytics",           icon: "◈" },
  { id: "settings",    label: "Settings",            icon: "⚙" },
];

/**
 * Shared sidebar for all admin pages.
 *
 * Props:
 *  - activeTab:    currently active nav item id
 *  - onTabChange:  if provided, nav items are <button> that call this; otherwise they are
 *                  <Link> pointing to /admin?tab=<id>
 *  - stats:        { total, flaggedCount } — used for nav badges
 *  - onLogout:     called when the logout button is clicked
 *  - children:     optional slot rendered between the nav and the user footer
 *                  (e.g. applicant quick-info on the detail page)
 */
export default function AdminSidebar({
  activeTab,
  onTabChange,
  stats = {},
  onLogout,
  children,
}) {
  const [collapsed, setCollapsed] = useState(false);

  const getBadge = (id) => {
    if (id === "submissions") return stats.total ?? null;
    if (id === "flagged")     return stats.flaggedCount ?? null;
    return null;
  };

  return (
    <aside
      className={`flex flex-shrink-0 flex-col bg-[#0F172A] text-white transition-all duration-200 ${
        collapsed ? "w-16" : "w-60"
      }`}
    >
      {/* Brand */}
      <div className="flex h-16 items-center gap-3 border-b border-white/10 px-4">
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-[var(--brand)] text-sm font-bold text-white">
          e
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold uppercase tracking-widest text-white/50">eKS</p>
            <p className="truncate text-sm font-bold text-white">Admin Panel</p>
          </div>
        )}
        <button
          onClick={() => setCollapsed((v) => !v)}
          className="ml-auto flex-shrink-0 text-white/40 transition hover:text-white"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? "›" : "‹"}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex flex-col gap-1 overflow-y-auto py-4 px-2">
        {NAV_ITEMS.map((item) => {
          const isActive = activeTab === item.id;
          const badge = getBadge(item.id);

          const cls = `flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
            isActive
              ? "bg-[var(--brand)] text-white"
              : "text-white/60 hover:bg-white/10 hover:text-white"
          }`;

          const inner = (
            <>
              <span className="flex-shrink-0 text-base leading-none">{item.icon}</span>
              {!collapsed && (
                <>
                  <span className="flex-1 text-left">{item.label}</span>
                  {badge !== null && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                        isActive ? "bg-white/20 text-white" : "bg-white/10 text-white/70"
                      }`}
                    >
                      {badge}
                    </span>
                  )}
                </>
              )}
            </>
          );

          return onTabChange ? (
            <button key={item.id} onClick={() => onTabChange(item.id)} className={cls}>
              {inner}
            </button>
          ) : (
            <Link key={item.id} href={`/admin?tab=${item.id}`} className={cls}>
              {inner}
            </Link>
          );
        })}
      </nav>

      {/* Optional extra content slot (e.g. applicant info on the review detail page) */}
      {children && (
        <div className="border-t border-white/10 p-3">
          {children}
        </div>
      )}

      {/* User footer */}
      <div className="mt-auto border-t border-white/10 p-3">
        {!collapsed ? (
          <div className="flex items-center gap-3 rounded-xl px-2 py-2">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[var(--brand)]/20 text-xs font-bold text-[var(--brand)]">
              A
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-white">Administrator</p>
              <p className="truncate text-xs text-white/40">admin@eks.com</p>
            </div>
            <button
              onClick={onLogout}
              title="Logout"
              className="flex-shrink-0 text-white/40 transition hover:text-red-400 text-sm"
            >
              ⏻
            </button>
          </div>
        ) : (
          <button
            onClick={onLogout}
            title="Logout"
            className="flex w-full items-center justify-center rounded-xl py-2 text-white/40 transition hover:text-red-400"
          >
            ⏻
          </button>
        )}
      </div>
    </aside>
  );
}
