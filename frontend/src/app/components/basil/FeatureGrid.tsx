import { SectionLabel } from "./AgentsAtWork";
import { Waveform } from "./Waveform";
import { motion } from "motion/react";
import { Clock, Users, BarChart3, Layers } from "lucide-react";

export function FeatureGrid() {
  return (
    <section className="relative px-6 py-32">
      <div className="max-w-6xl mx-auto">
        <SectionLabel>Capabilities</SectionLabel>
        <h2 className="font-serif mt-3" style={{ fontSize: "clamp(2rem, 4.5vw, 3.6rem)", lineHeight: 1.05, letterSpacing: -0.5, maxWidth: 760 }}>
          A command center built for <span style={{ fontStyle: "italic", color: "#cfeedd" }}>operators.</span>
        </h2>

        <div className="mt-14 grid grid-cols-1 md:grid-cols-3 gap-5 auto-rows-[280px]">
          <Tile className="md:col-span-2">
            <TileHeader title="Campaign builder" body="Design targeted campaigns, pick driver segments, and launch a fleet of agents in minutes." />
            <CampaignPreview />
          </Tile>

          <Tile>
            <TileHeader title="Live call monitoring" body="Hear every call as it happens. Live transcripts. Sentiment in real time." />
            <Waveform className="mt-auto" />
          </Tile>

          <Tile>
            <TileHeader title="Smart retries" icon={Clock} body="Basil knows when to call back — and what to say differently next time." />
            <div className="mt-auto font-mono" style={{ color: "var(--text-tertiary)", fontSize: 12 }}>
              <div className="flex justify-between py-1.5 border-b" style={{ borderColor: "var(--border-subtle)" }}><span>Retry · 2hr</span><span style={{ color: "var(--status-ringing)" }}>queued</span></div>
              <div className="flex justify-between py-1.5 border-b" style={{ borderColor: "var(--border-subtle)" }}><span>Retry · tomorrow 9am</span><span style={{ color: "var(--text-tertiary)" }}>scheduled</span></div>
              <div className="flex justify-between py-1.5"><span>Callback · driver req.</span><span style={{ color: "var(--accent)" }}>active</span></div>
            </div>
          </Tile>

          <Tile>
            <TileHeader title="Driver CRM" icon={Users} body="Every interaction logged. Preferences learned. Relationships built." />
            <DriverPreview />
          </Tile>

          <Tile>
            <TileHeader title="Analytics & ROI" icon={BarChart3} body="Conversion funnels, cost per booking, performance trends." />
            <MiniChart />
          </Tile>

          <Tile className="md:col-span-2">
            <TileHeader title="Multi-agent fleet" icon={Layers} body="Run 10, 50, 100 agents at once. Scale without hiring." />
            <AgentGrid />
          </Tile>
        </div>
      </div>
    </section>
  );
}

function Tile({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.6 }}
      whileHover={{ y: -4 }}
      className={`relative p-6 rounded-2xl flex flex-col overflow-hidden ${className ?? ""}`}
      style={{
        background: "linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.01))",
        border: "1px solid var(--border-subtle)",
      }}
    >
      <div className="absolute inset-0 pointer-events-none opacity-60" style={{
        background: "radial-gradient(ellipse 60% 50% at 100% 0%, rgba(34,197,94,0.06), transparent 60%)"
      }} />
      <div className="relative flex flex-col h-full">{children}</div>
    </motion.div>
  );
}

function TileHeader({ title, body, icon: Icon }: { title: string; body: string; icon?: any }) {
  return (
    <div className="mb-4">
      {Icon && (
        <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-3"
          style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.25)" }}>
          <Icon size={16} style={{ color: "var(--accent)" }} />
        </div>
      )}
      <div style={{ fontSize: 17 }}>{title}</div>
      <p className="mt-1.5" style={{ color: "var(--text-secondary)", fontSize: 13, lineHeight: 1.55, maxWidth: 360 }}>{body}</p>
    </div>
  );
}

function CampaignPreview() {
  return (
    <div className="mt-auto rounded-xl p-4" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)" }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="basil-dot-pulse" />
          <span style={{ fontSize: 12 }}>Reefer Push — TX outbound</span>
        </div>
        <span className="font-mono" style={{ fontSize: 11, color: "var(--text-tertiary)" }}>34/120 called</span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
        <div className="h-full" style={{ width: "28%", background: "linear-gradient(90deg, #22c55e, #34d57a)" }} />
      </div>
      <div className="grid grid-cols-3 gap-3 mt-4">
        {[["Connected","18"], ["Interested","9"], ["Booked","4"]].map(([l,v]) => (
          <div key={l}>
            <div className="font-mono" style={{ fontSize: 20 }}>{v}</div>
            <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{l}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DriverPreview() {
  return (
    <div className="mt-auto space-y-2">
      {[
        ["Marcus Johnson", "Dry Van · Dallas", "98"],
        ["Sarah Chen", "Reefer · Memphis", "94"],
        ["James Rivera", "Flatbed · Houston", "91"],
      ].map(([n,t,s]) => (
        <div key={n} className="flex items-center justify-between rounded-lg px-3 py-2" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)" }}>
          <div>
            <div style={{ fontSize: 13 }}>{n}</div>
            <div className="font-mono" style={{ fontSize: 10, color: "var(--text-tertiary)" }}>{t}</div>
          </div>
          <div className="font-mono" style={{ fontSize: 12, color: "var(--accent)" }}>{s}</div>
        </div>
      ))}
    </div>
  );
}

function MiniChart() {
  const points = [12, 18, 22, 19, 28, 34, 31, 40, 38, 46, 52, 48];
  const max = Math.max(...points);
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${(i / (points.length - 1)) * 100} ${100 - (p / max) * 100}`).join(" ");
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="mt-auto w-full h-24">
      <defs>
        <linearGradient id="fillg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(34,197,94,0.4)" />
          <stop offset="100%" stopColor="rgba(34,197,94,0)" />
        </linearGradient>
      </defs>
      <path d={`${path} L 100 100 L 0 100 Z`} fill="url(#fillg)" />
      <path d={path} stroke="#22c55e" strokeWidth="1.2" fill="none" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function AgentGrid() {
  return (
    <div className="mt-auto grid grid-cols-10 gap-1.5">
      {Array.from({ length: 50 }).map((_, i) => {
        const active = i % 3 !== 0;
        return (
          <div key={i} className="aspect-square rounded-md flex items-center justify-center"
            style={{
              background: active ? "rgba(34,197,94,0.12)" : "rgba(255,255,255,0.03)",
              border: `1px solid ${active ? "rgba(34,197,94,0.3)" : "var(--border-subtle)"}`,
            }}>
            {active && <div className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--accent)", boxShadow: "0 0 6px var(--accent-glow)" }} />}
          </div>
        );
      })}
    </div>
  );
}
