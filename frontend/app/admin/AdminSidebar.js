"use client";

import { useState } from "react";
import Link from "next/link";
import Logo from "../components/ui/Logo";

const NAV_ITEMS = [
  { id: "overview", label: "Overview" },
  { id: "submissions", label: "Submissions" },
  { id: "flagged", label: "High risk" },
  { id: "analytics", label: "Analytics" },
  { id: "settings", label: "Settings" },
];

export const SIDEBAR_WIDTH_EXPANDED = 220;
export const SIDEBAR_WIDTH_COLLAPSED = 56;

export default function AdminSidebar({
  activeTab,
  onTabChange,
  stats = {},
  onLogout,
  children,
  collapsed: collapsedProp,
  onCollapsedChange,
}) {
  const [collapsedInternal, setCollapsedInternal] = useState(false);
  const collapsed = collapsedProp ?? collapsedInternal;

  const setCollapsed = (value) => {
    if (collapsedProp === undefined) {
      setCollapsedInternal(value);
    }
    onCollapsedChange?.(value);
  };

  const getBadge = (id) => {
    if (id === "submissions") return stats.total ?? null;
    if (id === "flagged") return stats.flaggedCount ?? null;
    return null;
  };

  const width = collapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_EXPANDED;

  return (
    <aside
      style={{ width }}
      className="fixed left-0 top-0 z-40 flex h-screen flex-col border-r border-[#e2e8f0] bg-white"
    >
      <div className="flex h-14 flex-shrink-0 items-center gap-2 border-b border-[#e2e8f0] px-3">
        {!collapsed ? (
          <div className="min-w-0 flex-1 [&_span]:text-lg">
            <Logo />
          </div>
        ) : (
          <Link
            href="/"
            className="mx-auto flex h-8 w-8 items-center justify-center rounded-md bg-[#f0f9eb] text-sm font-bold text-[var(--brand)]"
          >
            e
          </Link>
        )}
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-[#64748b] hover:bg-[#f4f5f7]"
          title={collapsed ? "Expand" : "Collapse"}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <span className="text-sm">{collapsed ? "»" : "«"}</span>
        </button>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2">
        {NAV_ITEMS.map((item) => {
          const isActive = activeTab === item.id;
          const badge = getBadge(item.id);

          const cls = `flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition ${
            isActive
              ? "border-l-2 border-[var(--brand)] bg-[#f0f9eb] pl-[10px] font-medium text-[#1a3d0d]"
              : "border-l-2 border-transparent font-normal text-[#475569] hover:bg-[#f4f5f7]"
          }`;

          const inner = collapsed ? (
            <span className="mx-auto text-xs font-medium uppercase">{item.label[0]}</span>
          ) : (
            <>
              <span className="flex-1 text-left">{item.label}</span>
              {badge !== null && (
                <span className="rounded bg-[#e2e8f0] px-1.5 py-0.5 text-[11px] font-medium text-[#475569]">
                  {badge}
                </span>
              )}
            </>
          );

          return onTabChange ? (
            <button key={item.id} type="button" onClick={() => onTabChange(item.id)} className={cls} title={item.label}>
              {inner}
            </button>
          ) : (
            <Link key={item.id} href={`/admin?tab=${item.id}`} className={cls} title={item.label}>
              {inner}
            </Link>
          );
        })}
      </nav>

      {children && !collapsed && (
        <div className="flex-shrink-0 border-t border-[#e2e8f0] p-3">{children}</div>
      )}

      <div className="flex-shrink-0 border-t border-[#e2e8f0] p-2">
        {!collapsed ? (
          <div className="flex items-center justify-between gap-2 px-2 py-1">
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-[#0f172a]">Admin</p>
              <p className="truncate text-[11px] text-[#64748b]">admin@eks.com</p>
            </div>
            <button
              type="button"
              onClick={onLogout}
              className="text-xs font-medium text-[#64748b] hover:text-[#0f172a]"
            >
              Sign out
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onLogout}
            title="Sign out"
            className="flex w-full justify-center py-2 text-[11px] text-[#64748b] hover:text-[#0f172a]"
          >
            Out
          </button>
        )}
      </div>
    </aside>
  );
}
