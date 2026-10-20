import { useEffect, useRef, useState } from "react";

const stats = [
  // Product capabilities, not customer metrics (no fabricated traction numbers).
  { value: 50, prefix: "", suffix: "", label: "Agents per account" },
  { value: 200, prefix: "", suffix: "", label: "Calls per number per day (spam-safe cap)" },
  { value: 3, prefix: "", suffix: " min", label: "Max hold before a human picks up" },
  { value: 0.13, prefix: "~$", suffix: "/min", label: "Estimated carrier + AI cost", decimals: 2 },
];

function useInView<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (!ref.current) return;
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setSeen(true); obs.disconnect(); }
    }, { threshold: 0.4 });
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);
  return { ref, seen };
}

function Counter({ to, decimals = 0, format }: { to: number; decimals?: number; format?: (n: number) => string }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    const start = performance.now();
    const dur = 1400;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setV(to * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to]);
  return <>{format ? format(v) : v.toFixed(decimals)}</>;
}

export function StatsBanner() {
  const { ref, seen } = useInView<HTMLDivElement>();
  return (
    <section className="relative px-6 py-20">
      <div ref={ref} className="relative max-w-6xl mx-auto basil-glass basil-vein overflow-hidden">
        <div className="absolute inset-0 pointer-events-none" style={{
          background: "radial-gradient(ellipse 80% 100% at 50% 100%, rgba(34,197,94,0.10), transparent 60%)"
        }} />
        <div className="relative grid grid-cols-2 md:grid-cols-4 gap-y-10 gap-x-6 p-10">
          {stats.map((s, i) => (
            <div key={i} className="text-center md:text-left">
              <div className="font-mono" style={{ fontSize: 40, letterSpacing: -1, color: "var(--text-primary)" }}>
                {s.prefix}
                {seen ? <Counter to={s.value} decimals={s.decimals ?? 0} format={s.format} /> : (s.format ? s.format(0) : (0).toFixed(s.decimals ?? 0))}
                {s.suffix}
              </div>
              <div className="mt-2" style={{ color: "var(--text-secondary)", fontSize: 13 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
