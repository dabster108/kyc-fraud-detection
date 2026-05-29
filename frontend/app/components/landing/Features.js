"use client";

import { motion } from "motion/react";
import { FEATURES } from "@/lib/mockData";
import SectionHeading from "../ui/SectionHeading";
import Icon from "../ui/Icon";

export default function Features() {
  return (
    <section id="features" className="relative py-24">
      <div className="mx-auto max-w-6xl px-5 sm:px-6">
        <SectionHeading
          eyebrow="Detection Stack"
          title="Five layers of fraud defense, one decision"
          subtitle="Every onboarding runs through a coordinated set of AI engines designed to catch what a single check would miss."
        />

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 26 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.5, delay: (index % 3) * 0.08 }}
              whileHover={{ y: -6 }}
              className="group relative overflow-hidden rounded-3xl border border-ink-100 bg-white p-6 shadow-[0_2px_10px_-4px_rgba(16,46,14,0.06)] transition-shadow hover:shadow-[0_24px_50px_-24px_rgba(16,46,14,0.3)]"
            >
              <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-brand-100/0 blur-2xl transition-all duration-500 group-hover:bg-brand-200/60" />
              <div
                className={`relative grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br ${feature.accent} text-white shadow-[0_10px_24px_-10px_rgba(96,187,70,0.8)]`}
              >
                <Icon name={feature.icon} className="h-6 w-6" strokeWidth={2.1} />
              </div>
              <h3 className="relative mt-5 font-display text-lg font-bold text-ink-900">
                {feature.title}
              </h3>
              <p className="relative mt-2 text-sm leading-relaxed text-ink-500">
                {feature.desc}
              </p>
              <div className="relative mt-4 h-px w-full bg-gradient-to-r from-brand-200 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
