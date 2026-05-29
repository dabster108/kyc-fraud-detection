"use client";

import Link from "next/link";
import { ShieldIcon } from "../icons";
import { cn } from "@/lib/utils";

export default function Logo({ dark = false }) {
  return (
    <Link href="/" className="flex items-center gap-3">
      <span
        className={cn(
          "flex h-10 w-10 items-center justify-center rounded-xl",
          dark ? "bg-white/10 text-brand-300" : "bg-brand-50 text-brand-600"
        )}
      >
        <ShieldIcon className="h-6 w-6" />
      </span>
      <span
        className={cn(
          "font-display text-xl font-semibold",
          dark ? "text-white" : "text-ink-900"
        )}
      >
        eKS
      </span>
    </Link>
  );
}
