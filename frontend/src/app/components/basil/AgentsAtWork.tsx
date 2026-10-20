import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { SoundSphere } from "./SoundSphere";
import { Waveform } from "./Waveform";

const transcript = [
  { who: "Basil", text: "Hey Marcus, this is Basil, an AI assistant for Northfleet Dispatch. Got a dry van load out of Dallas — want to hear it?" },
  { who: "Marcus", text: "Yeah, let's hear it." },
  { who: "Basil", text: "Dallas, TX to Memphis, TN. 340 miles, pickup tomorrow 6 AM, rate is $2.85 a mile." },
  { who: "Marcus", text: "Hmm. Anything better than $2.85?" },
  { who: "Basil", text: "That's the posted rate, but a dispatcher can talk numbers with you. Want me to connect you now?" },
  { who: "Marcus", text: "Yeah, put them on." },
  { who: "Basil", text: "Connecting you to Dana now — she has your location and availability. One moment, Marcus." },
];

export function AgentsAtWork() {
  const [shown, setShown] = useState(2);
  useEffect(() => {
    if (shown >= transcript.length) {
      const t = setTimeout(() => setShown(2), 3000);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setShown((s) => s + 1), 1700);
    return () => clearTimeout(t);
  }, [shown]);

  return (
    <section id="product" className="relative px-6 py-32">
      <div className="max-w-6xl mx-auto">
        <SectionLabel>Live • Agents at work</SectionLabel>
        <h2 className="font-serif mt-3" style={{ fontSize: "clamp(2rem, 4.5vw, 3.6rem)", lineHeight: 1.05, letterSpacing: -0.5, maxWidth: 720 }}>
          The voice you hear is a fleet of agents <span style={{ fontStyle: "italic", color: "#cfeedd" }}>working in parallel.</span>
        </h2>
        <p className="mt-5" style={{ color: "var(--text-secondary)", maxWidth: 560, fontSize: 17 }}>
          Every particle on this sphere is an active call — pitching loads, handling objections, and handing hot leads to humans in real time.
        </p>

        <div className="mt-14 grid md:grid-cols-2 gap-10 items-center">
          <div className="relative aspect-square max-w-[460px] mx-auto w-full">
            <SoundSphere className="absolute inset-0 w-full h-full" />
          </div>

          <motion.div
            initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.4 }} transition={{ duration: 0.7 }}
            className="basil-glass p-6 md:p-7 relative overflow-hidden"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.3)" }}>
                  <span className="font-mono" style={{ color: "var(--accent)", fontSize: 12 }}>07</span>
                </div>
                <div>
                  <div style={{ fontSize: 14 }}>Basil-07</div>
                  <div className="font-mono" style={{ fontSize: 11, color: "var(--text-tertiary)" }}>+1 (214) 555-0143</div>
                </div>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full" style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.25)" }}>
                <span className="basil-dot-pulse" />
                <span className="font-mono" style={{ fontSize: 11, color: "var(--accent)" }}>CONNECTED · 0:{(34 + shown * 6).toString().padStart(2,'0')}</span>
              </div>
            </div>

            <div className="mt-5 space-y-3 min-h-[260px]">
              {transcript.slice(0, shown).map((m, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}
                  className="flex gap-3"
                >
                  <span className="font-mono shrink-0" style={{ fontSize: 11, color: m.who === "Basil" ? "var(--accent)" : "var(--text-tertiary)", width: 56, paddingTop: 2 }}>
                    {m.who}
                  </span>
                  <span style={{ fontSize: 14, lineHeight: 1.55, color: m.who === "Basil" ? "var(--text-primary)" : "var(--text-secondary)" }}>
                    {m.text}
                  </span>
                </motion.div>
              ))}
            </div>

            <div className="mt-5 pt-4" style={{ borderTop: "1px solid var(--border-subtle)" }}>
              <div className="flex items-center justify-between">
                <Waveform className="w-2/3" />
                <span className="font-mono" style={{ fontSize: 11, color: "var(--text-tertiary)" }}>LOAD #4521 · DAL→MEM</span>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid var(--border-subtle)" }}>
      <span className="basil-dot-pulse" />
      <span className="font-mono uppercase" style={{ fontSize: 10, letterSpacing: "0.2em", color: "var(--text-secondary)" }}>{children}</span>
    </div>
  );
}
