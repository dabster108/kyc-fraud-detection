"use client";

import { motion } from "motion/react";
import { WHY_CHOOSE } from "@/lib/mockData";
import SectionHeading from "../ui/SectionHeading";
import Icon from "../ui/Icon";
import Button from "../ui/Button";
import { ArrowRight } from "lucide-react";

export default function WhyChoose() {
  return (
    <section id="why" className="relative py-24">
      <div className="mx-auto max-w-6xl px-5 sm:px-6">
        <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <SectionHeading
              align="left"
              eyebrow="Why eKS"
              title="Built for compliance teams that move fast"
              subtitle="The accuracy of a forensic lab with the speed users expect from a modern wallet."
            />
            <Button href="/onboarding" className="mt-8" size="lg">
              Try the flow
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            {WHY_CHOOSE.map((item, index) => (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.5, delay: index * 0.08 }}
                className="relative overflow-hidden rounded-3xl border border-ink-100 bg-gradient-to-br from-white to-ink-50/60 p-6"
              >
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-ink-900 text-brand-300">
                  <Icon name={item.icon} className="h-6 w-6" />
                </span>
                <h3 className="mt-4 font-display text-lg font-bold text-ink-900">
                  {item.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-500">
                  {item.desc}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
