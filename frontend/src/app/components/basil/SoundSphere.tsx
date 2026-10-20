import { useEffect, useRef } from "react";

export function SoundSphere({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0, h = 0;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      w = rect.width; h = rect.height;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize); ro.observe(canvas);

    // build sphere points (fibonacci lattice)
    const N = 700;
    type P = { x:number;y:number;z:number };
    const pts: P[] = [];
    const phi = Math.PI * (Math.sqrt(5) - 1);
    for (let i = 0; i < N; i++) {
      const y = 1 - (i / (N - 1)) * 2;
      const r = Math.sqrt(1 - y * y);
      const theta = phi * i;
      pts.push({ x: Math.cos(theta) * r, y, z: Math.sin(theta) * r });
    }

    let raf = 0;
    const render = (now: number) => {
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2, cy = h / 2;
      const R = Math.min(w, h) * 0.38;
      const rot = now * 0.0004;
      const cos = Math.cos(rot), sin = Math.sin(rot);

      // glow
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.8);
      grad.addColorStop(0, "rgba(34,197,94,0.22)");
      grad.addColorStop(0.5, "rgba(34,197,94,0.06)");
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);

      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        const rx = p.x * cos - p.z * sin;
        const rz = p.x * sin + p.z * cos;
        // audio-like deformation
        const freq = Math.sin(now * 0.003 + p.y * 6 + rz * 4) * 0.5
                   + Math.sin(now * 0.005 + p.x * 8) * 0.5;
        const disp = 1 + freq * 0.08;
        const x = cx + rx * R * disp;
        const y = cy + p.y * R * disp;
        const depth = (rz + 1) / 2;
        const size = 0.6 + depth * 2.2;
        const alpha = 0.15 + depth * 0.75;
        ctx.fillStyle = `rgba(${80 + depth * 80}, ${220}, ${130 + depth * 70}, ${alpha})`;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
      }

      // orbiting active-call dots
      for (let k = 0; k < 5; k++) {
        const a = now * 0.0008 + k * 1.3;
        const orbitR = R * (1.15 + (k % 2) * 0.12);
        const x = cx + Math.cos(a) * orbitR;
        const y = cy + Math.sin(a) * orbitR * 0.5;
        ctx.fillStyle = "rgba(34,197,94,0.9)";
        ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "rgba(34,197,94,0.25)";
        ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.fill();
      }

      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);

  return <canvas ref={ref} className={className} />;
}
