import Link from "next/link";
import { ShieldIcon } from "./icons";

export default function TopNav() {
  return (
    <header className="w-full border-b border-white/60 bg-white/70 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5">
        <Link href="/" className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--brand)]/10 text-[var(--brand)]">
            <ShieldIcon className="h-6 w-6" />
          </span>
          <div className="font-display text-2xl font-semibold text-[#0B1324]">
            eKS
          </div>
        </Link>
        <Link
          href="/admin"
          className="text-sm font-medium text-[#6B7280] transition hover:text-[#0F172A]"
        >
          Admin Panel
        </Link>
      </div>
    </header>
  );
}
