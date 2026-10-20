import { useEffect, useRef } from "react";

type Props = {
  density?: number;
  className?: string;
  intensity?: number;
};

export function ParticleGalaxy({ density = 1, className, intensity = 1 }: Props) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const mouse = useRef({ x: 0, y: 0, active: false });

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0, h = 0;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      w = rect.width; h = rect.height;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const count = Math.floor(900 * density);
    type P = { x:number;y:number;z:number;baseAngle:number;radius:number;speed:number;size:number };
    const particles: P[] = [];
    for (let i = 0; i < count; i++) {
      const arm = Math.floor(Math.random() * 3);
      const t = Math.random();
      const radius = Math.pow(t, 0.6) * 0.55;
      const angle = arm * (Math.PI * 2 / 3) + t * 6 + (Math.random() - 0.5) * 0.4;
      particles.push({
        x: 0, y: 0,
        z: 0.3 + Math.random() * 0.9,
        baseAngle: angle,
        radius,
        speed: 0.00008 + Math.random() * 0.00012,
        size: 0.6 + Math.random() * 1.6,
      });
    }

    const onMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouse.current.x = e.clientX - rect.left - rect.width / 2;
      mouse.current.y = e.clientY - rect.top - rect.height / 2;
      mouse.current.active = true;
    };
    const onLeave = () => { mouse.current.active = false; };
    canvas.addEventListener("mousemove", onMove);
    canvas.addEventListener("mouseleave", onLeave);

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let t0 = performance.now();
    const render = (now: number) => {
      const dt = now - t0; t0 = now;
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2; const cy = h / 2;
      const scale = Math.min(w, h) * 0.95;

      // soft central glow
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, scale * 0.6);
      grad.addColorStop(0, "rgba(34,197,94,0.18)");
      grad.addColorStop(0.4, "rgba(34,197,94,0.05)");
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        if (!reduced) p.baseAngle += p.speed * dt * (0.6 + p.z);
        const wobble = Math.sin(now * 0.0008 + i) * 0.004 * intensity;
        const r = (p.radius + wobble) * scale * p.z;
        let x = cx + Math.cos(p.baseAngle) * r;
        let y = cy + Math.sin(p.baseAngle) * r * 0.62;

        if (mouse.current.active) {
          const dx = x - (cx + mouse.current.x);
          const dy = y - (cy + mouse.current.y);
          const d2 = dx*dx + dy*dy;
          if (d2 < 14000) {
            const f = (14000 - d2) / 14000;
            x += (dx / Math.sqrt(d2 + 1)) * f * 18;
            y += (dy / Math.sqrt(d2 + 1)) * f * 18;
          }
        }

        p.x = x; p.y = y;
        const a = 0.25 + p.z * 0.55;
        const tint = i % 17 === 0;
        ctx.fillStyle = tint
          ? `rgba(190, 230, 255, ${a})`
          : `rgba(${110 + p.z * 60}, ${220}, ${150 + p.z * 60}, ${a})`;
        ctx.beginPath();
        ctx.arc(x, y, p.size * (0.6 + p.z * 0.8), 0, Math.PI * 2);
        ctx.fill();
      }

      // sparse connecting lines for nearby particles
      ctx.lineWidth = 0.5;
      for (let i = 0; i < particles.length; i += 4) {
        const a = particles[i];
        for (let j = i + 1; j < Math.min(i + 8, particles.length); j++) {
          const b = particles[j];
          const dx = a.x - b.x, dy = a.y - b.y;
          const d2 = dx*dx + dy*dy;
          if (d2 < 1600) {
            const alpha = (1 - d2 / 1600) * 0.12;
            ctx.strokeStyle = `rgba(34,197,94,${alpha})`;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }

      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("mousemove", onMove);
      canvas.removeEventListener("mouseleave", onLeave);
    };
  }, [density, intensity]);

  return <canvas ref={ref} className={className} />;
}
