"use client";

import { motion } from "motion/react";
import { ENGINES } from "@/lib/mockData";
import SectionHeading from "../ui/SectionHeading";
import Icon from "../ui/Icon";

export default function Engines() {
  return (
    <section id="engines" className="relative py-24">
      <div className="mx-auto max-w-6xl px-5 sm:px-6">
        <SectionHeading
          eyebrow="Backend services"
          title="Three ML + risk pipelines"
          subtitle="Express orchestrates Cloudinary storage, FastAPI forgery/OCR/face/liveness, and Postgres sessions."
        />

        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {ENGINES.map((engine, index) => (
            <motion.div
              key={engine.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.5, delay: index * 0.08 }}
              className="rounded-3xl border border-ink-100 bg-white p-6 shadow-[0_12px_40px_-24px_rgba(16,46,14,0.3)]"
            >
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-50 text-brand-600">
                <Icon name={engine.icon} className="h-6 w-6" />
              </span>
              <h3 className="mt-4 font-display text-lg font-bold text-ink-900">
                {engine.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-500">
                {engine.desc}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
