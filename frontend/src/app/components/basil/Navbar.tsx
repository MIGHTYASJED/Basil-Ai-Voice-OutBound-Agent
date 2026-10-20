import { useEffect, useState } from "react";

export function Navbar({ onEnterApp }: { onEnterApp: () => void }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <div className="fixed top-0 left-0 right-0 z-50 flex justify-center px-4 pointer-events-none">
      <div
        className={`pointer-events-auto mt-3 w-full max-w-6xl flex items-center justify-between rounded-2xl border transition-all duration-300`}
        style={{
          padding: scrolled ? "10px 18px" : "14px 22px",
          background: scrolled ? "rgba(10,10,10,0.65)" : "rgba(10,10,10,0.35)",
          backdropFilter: "blur(18px) saturate(1.2)",
          borderColor: scrolled ? "var(--border-medium)" : "var(--border-subtle)",
        }}
      >
        <div className="flex items-center gap-2">
          <LeafMark />
          <span className="font-serif" style={{ fontSize: 22, letterSpacing: 0.5 }}>Basil</span>
        </div>
        <nav className="hidden md:flex items-center gap-7" style={{ color: "var(--text-secondary)", fontSize: 14 }}>
          <a href="#product" className="hover:text-white transition-colors">Product</a>
          <a href="#how" className="hover:text-white transition-colors">How it works</a>
          <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
          <a href="#docs" className="hover:text-white transition-colors">Docs</a>
        </nav>
        <div className="flex items-center gap-2">
          <button className="basil-btn-ghost" onClick={onEnterApp}>Open dashboard</button>
          <button className="basil-btn-primary">Start free</button>
        </div>
      </div>
    </div>
  );
}

export function LeafMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <defs>
        <linearGradient id="lg" x1="0" y1="0" x2="32" y2="32">
          <stop offset="0%" stopColor="#34d57a" />
          <stop offset="100%" stopColor="#16a34a" />
        </linearGradient>
      </defs>
      <path
        d="M4 18C4 10 11 4 22 4c4 0 6 2 6 6 0 11-8 18-18 18-4 0-6-2-6-6 0-1 0-2 .2-4z"
        fill="url(#lg)" opacity="0.95"
      />
      <path d="M6 26 C 14 18 20 12 26 8" stroke="rgba(0,0,0,0.35)" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}
