"use client";

import { useEffect, useMemo, useState } from "react";

export default function AnimatedCounter({
  value,
  duration = 1200,
  decimals = 0,
  format = true,
}) {
  const [display, setDisplay] = useState(0);
  const finalValue = useMemo(() => Number(value) || 0, [value]);

  useEffect(() => {
    let frame = 0;
    const totalFrames = Math.round((duration / 1000) * 60);

    const tick = () => {
      frame += 1;
      const progress = Math.min(frame / totalFrames, 1);
      const nextValue = finalValue * progress;
      setDisplay(nextValue);
      if (progress < 1) {
        requestAnimationFrame(tick);
      }
    };

    const raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [duration, finalValue]);

  const output = display.toFixed(decimals);
  return <span>{format ? Number(output).toLocaleString() : output}</span>;
}
