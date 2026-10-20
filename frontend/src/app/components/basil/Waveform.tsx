import { useEffect, useRef } from "react";

export function Waveform({ className, bars = 48, color = "#22c55e" }: { className?: string; bars?: number; color?: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const children = Array.from(el.children) as HTMLDivElement[];
    let raf = 0;
    const tick = (t: number) => {
      for (let i = 0; i < children.length; i++) {
        const v = 0.25 + Math.abs(Math.sin(t * 0.005 + i * 0.42)) * Math.abs(Math.sin(t * 0.0015 + i * 0.1)) * 0.95;
        children[i].style.transform = `scaleY(${v.toFixed(3)})`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div ref={ref} className={`flex items-center gap-[3px] h-8 ${className ?? ""}`}>
      {Array.from({ length: bars }).map((_, i) => (
        <div key={i} className="w-[3px] h-full rounded-full origin-center" style={{ background: color, opacity: 0.35 + (i % 7) * 0.08 }} />
      ))}
    </div>
  );
}
