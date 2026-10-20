import { motion } from "motion/react";
import { SectionLabel } from "./AgentsAtWork";
import { Upload, Sparkles, PhoneCall, CheckCircle2, LayoutDashboard } from "lucide-react";

const steps = [
  { icon: Upload, title: "Upload loads", body: "Import freight from any source — TMS, spreadsheet, email, or API." },
  { icon: Sparkles, title: "Target drivers", body: "Filter your roster by truck type and region; Basil skips do-not-call drivers automatically." },
  { icon: PhoneCall, title: "Call automatically", body: "Agents dial within legal hours, pitch the load, and handle objections with full context." },
  { icon: CheckCircle2, title: "Hand off hot leads", body: "Drivers ready to negotiate or book are transferred live to your dispatchers." },
  { icon: LayoutDashboard, title: "You review", body: "Monitor every call from your command center, in real time." },
];

export function HowItWorks() {
  return (
    <section id="how" className="relative px-6 py-32">
      <div
        className="absolute inset-0 pointer-events-none opacity-50"
        style={{
          backgroundImage: "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.05) 1px, transparent 0)",
          backgroundSize: "32px 32px",
          maskImage: "radial-gradient(ellipse 70% 60% at 50% 50%, black, transparent)"
        }}
      />
      <div className="relative max-w-6xl mx-auto">
        <SectionLabel>How Basil works</SectionLabel>
        <h2 className="font-serif mt-3" style={{ fontSize: "clamp(2rem, 4.5vw, 3.6rem)", lineHeight: 1.05, letterSpacing: -0.5, maxWidth: 760 }}>
          From load board to <span style={{ fontStyle: "italic", color: "#cfeedd" }}>live hand-off</span> in five steps.
        </h2>

        <div className="mt-16 relative">
          <div className="absolute left-0 right-0 top-[56px] h-px overflow-hidden hidden md:block" style={{ background: "var(--border-subtle)" }}>
            <div className="basil-line-flow absolute inset-0" />
          </div>
          <div className="grid md:grid-cols-5 gap-6">
            {steps.map((s, i) => (
              <motion.div
                key={s.title}
                initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.4 }}
                transition={{ duration: 0.5, delay: i * 0.08 }}
                className="basil-glass p-5 relative"
              >
                <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
                  style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.25)" }}>
                  <s.icon size={20} style={{ color: "var(--accent)" }} />
                </div>
                <div className="font-mono" style={{ fontSize: 10, color: "var(--text-tertiary)", letterSpacing: "0.18em" }}>
                  STEP {(i + 1).toString().padStart(2, "0")}
                </div>
                <div className="mt-1" style={{ fontSize: 16 }}>{s.title}</div>
                <p className="mt-2" style={{ color: "var(--text-secondary)", fontSize: 13, lineHeight: 1.55 }}>{s.body}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
