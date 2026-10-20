// Live, API-backed versions of the dashboard pages that previously rendered
// hard-coded demo numbers (Mission Control, Campaign detail, Call log,
// Analytics, Dispatcher queue, Agents). Every number on these screens now
// comes from the backend.
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Plus, Download, Phone, Headphones, ChevronRight, ChevronDown, Pause, Play, ArrowLeft, Lock,
  Mail, MapPin, Truck, Users, Copy, X, Flag, ArrowRightLeft, PhoneOff,
} from "lucide-react";
import { Card, FilterChip, PageHeader, Tabs, Tag, useDash, Field, Input, Select, Modal } from "./shared";
import { useData } from "./useData";
import { TestAgentModal } from "./TestAgentModal";
import { CreateAgentModal, EditAgentModal } from "./overlays";
import { api } from "../../../lib/api";
import { useRealtime } from "../../../lib/realtime";
import { Waveform } from "../Waveform";

/* ───────────────────────── helpers ───────────────────────── */

const fmtDur = (sec?: number) => (!sec ? "—" : `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}`);
const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);

function ago(ts?: string | number | Date | null) {
  if (!ts) return "";
  const s = Math.max(0, Math.floor((Date.now() - new Date(ts).getTime()) / 1000));
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} hr ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

export const OUTCOME_LABEL: Record<string, string> = {
  booked: "Booked", transferred: "Transferred", callback: "Callback", not_interested: "Not interested",
  no_answer: "No answer", failed: "Failed", dnc: "Do not call", wrong_number: "Wrong number",
};

export function OutcomeTag({ o }: { o?: string | null }) {
  if (!o || o === "—") return <Tag kind="neutral">in progress</Tag>;
  const kind: any = o === "booked" ? "booked" : o === "transferred" || o === "callback" ? "ringing" : o === "not_interested" || o === "failed" || o === "dnc" ? "failed" : "neutral";
  return <Tag kind={kind}>{OUTCOME_LABEL[o] ?? o}</Tag>;
}

function useAnalytics(days: number) {
  const [data, setData] = useState<any>(null);
  const load = useCallback(() => { api.analytics(days).then(setData).catch(() => setData(null)); }, [days]);
  useEffect(() => { load(); }, [load]);
  return { data, reload: load };
}

function StatCard({ label, value, sublabel, pulse, onClick }: { label: string; value: string | number; sublabel?: string; pulse?: boolean; onClick?: () => void }) {
  return (
    <button onClick={onClick} className="text-left p-4 rounded-xl hover:bg-white/[0.02]" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}>
      <div className="flex items-center justify-between">
        <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{label}</span>
        {pulse && <span className="basil-dot-pulse" />}
      </div>
      <div className="font-mono mt-2" style={{ fontSize: 28, letterSpacing: -0.5 }}>{value}</div>
      {sublabel && <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{sublabel}</div>}
    </button>
  );
}

function FunnelRow({ label, count, of }: { label: string; count: number; of: number }) {
  const p = of > 0 ? (count / of) * 100 : 0;
  return (
    <div className="flex items-center gap-3 py-2">
      <span style={{ fontSize: 12, color: "var(--text-secondary)", width: 110 }}>{label}</span>
      <div className="flex-1 h-3 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.04)" }}>
        <div className="h-full" style={{ width: `${p}%`, background: "linear-gradient(90deg, rgba(34,197,94,0.5), #22c55e)" }} />
      </div>
      <span className="font-mono" style={{ fontSize: 12, color: "var(--text-secondary)", width: 90, textAlign: "right" }}>{count} ({Math.round(p)}%)</span>
    </div>
  );
}

function Empty({ children }: { children: any }) {
  return <div className="py-8 text-center" style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{children}</div>;
}

/** Calls per hour of day — real data from /analytics heatmap. */
function HourChart({ heatmap, from = 7, to = 21 }: { heatmap?: { hour: number; calls: number; connected: number }[]; from?: number; to?: number }) {
  const rows = (heatmap ?? []).filter((h) => h.hour >= from && h.hour <= to);
  const max = Math.max(1, ...rows.map((r) => r.calls));
  if (!rows.length || rows.every((r) => r.calls === 0)) return <Empty>No calls in this period yet.</Empty>;
  const W = 600, H = 160, pad = 30, bw = (W - pad * 2) / rows.length;
  return (
    <svg viewBox={`0 0 ${W} ${H + 20}`} className="w-full h-48">
      {[0.25, 0.5, 0.75, 1].map((f) => <line key={f} x1={pad} x2={W - pad} y1={H - f * (H - 10)} y2={H - f * (H - 10)} stroke="rgba(255,255,255,0.04)" />)}
      {rows.map((r, i) => {
        const h = (r.calls / max) * (H - 10);
        const hc = (r.connected / max) * (H - 10);
        const label = r.hour === 0 ? "12a" : r.hour < 12 ? `${r.hour}a` : r.hour === 12 ? "12p" : `${r.hour - 12}p`;
        return (
          <g key={r.hour}>
            <rect x={pad + i * bw + 3} y={H - h} width={bw - 6} height={h} rx={2} fill="rgba(255,255,255,0.12)"><title>{`${label}: ${r.calls} calls`}</title></rect>
            <rect x={pad + i * bw + 3} y={H - hc} width={bw - 6} height={hc} rx={2} fill="#22c55e"><title>{`${label}: ${r.connected} connected`}</title></rect>
            <text x={pad + i * bw + bw / 2} y={H + 14} fill="rgba(255,255,255,0.4)" fontSize="9" fontFamily="monospace" textAnchor="middle">{label}</text>
          </g>
        );
      })}
    </svg>
  );
}

/* ───────────────────────── MISSION CONTROL ───────────────────────── */

const FEED_ICON: Record<string, string> = { dialing: "📞", ringing: "📞", live: "🟢", queued: "⏳", done: "•" };

