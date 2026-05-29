"use client";

import {
  Activity,
  CheckCircle2,
  Fingerprint,
  ScanFace,
  ShieldCheck,
  Sparkles,
  FileSearch,
} from "lucide-react";

const iconMap = {
  "activity": Activity,
  "check-circle": CheckCircle2,
  "fingerprint": Fingerprint,
  "scan-face": ScanFace,
  "shield-check": ShieldCheck,
  "sparkles": Sparkles,
  "file-search": FileSearch,
};

export default function Icon({ name, className, strokeWidth = 2 }) {
  const Component = iconMap[name] || ShieldCheck;
  return <Component className={className} strokeWidth={strokeWidth} />;
}
