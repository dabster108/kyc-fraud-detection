"use client";

import { cn } from "@/lib/utils";

export default function SectionHeading({
  eyebrow,
  title,
  subtitle,
  align = "center",
}) {
  return (
    <div
      className={cn(
        "max-w-2xl",
        align === "center" && "mx-auto text-center",
        align === "left" && "text-left"
      )}
    >
      {eyebrow ? (
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-brand-500">
          {eyebrow}
        </p>
      ) : null}
      <h2 className="mt-3 font-display text-3xl font-bold text-ink-900 sm:text-4xl">
        {title}
      </h2>
      {subtitle ? (
        <p className="mt-3 text-sm leading-relaxed text-ink-500">
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}
