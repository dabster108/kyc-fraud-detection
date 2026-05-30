"use client";

import { motion } from "motion/react";
import { HOW_IT_WORKS } from "@/lib/mockData";
import SectionHeading from "../ui/SectionHeading";
import Icon from "../ui/Icon";

export default function HowItWorks() {
  return (
    <section id="how" className="relative bg-ink-50/60 py-24">
      <div className="mx-auto max-w-6xl px-5 sm:px-6">
        <SectionHeading
          eyebrow="How it works"
          title="Same 3 steps as /onboarding"
          subtitle="Upload → review OCR-filled info → face verification. Admins finish the rest in the dashboard."
        />

        <div className="relative mt-16">
          <div className="absolute left-0 right-0 top-12 hidden h-px bg-gradient-to-r from-transparent via-brand-300 to-transparent lg:block" />
          <div className="grid gap-8 lg:grid-cols-4">
            {HOW_IT_WORKS.map((step, index) => (
              <motion.div
                key={step.step}
                initial={{ opacity: 0, y: 26 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.4 }}
                transition={{ duration: 0.5, delay: index * 0.12 }}
                className="relative text-center lg:text-left"
              >
                <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-3xl border border-ink-100 bg-white shadow-soft lg:mx-0">
                  <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-50 text-brand-600">
                    <Icon name={step.icon} className="h-6 w-6" />
                  </span>
                </div>
                <span className="mt-4 block font-mono text-xs font-semibold text-brand-500">
                  STEP {step.step}
                </span>
                <h3 className="mt-1 font-display text-xl font-bold text-ink-900">
                  {step.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-500">
                  {step.desc}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
