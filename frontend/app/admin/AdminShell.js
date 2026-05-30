"use client";

import { useState } from "react";
import AdminSidebar, {
  SIDEBAR_WIDTH_COLLAPSED,
  SIDEBAR_WIDTH_EXPANDED,
} from "./AdminSidebar";

/**
 * Fixed sidebar + scrollable main column (header stays at top of main).
 */
export default function AdminShell({ sidebar, header, children }) {
  const [collapsed, setCollapsed] = useState(false);
  const mainOffset = collapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_EXPANDED;

  return (
    <div className="h-screen overflow-hidden bg-[#f4f5f7]">
      {sidebar({ collapsed, onCollapsedChange: setCollapsed })}
      <div
        className="flex h-screen min-w-0 flex-col transition-[margin] duration-200"
        style={{ marginLeft: mainOffset }}
      >
        {header}
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