export function MissionControl() {
  const { campaigns, mission, callLog } = useData();
  const { setPage, setPayload, openListen } = useDash();
  const [testOpen, setTestOpen] = useState(false);
  const { data: today, reload: reloadToday } = useAnalytics(1);
  const s = mission?.stats;
  useRealtime("mission", () => reloadToday());

  const feed = useMemo(() => (callLog ?? []).slice(0, 14).map((c: any) => {
    const verb = c.status === "live" ? `talking with ${c.driver}` :
      c.status === "dialing" || c.status === "ringing" ? `dialing ${c.driver}…` :
      c.outcome === "transferred" ? `transferred ${c.driver} to a dispatcher` :
      c.outcome === "booked" ? `booked ${c.load} with ${c.driver}` :
      c.outcome === "callback" ? `callback requested — ${c.driver}` :
      c.outcome === "no_answer" ? `no answer — ${c.driver}` :
      c.outcome === "not_interested" ? `${c.driver} not interested` : `${c.driver} — ${OUTCOME_LABEL[c.outcome] ?? c.status}`;
    const icon = c.outcome === "booked" ? "✅" : c.outcome === "transferred" ? "🔀" : c.outcome === "no_answer" ? "📵" : c.outcome === "not_interested" ? "❌" : c.outcome === "callback" ? "🔄" : FEED_ICON[c.status] ?? "•";
    return { ...c, verb, icon };
  }), [callLog]);

  const active = campaigns.filter((c: any) => c.status === "Active").slice(0, 4);

  return (
    <div className="p-6 space-y-6">
      <PageHeader title="Mission Control" subtitle={new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })} actions={
        <button onClick={() => setTestOpen(true)} className="basil-btn-primary" style={{ padding: "8px 14px", fontSize: 12 }}>🎙 Test Agent</button>
      } />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Calls today" value={s?.callsToday ?? 0} sublabel={`$${(s?.cost ?? 0).toFixed(2)} spend`} onClick={() => setPage("calls")} />
        <StatCard label="Connected" value={s?.connected ?? 0} sublabel={`${s?.connectRate ?? "0%"} connect rate`} onClick={() => setPage("calls")} />
        <StatCard label="Transferred to humans" value={s?.transferred ?? 0} sublabel={`${s?.booked ?? 0} booked`} onClick={() => setPage("queue")} />
        <StatCard label="Live right now" value={mission?.live?.length ?? 0} sublabel={`${s?.agentsLive ?? 0} of ${s?.agentsTotal ?? 0} agents busy · ${s?.queueDepth ?? 0} in queue`} pulse onClick={() => setPage("queue")} />
      </div>

      <CallCapacityCard callsToday={s?.callsToday ?? 0} />
      <TestAgentModal open={testOpen} onClose={() => setTestOpen(false)} />

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3 rounded-xl" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}>
          <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
            <div className="flex items-center gap-2"><span className="basil-dot-pulse" /><span style={{ fontSize: 14 }}>Live activity</span></div>
            <span className="font-mono" style={{ fontSize: 11, color: "var(--text-tertiary)" }}>updates in real time</span>
          </div>
          <div className="px-2 py-2 max-h-[420px] overflow-y-auto">
            {feed.length === 0 && <Empty>No calls yet. Launch a campaign to start dialing.</Empty>}
            <AnimatePresence initial={false}>
              {feed.map((e: any) => (
                <motion.button key={e.id} layout
                  onClick={() => e.status === "live" ? openListen({ agent: e.agent, driver: e.driver, load: e.load, callId: e.id } as any) : setPage("calls")}
                  initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}
                  className="w-full text-left flex items-center gap-3 px-3 py-2 rounded-md hover:bg-white/[0.03]">
                  <span style={{ fontSize: 13 }}>{e.icon}</span>
                  <Tag kind="live">{e.agent}</Tag>
                  <span className="flex-1 truncate" style={{ fontSize: 13, color: "var(--text-secondary)" }}>{e.verb}{e.dur !== "—" ? ` — ${e.dur}` : ""}</span>
                  {e.status === "live" && <span className="font-mono" style={{ fontSize: 10, color: "var(--accent)" }}>LISTEN</span>}
                  <span className="font-mono" style={{ fontSize: 10, color: "var(--text-tertiary)" }}>{ago(e.createdAt)}</span>
                </motion.button>
              ))}
            </AnimatePresence>
          </div>
        </div>

        <div className="lg:col-span-2 rounded-xl" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}>
          <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
            <span style={{ fontSize: 14 }}>Active campaigns</span>
            <button onClick={() => setPage("campaigns")} className="basil-btn-ghost" style={{ padding: "4px 8px", fontSize: 11 }}>View all</button>
          </div>
          <div className="p-3 space-y-2">
            {active.length === 0 && <Empty>No campaigns running.</Empty>}
            {active.map((c: any) => (
              <button key={c.id} onClick={() => { setPage("campaign-detail"); setPayload({ campaignId: c.id }); }} className="block w-full text-left p-3 rounded-lg" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)" }}>
                <div className="flex items-center justify-between">
                  <span style={{ fontSize: 13 }}>{c.name}</span>
                  <Tag kind={c.inWindow ? "live" : "queued"}>{c.inWindow ? "Calling" : "Waiting for window"}</Tag>
                </div>
                <div className="mt-2 h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
                  <div className="h-full" style={{ width: `${c.pct}%`, background: "linear-gradient(90deg, #22c55e, #34d57a)" }} />
                </div>
                <div className="mt-2 flex items-center justify-between font-mono" style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                  <span>{c.called}/{c.total} drivers</span><span>{c.connected} connected · {c.booked} booked</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      <Card>
        <div className="flex items-center justify-between mb-1">
          <span style={{ fontSize: 14 }}>Calls by hour (last 24h)</span>
          <span className="font-mono" style={{ fontSize: 10, color: "var(--text-tertiary)" }}><span style={{ color: "#22c55e" }}>■</span> connected <span style={{ color: "rgba(255,255,255,0.3)" }}>■</span> dialed</span>
        </div>
        <HourChart heatmap={today?.heatmap} from={0} to={23} />
      </Card>
    </div>
  );
}

function CallCapacityCard({ callsToday }: { callsToday: number }) {
  const { agents } = useData();
  const usable = agents.filter((a: any) => a.status !== "paused" && a.status !== "offline").length;
  const [avgSec, setAvgSec] = useState(60);
  const windowMin = 8 * 60;
  const cpm = usable * (60 / avgSec);
  const cpd = Math.round(cpm * windowMin);
  const p = Math.min(100, Math.round((callsToday / Math.max(cpd, 1)) * 100));
  return (
    <Card>
      <div className="font-mono uppercase mb-3" style={{ fontSize: 10, letterSpacing: "0.18em", color: "var(--text-tertiary)" }}>Call capacity</div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="p-3 rounded-lg" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)" }}>
          <div className="flex items-center gap-2 mb-1"><Users size={13} color="var(--accent)" /><span style={{ fontSize: 12, color: "var(--text-secondary)" }}>Available agents</span></div>
          <div className="font-mono" style={{ fontSize: 24 }}>{usable}</div>
        </div>
        <div className="p-3 rounded-lg" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)" }}>
          <div className="mb-1" style={{ fontSize: 12, color: "var(--text-secondary)" }}>Calling window</div>
          <div className="font-mono" style={{ fontSize: 24 }}>{windowMin} min</div>
          <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>8 hours/day · legal limit 8 AM–9 PM driver time</div>
        </div>
        <div className="p-3 rounded-lg" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)" }}>
          <div className="mb-1" style={{ fontSize: 12, color: "var(--text-secondary)" }}>Theoretical capacity</div>
          <div className="font-mono" style={{ fontSize: 20, color: "var(--accent)" }}>~{cpd.toLocaleString()} calls/day</div>
          <div className="font-mono" style={{ fontSize: 11, color: "var(--text-tertiary)" }}>~{cpm.toFixed(1)} /min across agents</div>
        </div>
      </div>
      <div className="mt-4">
        <div className="flex items-center justify-between mb-1 font-mono" style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
          <span>Actual today: {callsToday} / {cpd.toLocaleString()}</span><span>{p}%</span>
        </div>
        <div className="h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
          <div className="h-full" style={{ width: `${p}%`, background: "linear-gradient(90deg, #22c55e, #34d57a)" }} />
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2" style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
        <span>Assumed avg call:</span>
        <Select value={avgSec} onChange={(e) => setAvgSec(parseInt((e.target as HTMLSelectElement).value))} style={{ padding: "4px 8px", fontSize: 11 }}>
          <option value={30}>0:30</option><option value={60}>1:00</option><option value={90}>1:30</option><option value={120}>2:00</option>
        </Select>
      </div>
    </Card>
  );
}

/* ───────────────────────── CAMPAIGN DETAIL ───────────────────────── */

