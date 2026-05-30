"use client";

import { motion } from "motion/react";
import {
  ArrowRight,
  ShieldCheck,
  ScanFace,
  Fingerprint,
  CheckCircle2,
  Sparkles,
  Activity,
} from "lucide-react";
import Button from "../ui/Button";
import RiskScoreCard from "./RiskScoreCard";

const trustLogos = ["Citizenship", "National ID", "License"];

export default function Hero() {
  return (
    <section className="relative overflow-hidden pt-32 pb-20 sm:pt-40 lg:pb-28">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-grid [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_75%)]" />
        <div className="absolute -top-24 left-1/2 h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-gradient-to-br from-brand-200/60 via-brand-100/40 to-transparent blur-3xl" />
        <div className="absolute right-[-120px] top-40 h-72 w-72 rounded-full bg-brand-300/30 blur-3xl animate-float-slow" />
        <div className="absolute left-[-80px] top-72 h-64 w-64 rounded-full bg-emerald-200/40 blur-3xl animate-float" />
      </div>

      <div className="mx-auto grid max-w-6xl items-center gap-14 px-5 sm:px-6 lg:grid-cols-[1.05fr_0.95fr]">
        <div>

          <motion.h1
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.05 }}
            className="mt-5 font-display text-4xl font-extrabold leading-[1.05] tracking-tight text-ink-900 sm:text-5xl lg:text-6xl text-balance"
          >
            AI-Powered <span className="gradient-text">KYC Fraud</span>
            <br className="hidden sm:block" /> Detection
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.12 }}
            className="mt-5 max-w-xl text-lg leading-relaxed text-ink-500"
          >
            Verify{" "}
            <span className="font-semibold text-ink-700">citizenship &amp; IDs</span> with{" "}
            <span className="font-semibold text-ink-700">forgery detection</span>,{" "}
            <span className="font-semibold text-ink-700">OCR pre-fill</span>,{" "}
            <span className="font-semibold text-ink-700">liveness</span>, and a{" "}
            <span className="font-semibold text-ink-700">risk score</span> analysts
            can trust—built for the eSewa KYC hackathon stack.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.18 }}
            className="mt-8 flex flex-wrap items-center gap-3"
          >
            <Button href="/onboarding" size="lg">
              Start Verification
              <ArrowRight className="h-4 w-4" />
            </Button>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="mt-10"
          >
            <p className="text-xs font-semibold uppercase tracking-widest text-ink-400">
              Supported documents
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {trustLogos.map((logo) => (
                <span
                  key={logo}
                  className="rounded-full border border-ink-100 bg-white px-3 py-1 text-xs font-medium text-ink-500 shadow-sm"
                >
                  {logo}
                </span>
              ))}
            </div>
          </motion.div>
        </div>

        <HeroVisual />
      </div>
    </section>
  );
}

function HeroVisual() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.94, y: 24 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.8, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
      className="relative mx-auto w-full max-w-md lg:max-w-none"
    >
      <div className="relative overflow-hidden rounded-[2rem] border border-ink-100 bg-white p-5 shadow-[0_30px_80px_-30px_rgba(16,46,14,0.35)]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-50">
              <ScanFace className="h-4 w-4 text-brand-600" />
            </span>
            <div>
              <p className="text-sm font-bold text-ink-900">KYC session</p>
              <p className="text-[11px] text-ink-400">OCR + forgery + face</p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-semibold text-brand-700">
            <Activity className="h-3 w-3" /> Analyzing
          </span>
        </div>

        <div className="relative mt-4 overflow-hidden rounded-2xl bg-gradient-to-br from-ink-900 to-brand-950 p-4">
          <div className="absolute inset-0 bg-grid-dark opacity-30" />
          <span className="absolute left-0 right-0 h-px bg-gradient-to-r from-transparent via-brand-400 to-transparent shadow-[0_0_12px_2px_rgba(96,187,70,0.7)] animate-scan" />
          <div className="relative flex items-center gap-3">
            <div className="grid h-16 w-16 shrink-0 place-items-center rounded-xl bg-white/10 ring-1 ring-white/20">
              <Fingerprint className="h-8 w-8 text-brand-300" />
            </div>
            <div className="flex-1 space-y-2">
              {[
                ["Name", "PRATIK JOSHI"],
                ["Citizenship", "75-01-79-06164"],
                ["DOB (AD)", "1998/03/21"],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-wider text-white/40">
                    {label}
                  </span>
                  <span className="font-mono text-xs text-brand-200">{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          {[
            ["Forgery", 28],
            ["Face match", 91],
            ["Risk", 30],
          ].map(([label, value], index) => (
            <div
              key={label}
              className="rounded-xl border border-ink-100 bg-ink-50 p-2.5"
            >
              <p className="text-[10px] font-medium text-ink-400">{label}</p>
              <p className="font-display text-base font-bold text-ink-900">
                {value}%
              </p>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink-200">
                <motion.div
                  className="h-full rounded-full bg-brand-500"
                  initial={{ width: 0 }}
                  animate={{ width: `${value}%` }}
                  transition={{ duration: 1.2, delay: 0.6 + index * 0.15 }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <motion.div
        animate={{ y: [0, -12, 0] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        className="absolute -right-4 -top-8 hidden rounded-3xl border border-ink-100 bg-white/90 p-4 shadow-[0_20px_50px_-20px_rgba(16,46,14,0.4)] backdrop-blur sm:block"
      >
        <RiskScoreCard score={30} size={120} compact showTier={false} label="Risk" />
      </motion.div>

      <motion.div
        animate={{ y: [0, 10, 0] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
        className="absolute -bottom-6 -left-4 flex items-center gap-3 rounded-2xl border border-ink-100 bg-white p-3 pr-5 shadow-[0_20px_50px_-20px_rgba(16,46,14,0.4)]"
      >
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50">
          <CheckCircle2 className="h-5 w-5 text-brand-600" />
        </span>
        <div>
          <p className="text-sm font-bold text-ink-900">Auto-approved</p>
          <p className="text-[11px] text-ink-400">Risk ≤ low threshold</p>
        </div>
      </motion.div>

      {/* <motion.div
        animate={{ rotate: [0, 12, 0] }}
        transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
        className="absolute -left-8 top-10 hidden rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 p-3 shadow-glow md:block"
      >
        <Sparkles className="h-5 w-5 text-white" />
      </motion.div> */}
    </motion.div>
  );
}
