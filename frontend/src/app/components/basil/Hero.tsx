import { motion } from "motion/react";
import { ParticleGalaxy } from "./ParticleGalaxy";
import { Play, ArrowRight } from "lucide-react";

export function Hero() {
  return (
    <section className="relative min-h-[100vh] w-full overflow-hidden basil-hero-gradient">
      <div className="absolute inset-0 basil-noise opacity-[0.35] pointer-events-none" />
      <ParticleGalaxy className="absolute inset-0 w-full h-full" />
      <div className="absolute inset-0 pointer-events-none" style={{
        background: "linear-gradient(180deg, rgba(5,5,5,0) 55%, rgba(5,5,5,0.6) 80%, var(--bg-root) 100%)",
      }} />

      <div className="relative z-10 max-w-6xl mx-auto px-6 pt-40 pb-32 text-center">
        <motion.p
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}
          className="font-mono uppercase tracking-[0.22em]"
          style={{ color: "var(--accent)", fontSize: 11 }}
        >
          AI-Powered Freight Dispatch
        </motion.p>

        <motion.h1
          initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, delay: 0.1 }}
          className="font-serif mt-6 mx-auto"
          style={{ fontSize: "clamp(3rem, 8vw, 6.5rem)", lineHeight: 1.02, letterSpacing: -1.2, maxWidth: 980 }}
        >
          Unlimited agents.<br />
          Unlimited calls.<br />
          <span style={{ fontStyle: "italic", color: "#cfeedd" }}>Zero downtime.</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.25 }}
          className="mt-7 mx-auto"
          style={{ color: "var(--text-secondary)", maxWidth: 560, fontSize: 17, lineHeight: 1.55 }}
        >
          Basil calls your drivers, pitches your loads, handles objections, and hands every hot lead to your dispatchers live — at a fraction of the cost of cold-calling by hand.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.4 }}
          className="mt-10 flex items-center justify-center gap-3 flex-wrap"
        >
          <button className="basil-btn-primary" style={{ padding: "14px 22px", fontSize: 15 }}>
            Launch your first agent <ArrowRight size={16} />
          </button>
          <button className="basil-btn-ghost" style={{ padding: "14px 22px", fontSize: 15 }}>
            <Play size={14} /> Watch demo
          </button>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1, delay: 0.7 }}
          className="mt-14 flex flex-col items-center gap-4"
        >
          <p className="font-mono uppercase" style={{ color: "var(--text-tertiary)", fontSize: 10, letterSpacing: "0.2em" }}>
            Discloses it's an AI · Honors do-not-call · Calls only 8 AM–9 PM driver time
          </p>
        </motion.div>
      </div>
    </section>
  );
}