export function CampaignDetail() {
  const { setPage, payload, toast, openListen } = useDash();
  const { campaigns, reload: reloadAll } = useData();
  const id = payload?.campaignId ?? campaigns[0]?.id;
  const [c, setC] = useState<any>(null);
  const [tab, setTab] = useState("overview");
  const [form, setForm] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => { if (id) api.campaign(id).then((d) => { setC(d); setForm((f: any) => f ?? { name: d.name, callWindowStart: d.callWindowStart, callWindowEnd: d.callWindowEnd, maxRetries: d.maxRetries, retryDelayMin: d.retryDelayMin }); }).catch((e) => toast("error", e.message)); }, [id]);
  useEffect(() => { setC(null); setForm(null); load(); }, [id]);
  useRealtime(`campaign:${id}`, () => load());
  useRealtime("live-calls", () => load());

  if (!id) return <div className="p-6"><Empty>No campaign selected.</Empty></div>;
  if (!c) return <div className="p-6"><Empty>Loading campaign…</Empty></div>;
  const st = c.stats ?? {};
  // the detail endpoint returns the load rows under `loads`
  const campaignLoads: any[] = Array.isArray(c.loads) ? c.loads : [];

  const toggle = async () => {
    setBusy(true);
    try {
      if (c.status === "Active") { await api.pauseCampaign(c.id); toast("info", "Campaign paused"); }
      else { await api.launchCampaign(c.id); toast("success", "Campaign launched"); }
      load(); reloadAll();
    } catch (e: any) { toast("error", e.message); } finally { setBusy(false); }
  };
  const save = async () => {
    try { await api.updateCampaign(c.id, { ...form, maxRetries: Number(form.maxRetries), retryDelayMin: Number(form.retryDelayMin) }); toast("success", "Campaign settings saved"); load(); reloadAll(); }
    catch (e: any) { toast("error", e.message); }
  };

  return (
    <div className="p-6 space-y-5">
      <button onClick={() => setPage("campaigns")} className="basil-btn-ghost" style={{ padding: "4px 8px", fontSize: 11 }}><ArrowLeft size={11} /> Back to campaigns</button>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-serif flex items-center gap-2" style={{ fontSize: 26 }}>{c.name} <Tag kind={c.status === "Active" ? "live" : c.status === "Completed" ? "completed" : c.status === "Paused" ? "ringing" : "neutral"}>{c.status}</Tag></h1>
          <div className="mt-1" style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
            Created {c.created} · {campaignLoads.length} load{campaignLoads.length === 1 ? "" : "s"} · {c.agents.length ? c.agents.join(", ") : "no agents"} · window {c.callWindowStart}–{c.callWindowEnd} ({c.timezone})
            {c.status === "Active" && !c.inWindow && <span style={{ color: "var(--status-ringing)" }}> · outside calling window, will resume automatically</span>}
          </div>
        </div>
        <div className="flex gap-2">
          {c.status !== "Completed" && <button disabled={busy} onClick={toggle} className="basil-btn-ghost" style={{ padding: "6px 10px", fontSize: 11 }}>{c.status === "Active" ? <><Pause size={11} /> Pause</> : <><Play size={11} /> Launch</>}</button>}
          <button onClick={() => api.exportCampaign(c.id).catch((e: any) => toast("error", e.message))} className="basil-btn-ghost" style={{ padding: "6px 10px", fontSize: 11 }}><Download size={11} /> Export</button>
        </div>
      </div>

      <Tabs tabs={[{ id: "overview", label: "Overview" }, { id: "calls", label: "Call Log" }, { id: "monitor", label: "Agent Monitor" }, { id: "settings", label: "Settings" }]} value={tab} onChange={setTab} />

      {tab === "overview" && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Calls made" value={st.calls ?? 0} sublabel={`${c.called}/${c.total} drivers reached`} />
            <StatCard label="Connected" value={st.connected ?? 0} sublabel={`${pct(st.connected, st.calls)}%`} />
            <StatCard label="Transferred / booked" value={`${st.transferred ?? 0} / ${st.booked ?? 0}`} sublabel={`${st.callbacks ?? 0} callbacks`} />
            <StatCard label="Avg duration" value={fmtDur(st.avgDurationSec)} sublabel={`$${(st.cost ?? 0).toFixed(2)} spend`} />
          </div>
          <Card>
            <div className="font-mono uppercase mb-3" style={{ fontSize: 10, letterSpacing: "0.18em", color: "var(--text-tertiary)" }}>Loads in this campaign</div>
            <div className="space-y-2">
              {campaignLoads.length === 0 && <Empty>No loads attached.</Empty>}
              {campaignLoads.map((l: any) => (
                <div key={l.id} className="flex items-center gap-3 p-3 rounded-lg" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)" }}>
                  <span className="font-mono" style={{ fontSize: 12 }}>{l.ref}</span>
                  <span className="flex-1" style={{ fontSize: 13 }}>{l.route}</span>
                  <Tag kind="neutral">{l.type}</Tag>
                  <span className="font-mono" style={{ fontSize: 12, color: "var(--accent)" }}>{l.perMi ? `$${Number(l.perMi).toFixed(2)}/mi` : "—"}</span>
                  <Tag kind={l.status === "booked" ? "booked" : "live"}>{l.status}</Tag>
                </div>
              ))}
            </div>
          </Card>
          <Card>
            <div className="font-mono uppercase mb-3" style={{ fontSize: 10, letterSpacing: "0.18em", color: "var(--text-tertiary)" }}>Conversion funnel</div>
            <FunnelRow label="Calls" count={st.calls ?? 0} of={st.calls ?? 0} />
            <FunnelRow label="Connected" count={st.connected ?? 0} of={st.calls ?? 0} />
            <FunnelRow label="Interested" count={st.interested ?? 0} of={st.calls ?? 0} />
            <FunnelRow label="Booked" count={st.booked ?? 0} of={st.calls ?? 0} />
          </Card>
        </>
      )}
      {tab === "calls" && <CallLogPage embedded campaignId={c.id} />}
      {tab === "monitor" && (
        <div className="space-y-3">
          {(c.monitor ?? []).length === 0 && <Empty>No agents assigned.</Empty>}
          {(c.monitor ?? []).map((a: any) => (
            <Card key={a.id}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {a.live ? <span className="basil-dot-pulse" /> : <span className="inline-block w-2 h-2 rounded-full" style={{ background: "var(--text-tertiary)" }} />}
                  <span style={{ fontSize: 14 }}>{a.name}</span>
                  <Tag kind={a.live ? "live" : "neutral"}>{a.live ? `${a.live.status === "ai_talking" ? "TALKING" : "DIALING"} · ${ago(a.live.startedAt)}` : a.status.toUpperCase()}</Tag>
                </div>
                {a.live && (
                  <button onClick={() => openListen({ agent: a.name, driver: a.live.driver, load: a.live.load, callId: a.live.callId } as any)} className="basil-btn-ghost" style={{ padding: "4px 8px", fontSize: 11 }}>
                    <Headphones size={11} /> Listen in
                  </button>
                )}
              </div>
              {a.live ? (
                <>
                  <div className="mt-2" style={{ fontSize: 12, color: "var(--text-secondary)" }}>Calling: {a.live.driver} ({a.live.phone})</div>
                  <div className="font-mono mt-1" style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{a.live.load ? `Load ${a.live.load} · ${a.live.route}` : "No load"}</div>
                  <Waveform className="mt-3 h-6" />
                </>
              ) : <div className="mt-2" style={{ fontSize: 12, color: "var(--text-tertiary)" }}>Not on a call for this campaign right now.</div>}
            </Card>
          ))}
        </div>
      )}
      {tab === "settings" && form && (
        <Card>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Max retries per driver" hint="Extra attempts after no-answer or callback"><Input type="number" min={0} max={5} value={form.maxRetries} onChange={(e) => setForm({ ...form, maxRetries: e.target.value })} /></Field>
            <Field label="Window start (campaign timezone)"><Input type="time" value={form.callWindowStart} onChange={(e) => setForm({ ...form, callWindowStart: e.target.value })} /></Field>
            <Field label="Window end" hint="Never later than 9 PM driver-local time"><Input type="time" value={form.callWindowEnd} onChange={(e) => setForm({ ...form, callWindowEnd: e.target.value })} /></Field>
            <Field label="Minutes between retries"><Input type="number" min={15} max={1440} value={form.retryDelayMin} onChange={(e) => setForm({ ...form, retryDelayMin: e.target.value })} /></Field>
          </div>
          <div className="mt-4 flex justify-end"><button onClick={save} className="basil-btn-primary" style={{ padding: "6px 14px", fontSize: 12 }}>Save settings</button></div>
        </Card>
      )}
    </div>
  );
}

