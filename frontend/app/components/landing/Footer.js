"use client";

import Link from "next/link";
import { Send, MessageCircle, AtSign, Globe } from "lucide-react";
import Logo from "../ui/Logo";

const columns = [
  {
    title: "Product",
    links: [
      { label: "Features", href: "/#features" },
      { label: "How it works", href: "/#how" },
      { label: "Engines", href: "/#engines" },
      { label: "Start verification", href: "/onboarding" },
    ],
  },
  {
    title: "Platform",
    links: [
      { label: "Admin dashboard", href: "/admin" },
      { label: "Onboarding flow", href: "/onboarding" },
      { label: "Why eKS", href: "/#why" },
    ],
  },
  {
    title: "Stack",
    links: [
      { label: "Next.js frontend", href: "#" },
      { label: "Express API", href: "#" },
      { label: "FastAPI ML services", href: "#" },
    ],
  },
];

const socials = [Send, MessageCircle, AtSign, Globe];

export default function Footer() {
  return (
    <footer className="relative overflow-hidden bg-ink-950 pt-20 text-white">
      <div className="pointer-events-none absolute inset-0 bg-grid-dark opacity-30 [mask-image:linear-gradient(to_bottom,black,transparent)]" />
      <div className="mx-auto max-w-6xl px-5 sm:px-6">
        <div className="grid gap-10 py-16 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <Logo dark />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-white/50">
              eSewa KYC Shield — document OCR, forgery checks, liveness, face
              match, and explainable risk scoring for Nepali identity onboarding.
            </p>
            <div className="mt-5 flex gap-2">
              {socials.map((SocialIcon, index) => (
                <a
                  key={index}
                  href="#"
                  className="grid h-9 w-9 place-items-center rounded-full bg-white/5 text-white/60 transition hover:bg-brand-500 hover:text-white"
                  aria-label="Social link"
                >
                  <SocialIcon className="h-4 w-4" />
                </a>
              ))}
            </div>
          </div>

          {columns.map((column) => (
            <div key={column.title}>
              <p className="text-sm font-semibold text-white">{column.title}</p>
              <ul className="mt-4 space-y-2.5">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-sm text-white/50 transition hover:text-brand-300"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="flex flex-col items-center justify-between gap-4 border-t border-white/10 py-6 text-xs text-white/40 sm:flex-row">
          <p>© 2026 eKS — eSewa KYC Shield. Hackathon build.</p>
          <div className="flex gap-5">
            <Link href="/onboarding" className="hover:text-white/70">
              Verify now
            </Link>
            <Link href="/admin" className="hover:text-white/70">
              Admin
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
