"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

const baseClasses =
  "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(82,196,26,0.35)]";

const sizeClasses = {
  sm: "px-4 py-2 text-sm",
  md: "px-5 py-2.5 text-sm",
  lg: "px-6 py-3 text-base",
};

const variantClasses = {
  solid: "bg-[var(--brand)] text-white hover:brightness-95",
  outline: "border border-ink-200 text-ink-700 hover:bg-ink-50",
  ghost: "text-ink-600 hover:bg-ink-100",
  glass: "border border-white/40 bg-white/20 text-white backdrop-blur hover:bg-white/30",
};

export default function Button({
  href,
  variant = "solid",
  size = "md",
  className,
  children,
  ...props
}) {
  const classes = cn(baseClasses, sizeClasses[size], variantClasses[variant], className);

  if (href) {
    return (
      <Link href={href} className={classes} {...props}>
        {children}
      </Link>
    );
  }

  return (
    <button type="button" className={classes} {...props}>
      {children}
    </button>
  );
}
