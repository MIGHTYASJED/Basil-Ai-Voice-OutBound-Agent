import { ParticleGalaxy } from "./ParticleGalaxy";

export function CTA() {
  return (
    <section className="relative px-6 py-32 overflow-hidden">
      <ParticleGalaxy density={0.4} className="absolute inset-0 w-full h-full opacity-70" />
      <div className="absolute inset-0 pointer-events-none" style={{
        background: "radial-gradient(ellipse 70% 60% at 50% 50%, transparent, var(--bg-root) 80%)"
      }} />
      <div className="relative max-w-3xl mx-auto text-center">
        <h2 className="font-serif" style={{ fontSize: "clamp(2.4rem, 6vw, 4.5rem)", lineHeight: 1.05, letterSpacing: -0.8 }}>
          Your drivers are <span style={{ fontStyle: "italic", color: "#cfeedd" }}>waiting.</span>
        </h2>
        <p className="mt-6" style={{ color: "var(--text-secondary)", fontSize: 17, lineHeight: 1.55 }}>
          Launch your first AI agent in under five minutes. No code required.
        </p>
        <div className="mt-8 flex gap-3 justify-center flex-wrap">
          <button className="basil-btn-primary" style={{ padding: "14px 22px", fontSize: 15 }}>Start free</button>
          <button className="basil-btn-ghost" style={{ padding: "14px 22px", fontSize: 15 }}>Talk to sales</button>
        </div>
      </div>
    </section>
  );
}
