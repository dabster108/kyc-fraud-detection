"use client";

import { motion } from "motion/react";
import { STATS } from "@/lib/mockData";
import AnimatedCounter from "../ui/AnimatedCounter";

function StatValue({ stat }) {
  if (stat.display.includes("M")) {
    return (
      <>
        <AnimatedCounter value={2.4} decimals={1} />M+
      </>
    );
  }
  if (stat.display.includes("K")) {
    return (
      <>
        <AnimatedCounter value={184} />K+
      </>
    );
  }
  if (stat.suffix === "%") {
    return (
      <>
        <AnimatedCounter value={stat.value} decimals={1} format={false} />%
      </>
    );
  }
  return (
    <>
      <AnimatedCounter value={stat.value} format={false} />
      {stat.suffix}
    </>
  );
}

export default function Stats() {
  return (
    <section className="relative py-20">
      <div className="mx-auto max-w-6xl px-5 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.6 }}
          className="relative overflow-hidden rounded-[2.5rem] bg-ink-950 px-6 py-12 sm:px-12"
        >
          <div className="pointer-events-none absolute inset-0 bg-grid-dark opacity-40" />
          <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-brand-500/30 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -left-10 h-72 w-72 rounded-full bg-brand-600/20 blur-3xl" />

          <div className="relative grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {STATS.map((stat, index) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="text-center sm:text-left"
              >
                <p className="font-display text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
                  {stat.static ? (
                    stat.display
                  ) : (
                    <StatValue stat={stat} />
                  )}
                </p>
                <p className="mt-2 text-sm font-medium text-white/50">
                  {stat.label}
                </p>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
