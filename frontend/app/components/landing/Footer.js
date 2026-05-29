"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { Send, MessageCircle, AtSign, Globe, ArrowRight } from "lucide-react";
import Logo from "../ui/Logo";
import Button from "../ui/Button";

const columns = [
  {
    title: "Product",
    links: ["Features", "Fraud Engines", "Risk Scoring", "Dashboard", "Pricing"],
  },
  {
    title: "Company",
    links: ["About", "Careers", "Security", "Blog", "Contact"],
  },
  {
    title: "Resources",
    links: ["Documentation", "API Reference", "Compliance", "Status", "Changelog"],
  },
];

const socials = [Send, MessageCircle, AtSign, Globe];

export default function Footer() {
  return (
    <footer className="relative overflow-hidden bg-ink-950 pt-20 text-white">
      <div className="pointer-events-none absolute inset-0 bg-grid-dark opacity-30 [mask-image:linear-gradient(to_bottom,black,transparent)]" />
      <div className="mx-auto max-w-6xl px-5 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.6 }}
          className="relative -mt-36 overflow-hidden rounded-[2.5rem] border border-white/10 bg-gradient-to-br from-brand-500 to-brand-700 p-8 text-center shadow-glow sm:p-14"
        >
          <div className="pointer-events-none absolute inset-0 bg-grid-dark opacity-20" />
          <h2 className="relative font-display text-3xl font-extrabold tracking-tight text-white sm:text-4xl text-balance">
            Stop fraud before it starts
          </h2>
          <p className="relative mx-auto mt-3 max-w-md text-white/80">
            Launch a verification in under a minute and watch the AI engines work
            in real time.
          </p>
          <div className="relative mt-7 flex flex-wrap justify-center gap-3">
            <Button href="/onboarding" variant="glass" size="lg">
              Start Verification
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button
              href="/dashboard"
              size="lg"
              className="bg-ink-950 text-white hover:bg-ink-900"
            >
              Explore Dashboard
            </Button>
          </div>
        </motion.div>

        <div className="grid gap-10 py-16 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <Logo dark />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-white/50">
              eSewa KYC Shield - AI-powered identity verification and fraud detection
              for modern fintech.
            </p>
            <div className="mt-5 flex gap-2">
              {socials.map((SocialIcon, index) => (
                <a
                  key={index}
                  href="#"
                  className="grid h-9 w-9 place-items-center rounded-full bg-white/5 text-white/60 transition hover:bg-brand-500 hover:text-white"
                  aria-label="social link"
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
                  <li key={link}>
                    <Link
                      href="#"
                      className="text-sm text-white/50 transition hover:text-brand-300"
                    >
                      {link}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="flex flex-col items-center justify-between gap-4 border-t border-white/10 py-6 text-xs text-white/40 sm:flex-row">
          <p>(c) 2026 eKS - eSewa KYC Shield. All rights reserved.</p>
          <div className="flex gap-5">
            <Link href="#" className="hover:text-white/70">
              Terms
            </Link>
            <Link href="#" className="hover:text-white/70">
              Privacy
            </Link>
            <Link href="#" className="hover:text-white/70">
              Security
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