/* ───────────────────────── CALL LOG ───────────────────────── */

export function CallLogPage({ embedded, campaignId }: { embedded?: boolean; campaignId?: string } = {}) {
  const { agents } = useData();
  const { toast } = useDash();
  const [days, setDays] = useState("1");
  const [agentId, setAgentId] = useState("");
  const [outcome, setOutcome] = useState("all");
  const [rows, setRows] = useState<any[]>([]);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(() => {
    api.calls({ days: campaignId ? undefined : days, agentId: agentId || undefined, outcome, campaignId }).then(setRows).catch(() => setRows([]));
  }, [days, agentId, outcome, campaignId]);
  useEffect(() => { load(); }, [load]);
  const timer = useRef<any>(null);
  useRealtime("live-calls", () => { if (!timer.current) timer.current = setTimeout(() => { timer.current = null; load(); }, 1000); });

  return (
    <div className={embedded ? "space-y-3" : "p-6 space-y-5"}>
      {!embedded && <PageHeader title="Call Log" actions={<button onClick={() => api.exportCalls().catch((e: any) => toast("error", e.message))} className="basil-btn-ghost" style={{ padding: "8px 12px", fontSize: 12 }}><Download size={12} /> Export CSV</button>} />}
      <div className="flex items-center gap-3 flex-wrap">
        {!campaignId && <Select value={days} onChange={(e) => setDays(e.target.value)}><option value="1">Last 24h</option><option value="7">7 days</option><option value="30">30 days</option></Select>}
        <Select value={agentId} onChange={(e) => setAgentId(e.target.value)}><option value="">All agents</option>{agents.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select>
        <Select value={outcome} onChange={(e) => setOutcome(e.target.value)}>
          <option value="all">All outcomes</option>
          {Object.entries(OUTCOME_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        <span className="font-mono" style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{rows.length} calls</span>
      </div>
      <Card padded={false}>
        <table className="w-full">
          <thead><tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
            {["", "Time", "Agent", "Driver", "Load", "Dur", "Outcome"].map((h) => (
              <th key={h} className="px-4 py-3 text-left font-mono uppercase" style={{ fontSize: 10, color: "var(--text-tertiary)", letterSpacing: "0.1em" }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={7}><Empty>No calls match these filters.</Empty></td></tr>}
            {rows.map((c) => {
              const isOpen = open === c.id;
              return (
                <Fragment key={c.id}>
                  <tr className="hover:bg-white/[0.02] cursor-pointer" onClick={() => setOpen(isOpen ? null : c.id)} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                    <td className="px-3 py-3 w-8">{isOpen ? <ChevronDown size={14} color="var(--text-secondary)" /> : <ChevronRight size={14} color="var(--text-secondary)" />}</td>
                    <td className="px-4 py-3 font-mono" style={{ fontSize: 12, color: "var(--text-secondary)" }}>{c.time}</td>
                    <td className="px-4 py-3"><Tag kind="live">{c.agent}</Tag></td>
                    <td className="px-4 py-3" style={{ fontSize: 13 }}>{c.driver}</td>
                    <td className="px-4 py-3 font-mono" style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{c.load}</td>
                    <td className="px-4 py-3 font-mono" style={{ fontSize: 12 }}>{c.dur}</td>
                    <td className="px-4 py-3">{c.status === "live" || c.status === "dialing" || c.status === "ringing" ? <Tag kind="live">{c.status}</Tag> : <OutcomeTag o={c.outcome} />}</td>
                  </tr>
                  {isOpen && <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}><td colSpan={7} style={{ background: "var(--bg-root)" }}><CallDetail id={c.id} onChanged={load} /></td></tr>}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function Transcript({ turns }: { turns: any[] }) {
  if (!turns?.length) return <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>No transcript recorded for this call.</div>;
  return (
    <div className="space-y-1.5 font-mono max-h-72 overflow-y-auto" style={{ fontSize: 12, color: "var(--text-secondary)" }}>
      {turns.map((t, i) => (
        <div key={i}><span style={{ color: "var(--text-tertiary)" }}>{fmtDur(t.t) === "—" ? "0:00" : fmtDur(t.t)} </span><span style={{ color: t.speaker === "DRIVER" ? "var(--text-primary)" : "var(--accent)" }}>{t.speaker}:</span> {t.text}</div>
      ))}
    </div>
  );
}

function CallDetail({ id, onChanged }: { id: string; onChanged?: () => void }) {
  const [d, setD] = useState<any>(null);
  const { toast } = useDash();
  useEffect(() => { api.call(id).then(setD).catch(() => setD({ error: true })); }, [id]);
  if (!d) return <div className="px-6 py-5" style={{ fontSize: 12, color: "var(--text-tertiary)" }}>Loading…</div>;
  return (
    <div className="px-6 py-5 space-y-4">
      <div>
        <div className="font-mono uppercase" style={{ fontSize: 10, letterSpacing: "0.18em", color: "var(--text-tertiary)" }}>AI summary</div>
        <div className="mt-1.5" style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.55 }}>{d.summary || "—"}</div>
      </div>
      {d.driverInfo?.length > 0 && (
        <div>
          <div className="font-mono uppercase" style={{ fontSize: 10, letterSpacing: "0.18em", color: "var(--text-tertiary)" }}>Driver-provided info</div>
          <ul className="mt-1.5 space-y-0.5" style={{ fontSize: 12, color: "var(--text-secondary)" }}>{d.driverInfo.map((x: string, i: number) => <li key={i}>• {x}</li>)}</ul>
        </div>
      )}
      {d.dispatcherNote && (
        <div>
          <div className="font-mono uppercase" style={{ fontSize: 10, letterSpacing: "0.18em", color: "var(--text-tertiary)" }}>Dispatcher note</div>
          <div className="mt-1.5" style={{ fontSize: 12, color: "var(--text-secondary)" }}>{d.dispatcherNote}</div>
        </div>
      )}
      <div>
        <div className="font-mono uppercase mb-1.5" style={{ fontSize: 10, letterSpacing: "0.18em", color: "var(--text-tertiary)" }}>Transcript</div>
        <Transcript turns={d.transcript} />
      </div>
      <div className="flex items-center gap-3" style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
        {d.recordingUrl ? <a href={d.recordingUrl} target="_blank" rel="noreferrer" className="basil-btn-ghost" style={{ padding: "6px 10px", fontSize: 11 }}><Play size={11} /> Play recording</a> : <span>Recording: none (enabled on live calls)</span>}
        <span className="font-mono">cost ${Number(d.cost ?? 0).toFixed(3)}</span>
        <button onClick={async () => { try { await api.flagCall(id); toast("info", "Call flagged for review"); onChanged?.(); } catch (e: any) { toast("error", e.message); } }} className="basil-btn-ghost ml-auto" style={{ padding: "4px 8px", fontSize: 11 }}><Flag size={11} /> {d.sentiment === "flagged" ? "Flagged" : "Flag for review"}</button>
      </div>
    </div>
  );
}

/* ───────────────────────── ANALYTICS ───────────────────────── */

export function AnalyticsPage() {
  const [days, setDays] = useState("7");
  const { data } = useAnalytics(Number(days));
  const f = data?.funnel ?? { dialed: 0, answered: 0, transferred: 0, booked: 0 };
  const outcomes = Object.entries<number>(data?.outcomes ?? {}).sort((a, b) => b[1] - a[1]);
  const total = outcomes.reduce((s, [, n]) => s + n, 0);
  const colors = ["var(--accent)", "var(--status-ringing)", "var(--status-failed)", "var(--status-queued)", "var(--text-tertiary)", "#a78bfa", "#38bdf8"];
  return (
    <div className="p-6 space-y-5">
      <PageHeader title="Analytics" actions={<Tabs tabs={[{ id: "1", label: "24h" }, { id: "7", label: "7D" }, { id: "30", label: "30D" }, { id: "90", label: "90D" }]} value={days} onChange={setDays} />} />
      <Card>
        <div className="font-mono uppercase mb-3" style={{ fontSize: 10, letterSpacing: "0.18em", color: "var(--text-tertiary)" }}>Conversion funnel</div>
        <FunnelRow label="Dialed" count={f.dialed} of={f.dialed} />
        <FunnelRow label="Connected" count={f.answered} of={f.dialed} />
        <FunnelRow label="Transferred" count={f.transferred + f.booked} of={f.dialed} />
        <FunnelRow label="Booked" count={f.booked} of={f.dialed} />
      </Card>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <div className="mb-2" style={{ fontSize: 13 }}>Calls per day</div>
          {(data?.series ?? []).length === 0 ? <Empty>No calls in this period.</Empty> : (
            <div className="space-y-1.5">
              {data.series.map((s: any) => {
                const max = Math.max(...data.series.map((x: any) => x.calls), 1);
                return (
                  <div key={s.date} className="flex items-center gap-3 font-mono" style={{ fontSize: 11 }}>
                    <span style={{ width: 70, color: "var(--text-tertiary)" }}>{new Date(s.date + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
                    <div className="flex-1 h-3 rounded overflow-hidden" style={{ background: "rgba(255,255,255,0.04)" }}><div className="h-full" style={{ width: `${(s.calls / max) * 100}%`, background: "#22c55e" }} /></div>
                    <span style={{ width: 70, textAlign: "right", color: "var(--text-secondary)" }}>{s.calls} · {s.booked}✓</span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
        <Card>
          <div className="mb-1" style={{ fontSize: 13 }}>Best call times (connect rate by hour)</div>
          <HourChart heatmap={data?.heatmap} from={0} to={23} />
        </Card>
      </div>
      <Card padded={false}>
        <div className="px-5 py-3" style={{ borderBottom: "1px solid var(--border-subtle)" }}><span style={{ fontSize: 13 }}>Agent leaderboard</span></div>
        <table className="w-full">
          <thead><tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
            {["#", "Agent", "Calls", "Connected", "Booked", "Connect %", "Cost"].map((h) => <th key={h} className="px-4 py-3 text-left font-mono uppercase" style={{ fontSize: 10, color: "var(--text-tertiary)", letterSpacing: "0.1em" }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {(data?.leaderboard ?? []).length === 0 && <tr><td colSpan={7}><Empty>No agent activity yet.</Empty></td></tr>}
            {(data?.leaderboard ?? []).map((r: any, i: number) => (
              <tr key={r.name} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                <td className="px-4 py-3 font-mono" style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{i + 1}</td>
                <td className="px-4 py-3" style={{ fontSize: 13 }}>{r.name}</td>
                <td className="px-4 py-3 font-mono" style={{ fontSize: 12 }}>{r.calls}</td>
                <td className="px-4 py-3 font-mono" style={{ fontSize: 12 }}>{r.connected}</td>
                <td className="px-4 py-3 font-mono" style={{ fontSize: 12, color: "var(--accent)" }}>{r.booked}</td>
                <td className="px-4 py-3 font-mono" style={{ fontSize: 12 }}>{pct(r.connected, r.calls)}%</td>
                <td className="px-4 py-3 font-mono" style={{ fontSize: 12, color: "var(--text-secondary)" }}>${r.cost.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <div className="mb-2" style={{ fontSize: 13 }}>Cost</div>
          <div className="grid grid-cols-3 gap-3 font-mono" style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            <div><div style={{ fontSize: 10, color: "var(--text-tertiary)" }}>Total spend</div>${(data?.cost?.total ?? 0).toFixed(2)}</div>
            <div><div style={{ fontSize: 10, color: "var(--text-tertiary)" }}>Per call</div>${f.dialed ? ((data?.cost?.total ?? 0) / f.dialed).toFixed(3) : "0.000"}</div>
            <div><div style={{ fontSize: 10, color: "var(--text-tertiary)" }}>Per booking</div>{data?.cost?.perBooked ? `$${data.cost.perBooked.toFixed(2)}` : "—"}</div>
          </div>
          <div className="mt-3" style={{ fontSize: 11, color: "var(--text-tertiary)" }}>Estimated at ~$0.13/min (carrier + AI). Real costs depend on your Telnyx and Gemini usage.</div>
        </Card>
        <Card>
          <div className="mb-2" style={{ fontSize: 13 }}>Outcomes</div>
          {total === 0 ? <Empty>No outcomes yet.</Empty> : (
            <div className="space-y-1.5">
              {outcomes.map(([k, n], i) => (
                <div key={k} className="flex items-center gap-2" style={{ fontSize: 12 }}>
                  <span className="w-2 h-2 rounded-full" style={{ background: colors[i % colors.length] }} />
                  <span style={{ color: "var(--text-secondary)", width: 120 }}>{OUTCOME_LABEL[k] ?? k.replace(/_/g, " ")}</span>
                  <div className="flex-1 h-2 rounded overflow-hidden" style={{ background: "rgba(255,255,255,0.04)" }}><div className="h-full" style={{ width: `${(n / total) * 100}%`, background: colors[i % colors.length] }} /></div>
                  <span className="font-mono" style={{ color: "var(--text-tertiary)", width: 70, textAlign: "right" }}>{n} · {Math.round((n / total) * 100)}%</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

/* ───────────────────────── DISPATCHER QUEUE ───────────────────────── */

export function QueuePage() {
  const { queueWaiting, reload } = useData();
  const { toast } = useDash();
  const [me, setMe] = useState<any>(null);
  const [locked, setLocked] = useState<Record<string, string>>({});
  const [tick, setTick] = useState(0);
  const [transcriptOf, setTranscriptOf] = useState<any>(null);
  const [ending, setEnding] = useState<any>(null);
  const [recent, setRecent] = useState<any[]>([]);

  useEffect(() => { api.dispatcherMe().then(setMe).catch(() => {}); }, []);
  const loadRecent = useCallback(() => { api.queueRecent().then(setRecent).catch(() => {}); }, []);
  useEffect(() => { loadRecent(); }, [loadRecent]);
  useEffect(() => { const i = setInterval(() => setTick((t) => t + 1), 1000); return () => clearInterval(i); }, []);
  useEffect(() => { setTick(0); }, [queueWaiting]);

  const items = queueWaiting.filter((q: any) => q.status === "waiting");
  // My calls survive a page refresh: they come from the server, not local state.
  const mine = queueWaiting.filter((q: any) => q.status !== "waiting" && me && q.lockedById === me.id);

  useRealtime("dispatch-queue", (event, data) => {
    if (event === "locked") setLocked((m) => ({ ...m, [data.id]: data.by }));
    else if (event === "released") setLocked((m) => { const n = { ...m }; delete n[data.id]; return n; });
    else if (event === "enqueued") toast("info", `New transfer: ${data.name}`);
    else if (event === "abandoned") toast("warn", `${data.name} waited too long and was released for a callback`);
    if (["completed", "abandoned"].includes(event)) loadRecent();
  });

  const pickup = async (q: any) => {
    if (locked[q.id]) return;
    try {
      await api.pickup(q.id);
      toast("success", `Connected to ${q.name}`);
      reload();
    } catch (e: any) {
      if (e.status === 409) { setLocked((m) => ({ ...m, [q.id]: "another dispatcher" })); toast("warn", e.message ?? "Already picked up"); }
      else toast("error", e.message ?? "Could not connect");
      reload();
    }
  };

  const urgency = (sec: number) => {
    if (sec > 150) return { border: "var(--status-failed)", badge: "🔴", pulse: true };
    if (sec > 90) return { border: "var(--status-ringing)", badge: "🟡" };
    return { border: "var(--border-subtle)", badge: "" };
  };

  return (
    <div className="p-6 space-y-5">
      <PageHeader title="Dispatcher Queue" subtitle={items.length === 0 ? "All clear — no calls waiting" : `${items.length} driver${items.length === 1 ? "" : "s"} on hold`} actions={
        <div className="font-mono" style={{ fontSize: 11, color: "var(--text-tertiary)" }}>Drivers are released for a callback after 3 min on hold</div>
      } />

      <div className="rounded-xl" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}>
        <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--border-subtle)" }}><span style={{ fontSize: 13 }}>Waiting for pickup</span></div>
        <div className="p-4 space-y-3">
          <AnimatePresence>
            {items.map((q: any) => {
              const wait = q.waitedSec + tick;
              const u = urgency(wait);
              const isLocked = !!locked[q.id];
              return (
                <motion.div key={q.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: isLocked ? 0.5 : 1 }} exit={{ opacity: 0, x: -20 }}
                  className={`rounded-lg p-4 ${u.pulse ? "basil-pulse" : ""}`}
                  style={{ background: "var(--bg-elevated)", border: `1px solid ${u.border}`, borderLeft: `3px solid ${u.border}` }}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Phone size={13} color="var(--text-secondary)" />
                        <span style={{ fontSize: 14 }}>{q.name}</span>
                        {u.badge && <span style={{ fontSize: 11 }}>{u.badge}</span>}
                        <span className="font-mono ml-auto" style={{ fontSize: 11, color: "var(--text-tertiary)" }}>on hold {Math.floor(wait / 60)}m {String(wait % 60).padStart(2, "0")}s</span>
                      </div>
                      <div className="grid grid-cols-2 gap-1.5 mb-2" style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                        <div className="flex items-center gap-1.5"><Phone size={11} color="var(--text-tertiary)" /><span className="font-mono">{q.phone}</span></div>
                        <div className="flex items-center gap-1.5"><Mail size={11} color="var(--text-tertiary)" /><span className="font-mono">{q.email || "—"}</span></div>
                        <div className="flex items-center gap-1.5"><MapPin size={11} color="var(--text-tertiary)" /><span>{q.loc || "—"}</span></div>
                        <div className="flex items-center gap-1.5"><Truck size={11} color="var(--text-tertiary)" /><span>{q.truck} — {q.type}</span></div>
                      </div>
                      <div className="mt-2 px-3 py-2 rounded font-mono" style={{ background: "var(--bg-surface)", fontSize: 11, color: "var(--text-tertiary)" }}>
                        {q.load ? <>Load {q.load.ref} · {q.load.route} · {q.load.rate} · floor {q.load.min}</> : "No load attached"}
                      </div>
                      <div className="mt-2">
                        <div className="font-mono uppercase" style={{ fontSize: 10, letterSpacing: "0.14em", color: "var(--text-tertiary)" }}>What was discussed</div>
                        <div className="mt-1 italic" style={{ fontSize: 12, color: "var(--text-secondary)" }}>"{q.note}"</div>
                      </div>
                      {q.driverInfo?.length > 0 && (
                        <ul className="mt-2 space-y-0.5" style={{ fontSize: 11, color: "var(--text-secondary)" }}>{q.driverInfo.map((d: string, i: number) => <li key={i}>• {d}</li>)}</ul>
                      )}
                      <div className="mt-2 flex items-center gap-3" style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                        <span>Reason: <span style={{ color: "var(--status-ringing)" }}>{(q.transferReason ?? "").replace(/_/g, " ")}</span></span>
                        <button onClick={() => setTranscriptOf(q)} className="basil-btn-ghost" style={{ padding: "4px 8px", fontSize: 11 }}>📜 Transcript</button>
                      </div>
                    </div>
                    <button onClick={() => pickup(q)} disabled={isLocked} className={isLocked ? "basil-btn-ghost" : "basil-btn-primary"} style={{ padding: "10px 16px", fontSize: 12, opacity: isLocked ? 0.7 : 1 }}>
                      {isLocked ? <><Lock size={11} /> {locked[q.id]}…</> : <><Phone size={11} /> Pick Up</>}
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
          {items.length === 0 && (
            <div className="py-10 text-center" style={{ color: "var(--text-tertiary)" }}>
              <Headphones size={28} className="mx-auto mb-3 basil-dot-pulse" />
              <div style={{ fontSize: 14 }}>All clear — no calls waiting</div>
              <div className="mt-1" style={{ fontSize: 12 }}>When Basil transfers a driver to a human, they'll appear here.</div>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-xl" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}>
        <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--border-subtle)" }}><span style={{ fontSize: 13 }}>My active calls</span></div>
        <div className="p-4 space-y-3">
          {mine.length === 0 && <Empty>No active calls. Pick up a waiting driver above.</Empty>}
          {mine.map((a: any) => (
            <div key={a.id} className="rounded-lg p-4" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)" }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2"><span className="basil-dot-pulse" /><span style={{ fontSize: 14 }}>{a.name}</span><Tag kind="live">{a.status === "connected" ? "On call" : "Connecting"}</Tag></div>
                <div className="flex gap-2">
                  <button onClick={() => setTranscriptOf(a)} className="basil-btn-ghost" style={{ padding: "6px 10px", fontSize: 11 }}>📜 Transcript</button>
                  <button onClick={() => setEnding(a)} className="basil-btn-primary" style={{ padding: "6px 10px", fontSize: 11 }}><PhoneOff size={11} /> End & log outcome</button>
                </div>
              </div>
              <div className="mt-2 font-mono" style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{a.phone} · {a.load ? <>{a.load.ref} · {a.load.route} · {a.load.rate} · floor {a.load.min}</> : "No load attached"}</div>
              <div className="mt-2 italic" style={{ fontSize: 12, color: "var(--text-secondary)" }}>"{a.note}"</div>
              <Waveform className="mt-3 h-6" />
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}>
        <div className="px-5 py-3" style={{ borderBottom: "1px solid var(--border-subtle)", fontSize: 12, color: "var(--text-tertiary)" }}>Recently handled</div>
        <div className="p-3 space-y-1">
          {recent.length === 0 && <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>Nothing yet today.</div>}
          {recent.map((r) => (
            <div key={r.id} style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              {r.status === "abandoned" ? "⏱" : r.outcome === "booked" ? "✅" : r.outcome === "callback" ? "🔄" : "•"} {r.name} — {r.status === "abandoned" ? "no one picked up, released for callback" : `${r.by ?? "dispatcher"} · ${OUTCOME_LABEL[r.outcome] ?? r.outcome}`} — {ago(r.completedAt)}
            </div>
          ))}
        </div>
      </div>

      <Modal open={!!transcriptOf} onClose={() => setTranscriptOf(null)} width={620}>
        {transcriptOf && (
          <div className="p-5">
            <div className="flex items-center justify-between mb-3"><h2 className="font-serif" style={{ fontSize: 18 }}>Transcript — {transcriptOf.name}</h2><button onClick={() => setTranscriptOf(null)} className="p-1.5 rounded hover:bg-white/5"><X size={14} color="var(--text-secondary)" /></button></div>
            <Transcript turns={transcriptOf.transcript ?? []} />
          </div>
        )}
      </Modal>
      <EndCallModal item={ending} onClose={() => setEnding(null)} onDone={() => { setEnding(null); reload(); loadRecent(); }} />
    </div>
  );
}

function EndCallModal({ item, onClose, onDone }: { item: any; onClose: () => void; onDone: () => void }) {
  const { toast } = useDash();
  const [outcome, setOutcome] = useState<"booked" | "no_deal" | "callback">("booked");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (item) { setOutcome("booked"); setNote(""); } }, [item]);
  const submit = async () => {
    setSaving(true);
    try { await api.endQueue(item.id, { outcome, note: note || undefined }); toast("success", outcome === "booked" ? `Booked ${item.load?.ref ?? "load"} with ${item.name}` : "Call logged"); onDone(); }
    catch (e: any) { toast("error", e.message); } finally { setSaving(false); }
  };
  return (
    <Modal open={!!item} onClose={onClose} width={480}>
      {item && (
        <div className="p-5 space-y-4">
          <h2 className="font-serif" style={{ fontSize: 18 }}>End call with {item.name}</h2>
          <div className="grid grid-cols-3 gap-2">
            {([["booked", "✅ Booked"], ["callback", "🔄 Call back"], ["no_deal", "❌ No deal"]] as const).map(([k, l]) => (
              <button key={k} onClick={() => setOutcome(k)} className="rounded-lg p-3" style={{ fontSize: 12, background: outcome === k ? "rgba(34,197,94,0.12)" : "var(--bg-surface)", border: `1px solid ${outcome === k ? "var(--accent)" : "var(--border-subtle)"}` }}>{l}</button>
            ))}
          </div>
          {outcome === "booked" && item.load && <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>Load {item.load.ref} will be marked booked to {item.name}.</div>}
          <Field label="Note (optional)"><textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className="px-3 py-2 rounded-md outline-none w-full" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", fontSize: 12, color: "var(--text-primary)" }} placeholder="Agreed $3.05/mi, pickup 6 AM" /></Field>
          <div className="flex justify-end gap-2"><button onClick={onClose} className="basil-btn-ghost">Cancel</button><button onClick={submit} disabled={saving} className="basil-btn-primary">{saving ? "Saving…" : "End call"}</button></div>
        </div>
      )}
    </Modal>
  );
}

/* ───────────────────────── AGENTS ───────────────────────── */

export function AgentsPage() {
  const { agents, reload } = useData();
  const { openAgent, toast } = useDash();
  const [createOpen, setCreateOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const togglePause = async (a: any) => {
    try { a.status === "paused" ? await api.resumeAgent(a.id) : await api.pauseAgent(a.id); toast("success", `${a.name} ${a.status === "paused" ? "resumed" : "paused"}`); reload(); }
    catch (e: any) { toast("error", e.message); }
  };
  const dot = (s: string) => (s === "live" ? "var(--status-live)" : s === "idle" ? "var(--status-ringing)" : "var(--status-completed)");
  return (
    <div className="p-6 space-y-5">
      <PageHeader title="Agent Management" actions={
        <div className="flex gap-2">
          <button onClick={() => setGroupOpen(true)} className="basil-btn-ghost" style={{ padding: "8px 12px", fontSize: 12 }}><Users size={12} /> Create Group</button>
          <button onClick={() => setCreateOpen(true)} className="basil-btn-primary" style={{ padding: "8px 14px", fontSize: 12 }}><Plus size={12} /> Create Agent</button>
        </div>
      } />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {agents.map((a: any) => (
          <Card key={a.id}>
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-block w-2 h-2 rounded-full" style={{ background: dot(a.status) }} />
              <span style={{ fontSize: 15 }}>{a.name}</span>
              <Tag kind={a.status === "live" ? "live" : a.status === "idle" ? "ringing" : "failed"}>{a.status === "live" ? "ON CALL" : a.status.toUpperCase()}</Tag>
            </div>
            <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{a.role || "—"} · {a.voice} · {a.phone ?? "no number"}</div>
            <div className="mt-3 grid grid-cols-2 gap-2 font-mono" style={{ fontSize: 11 }}>
              <div><span style={{ color: "var(--text-tertiary)" }}>Calls today </span>{a.today.calls}</div>
              <div><span style={{ color: "var(--text-tertiary)" }}>Connected </span>{a.today.connected}</div>
              <div><span style={{ color: "var(--text-tertiary)" }}>On call </span>{a.activeCalls}</div>
              <div><span style={{ color: "var(--text-tertiary)" }}>Avg </span>{a.today.avgDur}</div>
            </div>
            <div className="mt-4 flex gap-2 flex-wrap">
              <button onClick={() => openAgent(a.name)} className="basil-btn-ghost" style={{ padding: "4px 8px", fontSize: 11 }}>Open</button>
              <button onClick={() => setEditing(a)} className="basil-btn-ghost" style={{ padding: "4px 8px", fontSize: 11 }}>Edit</button>
              <button onClick={() => togglePause(a)} className="basil-btn-ghost" style={{ padding: "4px 8px", fontSize: 11 }}>{a.status === "paused" ? <><Play size={10} /> Resume</> : <><Pause size={10} /> Pause</>}</button>
            </div>
          </Card>
        ))}
        <button onClick={() => setCreateOpen(true)} className="rounded-xl p-6 flex items-center justify-center hover:bg-white/[0.02]" style={{ border: "1.5px dashed var(--border-medium)", minHeight: 180 }}>
          <div className="text-center" style={{ color: "var(--text-tertiary)" }}><Plus size={20} className="mx-auto mb-2" /><div style={{ fontSize: 13 }}>Create New Agent</div></div>
        </button>
      </div>
      <CreateAgentModal open={createOpen} onClose={() => setCreateOpen(false)} />
      <CreateAgentGroupModal open={groupOpen} onClose={() => setGroupOpen(false)} />
      {editing && <EditAgentModal open={!!editing} onClose={() => setEditing(null)} agent={editing} />}
    </div>
  );
}

function CreateAgentGroupModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { phoneNumbers, reload } = useData();
  const { toast } = useDash();
  const available = phoneNumbers.filter((p: any) => p.status === "Available").length;
  const [f, setF] = useState({ name: "Dallas Cold Callers", description: "Cold calling team for Dallas outbound", count: 3, namingPattern: "Basil-Dallas-{N}", voiceId: "Puck" });
  const [saving, setSaving] = useState(false);
  const enough = available >= f.count;
  const submit = async () => {
    if (!enough) { toast("error", `You need ${f.count} free numbers but only ${available} are available.`); return; }
    setSaving(true);
    try { const r = await api.createAgentGroup({ ...f, count: Number(f.count) }); toast("success", `Created ${r.created} agents in ${f.name}`); reload(); onClose(); }
    catch (e: any) { toast("error", e.message); } finally { setSaving(false); }
  };
  return (
    <Modal open={open} onClose={onClose} width={560}>
      <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--border-subtle)" }}><h2 className="font-serif" style={{ fontSize: 18 }}>Create Agent Group</h2></div>
      <div className="p-5 space-y-3">
        <Field label="Group name"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Description"><Input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Number of agents"><Input type="number" min={2} max={50} value={f.count} onChange={(e) => setF({ ...f, count: Math.max(2, parseInt(e.target.value || "2")) })} /></Field>
          <Field label="Naming pattern" hint="{N} becomes 1, 2, 3…"><Input value={f.namingPattern} onChange={(e) => setF({ ...f, namingPattern: e.target.value })} /></Field>
        </div>
        <Field label="Voice (shared)"><Select value={f.voiceId} onChange={(e) => setF({ ...f, voiceId: e.target.value })}>{["Aoede", "Charon", "Fenrir", "Kore", "Puck", "Zephyr"].map((v) => <option key={v}>{v}</option>)}</Select></Field>
        <div className="rounded p-2" style={{ fontSize: 11, background: enough ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)", color: enough ? "var(--accent)" : "var(--status-failed)" }}>
          {enough ? `✓ ${f.count} of ${available} free numbers will be auto-assigned` : `⚠️ Need ${f.count} numbers, only ${available} free — add ${f.count - available} on the Phone Numbers page`}
        </div>
      </div>
      <div className="px-5 py-3 flex justify-end gap-2" style={{ borderTop: "1px solid var(--border-subtle)" }}>
        <button onClick={onClose} className="basil-btn-ghost">Cancel</button>
        <button onClick={submit} disabled={saving || !enough} className="basil-btn-primary">{saving ? "Creating…" : `Create ${f.count} agents`}</button>
      </div>
    </Modal>
  );
}

/* ───────────────────────── LISTEN-IN ───────────────────────── */

export function ListenModal() {
  const { listenInfo, openListen, toast } = useDash();
  const info: any = listenInfo;
  const [turns, setTurns] = useState<any[]>([]);
  const [call, setCall] = useState<any>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!info?.callId) return;
    setTurns([]); setCall(null);
    api.call(info.callId).then((c) => { setCall(c); if (c.transcript?.length) setTurns(c.transcript); }).catch(() => {});
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [info?.callId]);

  useRealtime("live-calls", (event, data) => {
    if (!info?.callId || data?.callId !== info.callId) return;
    if (event === "transcript") {
      setTurns((ts) => {
        const last = ts.at(-1);
        if (data.append && last && last.speaker === data.speaker) return [...ts.slice(0, -1), { ...last, text: last.text + data.text }];
        return [...ts, { speaker: data.speaker, text: data.text, t: data.t }];
      });
    }
    if (event === "call-update") api.call(info.callId).then((c) => { setCall(c); if (c.transcript?.length) setTurns(c.transcript); }).catch(() => {});
  });

  const ended = call && call.status !== "live" && call.status !== "dialing" && call.status !== "ringing";
  const act = async (fn: () => Promise<any>, msg: string) => { try { await fn(); toast("success", msg); } catch (e: any) { toast("error", e.message); } };

  return (
    <Modal open={!!info} onClose={() => openListen(null)} width={620}>
      {info && (
        <>
          <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
            <div className="flex items-center gap-2">
              {!ended && <span className="basil-dot-pulse" />}
              <span style={{ fontSize: 13 }}>{ended ? "Call ended" : "Listening to"} <span style={{ color: "var(--accent)" }}>{info.agent}</span> · {info.driver}{info.load ? ` · ${info.load}` : ""}</span>
            </div>
            <button onClick={() => openListen(null)} className="p-1.5 rounded hover:bg-white/5"><X size={14} color="var(--text-secondary)" /></button>
          </div>
          <div className="p-5 space-y-4 overflow-y-auto">
            {!info.callId ? <Empty>Open Listen-in from a live call.</Empty> : (
              <>
                <div className="rounded-lg p-4" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}>
                  <Waveform className="h-10" />
                  <div className="mt-2 flex items-center justify-between font-mono" style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                    <span style={{ color: ended ? "var(--text-tertiary)" : "var(--status-failed)" }}>{ended ? <OutcomeTag o={call?.outcome} /> : "🔴 LIVE"}</span>
                    <span>{call?.createdAt ? fmtDur(Math.round((now - new Date(call.createdAt).getTime()) / 1000)) : "0:00"} since dial</span>
                  </div>
                </div>
                <div>
                  <div className="font-mono uppercase mb-2" style={{ fontSize: 10, letterSpacing: "0.18em", color: "var(--text-tertiary)" }}>Live transcript</div>
                  {turns.length === 0 ? <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>Waiting for speech…</div> : <Transcript turns={turns} />}
                </div>
                <div className="flex gap-2">
                  <button disabled={ended} onClick={() => act(() => api.endCall(info.callId), "Call ended")} className="basil-btn-ghost flex-1" style={{ padding: "8px 12px", fontSize: 12, borderColor: "var(--status-failed)", color: "var(--status-failed)", opacity: ended ? 0.4 : 1 }}><PhoneOff size={12} /> End call</button>
                  <button disabled={ended} onClick={() => act(() => api.transferCall(info.callId), "Moved to dispatcher queue")} className="basil-btn-ghost flex-1" style={{ padding: "8px 12px", fontSize: 12, opacity: ended ? 0.4 : 1 }}><ArrowRightLeft size={12} /> Transfer to human</button>
                  <button onClick={() => act(() => api.flagCall(info.callId), "Flagged for review")} className="basil-btn-ghost flex-1" style={{ padding: "8px 12px", fontSize: 12 }}><Flag size={12} /> Flag</button>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </Modal>
  );
}
