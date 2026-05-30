"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Menu, X, ArrowRight } from "lucide-react";
import Logo from "./ui/Logo";
import Button from "./ui/Button";
import { cn } from "@/lib/utils";

const links = [
  { label: "Features", href: "/#features" },
  { label: "How it works", href: "/#how" },
  { label: "Engines", href: "/#engines" },
  { label: "About", href: "/#why" },
];

/**
 * Shared navbar for landing + onboarding (same pill / glass style).
 */
export default function SiteNav({ fixed = true }) {
  const pathname = usePathname();
  const onOnboarding = pathname?.startsWith("/onboarding");
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const shellClass = fixed
    ? "fixed inset-x-0 top-0 z-50 px-4 pt-3 sm:px-6"
    : "w-full border-b border-[var(--soft-border)] bg-white/80 px-4 py-3 backdrop-blur-md sm:px-6";

  const navClass = cn(
    "mx-auto flex max-w-6xl items-center justify-between transition-all duration-300",
    fixed ? "rounded-full px-4 py-2.5 sm:px-5" : "px-0 py-0",
    fixed &&
      (scrolled
        ? "glass shadow-[0_8px_30px_-12px_rgba(16,46,14,0.25)]"
        : "border border-transparent bg-white/0"),
    !fixed && "rounded-none"
  );

  const cta = onOnboarding ? (
    <Link
      href="/"
      className="rounded-full px-3.5 py-2 text-sm font-medium text-ink-600 transition-colors hover:bg-ink-100 hover:text-ink-900"
    >
      Back to home
    </Link>
  ) : (
    <Button href="/admin" size="sm">
      Admin Panel
      <ArrowRight className="h-4 w-4" />
    </Button>
  );

  const mobileCta = onOnboarding ? (
    <Link
      href="/"
      onClick={() => setOpen(false)}
      className="rounded-2xl px-4 py-3 text-center text-sm font-medium text-ink-700 hover:bg-white/70"
    >
      Back to home
    </Link>
  ) : (
    <Button href="/admin" size="sm">
      Admin Panel
      <ArrowRight className="h-4 w-4" />
    </Button>
  );

  const content = (
    <nav className={navClass}>
      <Logo />

      <div className="hidden items-center gap-1 lg:flex">
        {links.map((link) => (
          <Link
            key={link.label}
            href={link.href}
            className="rounded-full px-3.5 py-2 text-sm font-medium text-ink-600 transition-colors hover:bg-ink-100 hover:text-ink-900"
          >
            {link.label}
          </Link>
        ))}
      </div>

      <div className="hidden items-center gap-2 lg:flex">{cta}</div>

      <button
        type="button"
        className="grid h-10 w-10 place-items-center rounded-full text-ink-700 hover:bg-ink-100 lg:hidden"
        onClick={() => setOpen((value) => !value)}
        aria-label="Toggle menu"
      >
        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>
    </nav>
  );

  if (!fixed) {
    return <header className={shellClass}>{content}</header>;
  }

  return (
    <motion.header
      initial={{ y: -80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className={shellClass}
    >
      {content}

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="mx-auto mt-2 max-w-6xl overflow-hidden rounded-3xl glass p-3 shadow-soft lg:hidden"
          >
            <div className="flex flex-col">
              {links.map((link) => (
                <Link
                  key={link.label}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="rounded-2xl px-4 py-3 text-sm font-medium text-ink-700 hover:bg-white/70"
                >
                  {link.label}
                </Link>
              ))}
              <div className="mt-2 border-t border-ink-100 pt-3">{mobileCta}</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  );
}
