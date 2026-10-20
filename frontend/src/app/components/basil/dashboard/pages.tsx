import { Fragment, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Plus, Search, Download, Upload, Phone, Headphones, FileText, ChevronRight,
  ChevronDown, Bell, Save, RotateCcw, GitBranch, FlaskConical, Rocket, Lock,
  ArrowLeft, Pause, Play, MoreHorizontal,
} from "lucide-react";
import { Card, FilterChip, PageHeader, Tabs, Tag, useDash, Field, Input, Select, SlideOver, Modal } from "./shared";
import { useData } from "./useData";
import { TestAgentModal } from "./TestAgentModal";
import { api } from "../../../lib/api";
import { useRealtime } from "../../../lib/realtime";
import { Mail, MapPin, Truck, Trash2, Edit3, Users, Radio, AlertTriangle } from "lucide-react";
import { Waveform } from "../Waveform";
import { OutcomeTag } from "./live";
export { MissionControl, CampaignDetail, CallLogPage, AnalyticsPage, QueuePage, AgentsPage } from "./live";

/* =========================================================
   MISSION CONTROL
   ========================================================= */
/* =========================================================
   CAMPAIGNS
   ========================================================= */
export function CampaignsPage() {
  const { agents, campaigns, loads, drivers, reload } = useData();
  const { setPage, setPayload, toast } = useDash();
  const [filter, setFilter] = useState("all");
  const [wizard, setWizard] = useState(false);
  const filtered = campaigns.filter(c => filter === "all" || c.status.toLowerCase() === filter);
  const rowAction = async (e: React.MouseEvent, c: any) => {
    e.stopPropagation();
    try {
      if (c.status === "Calling" || c.status === "Active") { await api.pauseCampaign(c.id); toast("info", `${c.name} paused`); }
      else { await api.launchCampaign(c.id); toast("success", `${c.name} launched`); }
      reload();
    } catch (err: any) { toast("error", err.message ?? "Action failed"); }
  };

  return (
    <div className="p-6 space-y-5">
      <PageHeader title="Campaigns" actions={
        <button onClick={() => setWizard(true)} className="basil-btn-primary" style={{ padding: "8px 14px", fontSize: 12 }}>
          <Plus size={12} /> New Campaign
        </button>
      } />

      <div className="flex items-center gap-2 flex-wrap">
        {["all", "active", "paused", "draft", "completed"].map(f => (
          <FilterChip key={f} active={filter === f} onClick={() => setFilter(f)} count={f === "all" ? campaigns.length : campaigns.filter(c => c.status.toLowerCase() === f).length}>
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </FilterChip>
        ))}
      </div>

      <Card padded={false}>
        <table className="w-full">
          <thead><tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
            {["Name", "Status", "Loads", "Progress", "Conv.", ""].map(h => (
              <th key={h} className="px-4 py-3 text-left font-mono uppercase" style={{ fontSize: 10, color: "var(--text-tertiary)", letterSpacing: "0.1em" }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {filtered.map(c => {
              const pct = Math.round((c.called / Math.max(c.total, 1)) * 100);
              const tag: any = c.status === "Active" ? (c.inWindow ? "live" : "queued") : c.status === "Paused" ? "ringing" : c.status === "Completed" ? "completed" : "neutral";
              return (
                <tr key={c.id} className="hover:bg-white/[0.02] cursor-pointer" onClick={() => { setPage("campaign-detail"); setPayload({ campaignId: c.id }); }} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                  <td className="px-4 py-3" style={{ fontSize: 13 }}>{c.name}</td>
                  <td className="px-4 py-3"><Tag kind={tag}>{c.status === "Active" && !c.inWindow ? "Waiting for window" : c.status}</Tag></td>
                  <td className="px-4 py-3 font-mono" style={{ fontSize: 12, color: "var(--text-secondary)" }}>{c.loads}</td>
                  <td className="px-4 py-3" style={{ width: 200 }}>
                    <div className="h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
                      <div className="h-full" style={{ width: `${pct}%`, background: "linear-gradient(90deg, #22c55e, #34d57a)" }} />
                    </div>
                    <div className="font-mono mt-1" style={{ fontSize: 10, color: "var(--text-tertiary)" }}>{c.called}/{c.total}</div>
                  </td>
                  <td className="px-4 py-3 font-mono" style={{ fontSize: 12 }}>{c.conv}</td>
                  <td className="px-4 py-3">
                    {c.status !== "Completed" && c.status !== "Draft" && (
                      <button onClick={(e) => rowAction(e, c)} className="basil-btn-ghost" style={{ padding: "3px 8px", fontSize: 11 }}>
                        {(c.status === "Calling" || c.status === "Active") ? "Pause" : "Launch"}
                      </button>
                    )}
                    {c.status === "Draft" && <button onClick={(e) => rowAction(e, c)} className="basil-btn-ghost" style={{ padding: "3px 8px", fontSize: 11 }}>Launch</button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      {campaigns.filter(c => c.status === "Completed").map(c => (
        <Card key={c.id}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span style={{ fontSize: 14 }}>{c.name}</span>
              <Tag kind="completed">✅ COMPLETED</Tag>
            </div>
            <span className="font-mono" style={{ fontSize: 11, color: "var(--text-tertiary)" }}>Completed {(c as any).completedAt}</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 font-mono" style={{ fontSize: 12 }}>
            <div><div style={{ fontSize: 10, color: "var(--text-tertiary)" }}>Drivers reached</div>{c.called}/{c.total} ({c.pct}%)</div>
            <div><div style={{ fontSize: 10, color: "var(--text-tertiary)" }}>Connected</div>{c.connected}</div>
            <div><div style={{ fontSize: 10, color: "var(--text-tertiary)" }}>Booked</div><span style={{ color: "var(--accent)" }}>{c.booked}</span></div>
            <div><div style={{ fontSize: 10, color: "var(--text-tertiary)" }}>Conversion</div>{c.conv}</div>
          </div>
          <div className="mt-3 flex gap-2">
            <button onClick={() => api.exportCampaign(c.id).catch((e: any) => toast("error", e.message))} className="basil-btn-ghost" style={{ padding: "4px 10px", fontSize: 11 }}><Download size={11} /> Export Full Report</button>
            <button onClick={async () => { try { await api.duplicateCampaign(c.id); toast("success", `Copied "${c.name}" as a new draft`); reload(); } catch (e: any) { toast("error", e.message); } }} className="basil-btn-ghost" style={{ padding: "4px 10px", fontSize: 11 }}>📋 Duplicate as draft</button>
          </div>
        </Card>
      ))}

      <CampaignWizard open={wizard} onClose={() => setWizard(false)} onLaunch={() => { setWizard(false); reload(); }} />
    </div>
  );
}

function CampaignWizard({ open, onClose, onLaunch }: { open: boolean; onClose: () => void; onLaunch: () => void }) {
  const { agents, loads, drivers, loadGroups } = useData();
  const { toast } = useDash();
  const [step, setStep] = useState(0);
  const steps = ["Loads", "Drivers", "Agents", "Review"];
  const [name, setName] = useState("");
  const [selLoads, setSelLoads] = useState<Set<string>>(new Set());
  const [truckType, setTruckType] = useState("Any");
  const [selAgents, setSelAgents] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<{ count: number; sample: any[] }>({ count: 0, sample: [] });
  const [launching, setLaunching] = useState(false);

  useEffect(() => {
    if (open) {
      setStep(0); setName(""); setLaunching(false);
      setSelLoads(new Set(loads.slice(0, 2).map((l: any) => l.id)));
      setSelAgents(new Set(agents.slice(0, 2).map((a: any) => a.id)));
    }
  }, [open]);

  // Live driver-match preview whenever the truck-type filter changes.
  useEffect(() => {
    if (!open) return;
    api.previewDrivers({ truckType: truckType === "Any" ? undefined : truckType })
      .then(setPreview).catch(() => setPreview({ count: 0, sample: [] }));
  }, [truckType, open]);

  const toggle = (set: Set<string>, id: string, setter: (s: Set<string>) => void) => {
    const n = new Set(set); n.has(id) ? n.delete(id) : n.add(id); setter(n);
  };

  const launch = async (asDraft: boolean) => {
    if (!name.trim()) { toast("error", "Give the campaign a name"); setStep(3); return; }
    if (selLoads.size === 0) { toast("error", "Select at least one load"); setStep(0); return; }
    if (selAgents.size === 0) { toast("error", "Select at least one agent"); setStep(2); return; }
    setLaunching(true);
    try {
      await api.createCampaign({
        name,
        loadIds: [...selLoads],
        agentIds: [...selAgents],
        driverFilter: { truckType: truckType === "Any" ? undefined : truckType },
        launch: !asDraft,
      });
      toast("success", asDraft ? "Campaign saved as draft" : "Campaign launched");
      onLaunch();
    } catch (e: any) {
      toast("error", e.message ?? "Could not create campaign");
    } finally {
      setLaunching(false);
    }
  };

  const estCalls = preview.count * (selLoads.size > 0 ? 1 : 0);

  return (
    <Modal open={open} onClose={onClose} width={680}>
      <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
        <h2 className="font-serif" style={{ fontSize: 18 }}>Create New Campaign</h2>
        <div className="flex items-center gap-2">
          {steps.map((s, i) => (
            <div key={s} className="flex items-center gap-1.5">
              <span className="rounded-full font-mono" style={{
                width: 20, height: 20, fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center",
                background: i <= step ? "rgba(34,197,94,0.15)" : "transparent",
                color: i <= step ? "var(--accent)" : "var(--text-tertiary)",
                border: `1px solid ${i <= step ? "var(--accent)" : "var(--border-subtle)"}`,
              }}>{i + 1}</span>
              <span style={{ fontSize: 11, color: i === step ? "var(--text-primary)" : "var(--text-tertiary)" }}>{s}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="p-5 overflow-y-auto" style={{ minHeight: 320 }}>
        {step === 0 && (
          <div className="space-y-2">
            <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>Which loads should agents pitch on this campaign?</div>
            {/* Bulk-select toolbar */}
            <div className="flex items-center gap-2 flex-wrap pb-1">
              <button
                onClick={() => setSelLoads(new Set(loads.map((l: any) => l.id)))}
                className="basil-btn-ghost"
                style={{ padding: "3px 8px", fontSize: 11 }}
              >
                Select all
              </button>
              <button
                onClick={() => setSelLoads(new Set())}
                className="basil-btn-ghost"
                style={{ padding: "3px 8px", fontSize: 11 }}
              >
                Clear
              </button>
              {loadGroups.length > 0 && (
                <>
                  <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>Groups:</span>
                  {loadGroups.map((g: any) => {
                    const groupLoadIds = loads.filter((l: any) => l.groupId === g.id).map((l: any) => l.id);
                    if (groupLoadIds.length === 0) return null;
                    return (
                      <button
                        key={g.id}
                        onClick={() => setSelLoads(prev => {
                          const next = new Set(prev);
                          groupLoadIds.forEach((id: string) => next.add(id));
                          return next;
                        })}
                        className="basil-btn-ghost"
                        style={{ padding: "3px 8px", fontSize: 11 }}
                      >
                        {g.name} ({groupLoadIds.length})
                      </button>
                    );
                  })}
                </>
              )}
            </div>
            {loads.map((l: any) => (
              <label key={l.id} className="flex items-center gap-3 p-3 rounded-lg cursor-pointer" style={{ background: "var(--bg-surface)", border: `1px solid ${selLoads.has(l.id) ? "var(--accent)" : "var(--border-subtle)"}` }}>
                <input type="checkbox" checked={selLoads.has(l.id)} onChange={() => toggle(selLoads, l.id, setSelLoads)} />
                <span className="font-mono" style={{ fontSize: 12 }}>{l.ref}</span>
                <span className="flex-1" style={{ fontSize: 13 }}>{l.origin} → {l.dest}</span>
                <Tag kind="neutral">{l.type}</Tag>
                <span className="font-mono" style={{ fontSize: 12, color: "var(--accent)" }}>${l.perMi}/mi</span>
              </label>
            ))}
            {loads.length === 0 && <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>No loads yet — add some on the Loads page.</div>}
          </div>
        )}
        {step === 1 && (
          <div className="space-y-3">
            <Field label="Match drivers by truck type">
              <Select value={truckType} onChange={(e) => setTruckType((e.target as HTMLSelectElement).value)}>
                <option>Any</option><option>Dry Van</option><option>Reefer</option><option>Flatbed</option>
              </Select>
            </Field>
            <Card>
              <div className="font-mono uppercase mb-2" style={{ fontSize: 10, letterSpacing: "0.18em", color: "var(--text-tertiary)" }}>Preview · {preview.count} drivers</div>
              {preview.sample.map((d: any, i: number) => <div key={i} style={{ fontSize: 12, color: "var(--text-secondary)" }}>{d.name} · {d.type} · {d.loc}</div>)}
              {preview.count > preview.sample.length && <div className="mt-1" style={{ fontSize: 11, color: "var(--text-tertiary)" }}>...and {preview.count - preview.sample.length} more</div>}
            </Card>
          </div>
        )}
        {step === 2 && (
          <div className="space-y-2">
            <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>Which agents should make the calls?</div>
            {agents.map((a: any) => (
              <label key={a.id} className="flex items-center gap-3 p-3 rounded-lg cursor-pointer" style={{ background: "var(--bg-surface)", border: `1px solid ${selAgents.has(a.id) ? "var(--accent)" : "var(--border-subtle)"}` }}>
                <input type="checkbox" checked={selAgents.has(a.id)} onChange={() => toggle(selAgents, a.id, setSelAgents)} />
                <span style={{ fontSize: 13 }}>{a.name}</span>
                <span className="flex-1" style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{a.role}</span>
                <Tag kind={a.status === "live" ? "live" : a.status === "idle" ? "ringing" : "failed"}>{String(a.status).toUpperCase()}</Tag>
              </label>
            ))}
          </div>
        )}
        {step === 3 && (
          <div className="space-y-2">
            <Field label="Campaign name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Summer Reefer Push" /></Field>
            <Card>
              <div className="space-y-2 font-mono" style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                <div>📦 {selLoads.size} loads · 🚛 {preview.count} drivers · 🤖 {selAgents.size} agents</div>
                <div>⏰ 8:00 AM – 4:00 PM (driver local time)</div>
                <div>🔄 Up to 2 retries / driver, 2hr gap</div>
                <div className="pt-2" style={{ color: "var(--text-tertiary)" }}>~{estCalls} calls · est. ${(estCalls * 0.1).toFixed(2)} – ${(estCalls * 0.15).toFixed(2)}</div>
              </div>
            </Card>
          </div>
        )}
      </div>

      <div className="px-5 py-3 flex items-center justify-between" style={{ borderTop: "1px solid var(--border-subtle)" }}>
        <button onClick={() => step === 0 ? onClose() : setStep(s => s - 1)} className="basil-btn-ghost" style={{ padding: "6px 12px", fontSize: 12 }}>
          {step === 0 ? "Cancel" : "← Back"}
        </button>
        {step < 3 ? (
          <button onClick={() => setStep(s => s + 1)} className="basil-btn-primary" style={{ padding: "6px 14px", fontSize: 12 }}>Next →</button>
        ) : (
          <div className="flex gap-2">
            <button onClick={() => launch(true)} disabled={launching} className="basil-btn-ghost" style={{ padding: "6px 12px", fontSize: 12 }}>Save as draft</button>
            <button onClick={() => launch(false)} disabled={launching} className="basil-btn-primary" style={{ padding: "6px 14px", fontSize: 12 }}>{launching ? "Launching…" : "🚀 Launch"}</button>
          </div>
        )}
      </div>
    </Modal>
  );
}

/* =========================================================
   CAMPAIGN DETAIL
   ========================================================= */
/* =========================================================
   LOADS
   ========================================================= */
export function LoadsPage() {
  const { loads, loadGroups, reload } = useData();
  const { toast } = useDash();
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [filter, setFilter] = useState("all");
  const [view, setView] = useState<"list" | "groups">("list");
  const [tab, setTab] = useState<"my" | "feed">("my");
  const filtered = loads.filter(l => filter === "all" || l.status.toLowerCase() === filter);

  return (
    <div className="p-6 space-y-5">
      <PageHeader title="Loads" actions={
        <>
          <button onClick={() => setImportOpen(true)} className="basil-btn-ghost" style={{ padding: "8px 12px", fontSize: 12 }}>
            <Upload size={12} /> Import CSV
          </button>
          <button onClick={() => setAddOpen(true)} className="basil-btn-primary" style={{ padding: "8px 14px", fontSize: 12 }}>
            <Plus size={12} /> Add Load
          </button>
        </>
      } />

      <div className="flex items-center justify-between flex-wrap gap-3">
        <Tabs tabs={[{ id: "my", label: "My Loads" }, { id: "feed", label: "📡 Live Freight Feed" }]} value={tab} onChange={(v) => setTab(v as any)} />
        {tab === "my" && (
          <Tabs tabs={[{ id: "list", label: "List" }, { id: "groups", label: "Groups" }]} value={view} onChange={(v) => setView(v as any)} />
        )}
      </div>

      {tab === "feed" && <FreightFeed />}

      {tab === "my" && (
      <div className="flex items-center gap-2 flex-wrap">
        {["all", "available", "offered", "booked"].map(f => (
          <FilterChip key={f} active={filter === f} onClick={() => setFilter(f)} count={f === "all" ? loads.length : loads.filter(l => l.status.toLowerCase() === f).length}>
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </FilterChip>
        ))}
      </div>
      )}

      {tab === "my" && view === "list" && (
      <Card padded={false}>
        <table className="w-full">
          <thead><tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
            {["Ref", "Route", "Type", "Pickup", "Rate", "$/mi", "Status", ""].map(h => (
              <th key={h} className="px-4 py-3 text-left font-mono uppercase" style={{ fontSize: 10, color: "var(--text-tertiary)", letterSpacing: "0.1em" }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {filtered.map(l => (
              <tr key={l.ref} className="hover:bg-white/[0.02]" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                <td className="px-4 py-3 font-mono" style={{ fontSize: 12 }}>{l.ref}</td>
                <td className="px-4 py-3" style={{ fontSize: 13 }}>{l.origin} → {l.dest} <span className="font-mono ml-2" style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{l.miles}mi</span></td>
                <td className="px-4 py-3"><Tag kind="neutral">{l.type}</Tag></td>
                <td className="px-4 py-3 font-mono" style={{ fontSize: 12, color: "var(--text-secondary)" }}>{l.pickup}</td>
                <td className="px-4 py-3 font-mono" style={{ fontSize: 12 }}>{l.rate}</td>
                <td className="px-4 py-3 font-mono" style={{ fontSize: 12, color: "var(--accent)" }}>{l.perMi}</td>
                <td className="px-4 py-3"><Tag kind={l.status === "Available" ? "live" : l.status === "Offered" ? "ringing" : "booked"}>{l.status}</Tag></td>
                <td className="px-4 py-3">
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (!window.confirm(`Delete load ${l.ref}? This cannot be undone.`)) return;
                      try { await api.deleteLoad(l.id); toast("success", `Load ${l.ref} deleted`); reload(); }
                      catch (err: any) { toast("error", err.message ?? "Delete failed"); }
                    }}
                    className="basil-btn-ghost"
                    style={{ padding: "3px 8px", fontSize: 11, color: "var(--status-failed)" }}
                  >
                    <Trash2 size={11} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      )}
      {tab === "my" && view === "groups" && <LoadGroupsView toast={toast} />}

      <AddLoadPanel open={addOpen} onClose={() => setAddOpen(false)} onSave={() => { setAddOpen(false); reload(); }} />
      <ImportCsvModal open={importOpen} onClose={() => setImportOpen(false)} onImport={() => { setImportOpen(false); reload(); }} />
    </div>
  );
}

function AddLoadPanel({ open, onClose, onSave }: { open: boolean; onClose: () => void; onSave: () => void }) {
  const { toast } = useDash();
  const { campaigns } = useData();
  const [f, setF] = useState<any>({ reference: "", originCity: "Dallas", originState: "TX", destCity: "Memphis", destState: "TN", truckType: "Dry Van", miles: "340", rateTotal: "969", minRate: "880" });
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  const [saving, setSaving] = useState(false);
  const [campaignId, setCampaignId] = useState("");
  useEffect(() => { if (open) { setSaving(false); setCampaignId(""); } }, [open]);
  const save = async () => {
    const rateTotal = Number(String(f.rateTotal).replace(/[^0-9.]/g, ""));
    const miles = Number(f.miles) || undefined;
    if (!f.originCity || !f.destCity || !rateTotal) { toast("error", "Origin, destination and rate are required"); return; }
    setSaving(true);
    try {
      const newLoad = await api.createLoad({ reference: f.reference || undefined, originCity: f.originCity, originState: f.originState, destCity: f.destCity, destState: f.destState, truckType: f.truckType, miles, rateTotal, minRate: Number(String(f.minRate).replace(/[^0-9.]/g, "")) || undefined });
      if (campaignId && newLoad?.id) {
        try { await api.addLoadToCampaign(campaignId, newLoad.id); }
        catch { /* non-fatal: load is created, just wasn't added to campaign */ }
      }
      toast("success", campaignId ? "Load created and added to campaign" : "Load created"); onSave();
    } catch (e: any) { toast("error", e.message ?? "Could not create load"); }
    finally { setSaving(false); }
  };
  return (
    <SlideOver open={open} onClose={onClose} width={520}>
      <div className="p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-serif" style={{ fontSize: 22 }}>Add New Load</h2>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-white/5">×</button>
        </div>
        <div className="space-y-4">
          <Field label="Reference #" hint="Leave empty to auto-generate"><Input value={f.reference} onChange={(e) => set("reference", e.target.value)} placeholder="#4571" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Origin city"><Input value={f.originCity} onChange={(e) => set("originCity", e.target.value)} /></Field>
            <Field label="Origin state"><Input value={f.originState} onChange={(e) => set("originState", e.target.value)} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Dest city"><Input value={f.destCity} onChange={(e) => set("destCity", e.target.value)} /></Field>
            <Field label="Dest state"><Input value={f.destState} onChange={(e) => set("destState", e.target.value)} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Truck type"><Select value={f.truckType} onChange={(e) => set("truckType", e.target.value)}><option>Dry Van</option><option>Reefer</option><option>Flatbed</option></Select></Field>
            <Field label="Miles"><Input value={f.miles} onChange={(e) => set("miles", e.target.value)} /></Field>
            <Field label="Total rate ($)"><Input value={f.rateTotal} onChange={(e) => set("rateTotal", e.target.value)} /></Field>
            <Field label="Min rate ($)"><Input value={f.minRate} onChange={(e) => set("minRate", e.target.value)} /></Field>
          </div>
          <Field label="Add to campaign" hint="Optional — assigns this load to a campaign immediately">
            <Select value={campaignId} onChange={(e) => setCampaignId((e.target as HTMLSelectElement).value)}>
              <option value="">None</option>
              {campaigns.map((c: any) => (
                <option key={c.id} value={c.id}>{c.name} ({c.status})</option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="basil-btn-ghost" style={{ padding: "8px 14px", fontSize: 12 }}>Cancel</button>
          <button onClick={save} disabled={saving} className="basil-btn-primary" style={{ padding: "8px 14px", fontSize: 12 }}>{saving ? "Saving…" : "Save Load"}</button>
        </div>
      </div>
    </SlideOver>
  );
}

function ImportCsvModal({ open, onClose, onImport }: { open: boolean; onClose: () => void; onImport: () => void }) {
  const { loadGroups } = useData();
  const { toast } = useDash();
  const [csv, setCsv] = useState("");
  const [groupId, setGroupId] = useState("");
  const [newGroup, setNewGroup] = useState("");
  const [busy, setBusy] = useState(false);
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      if (typeof ev.target?.result === 'string') setCsv(ev.target.result);
    };
    reader.readAsText(file);
  };
  const run = async () => {
    if (!csv.trim()) { toast("error", "Paste CSV first"); return; }
    setBusy(true);
    try {
      const r = await api.importLoads({ csv, groupId: groupId || undefined, newGroupName: newGroup || undefined });
      toast("success", `Imported ${r.imported} loads`); setCsv(""); setNewGroup(""); onImport();
    } catch (e: any) { toast("error", e.message ?? "Import failed"); }
    finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} width={620}>
      <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
        <h2 className="font-serif" style={{ fontSize: 18 }}>Import Loads from CSV</h2>
        <button onClick={onClose} className="p-1.5 rounded hover:bg-white/5">×</button>
      </div>
      <div className="p-5 space-y-3">
        <div className="flex items-center justify-between" style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
          <span>Header row recognized columns: ref, origin_city, origin_state, dest_city, dest_state, equipment, rate, miles.</span>
          <label className="cursor-pointer font-medium hover:opacity-80" style={{ color: "var(--accent)" }}>
            Upload File
            <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
          </label>
        </div>
        <textarea value={csv} onChange={(e) => setCsv(e.target.value)} rows={7} className="px-3 py-2 rounded-md outline-none font-mono w-full" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", fontSize: 12, color: "var(--text-primary)" }} placeholder={"ref,origin_city,origin_state,dest_city,dest_state,equipment,rate,miles\n#5001,Dallas,TX,Memphis,TN,Dry Van,969,340"} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Add to group"><Select value={groupId} onChange={(e) => setGroupId(e.target.value)}><option value="">None</option>{loadGroups.map((g: any) => <option key={g.id} value={g.id}>{g.name}</option>)}</Select></Field>
          <Field label="…or new group"><Input value={newGroup} onChange={(e) => setNewGroup(e.target.value)} placeholder="e.g. June Reefer" /></Field>
        </div>
      </div>
      <div className="px-5 py-3 flex justify-end gap-2" style={{ borderTop: "1px solid var(--border-subtle)" }}>
        <button onClick={onClose} className="basil-btn-ghost" style={{ padding: "6px 14px", fontSize: 12 }}>Cancel</button>
        <button onClick={run} disabled={busy} className="basil-btn-primary" style={{ padding: "6px 14px", fontSize: 12 }}>{busy ? "Importing…" : "Import Loads"}</button>
      </div>
    </Modal>
  );
}

/* =========================================================
   DRIVERS
   ========================================================= */
export function DriversPage() {
  const { drivers, reload } = useData();
  const { toast } = useDash();
  const [view, setView] = useState<"table" | "cards">("table");
  const [statusFilter, setStatusFilter] = useState<"active" | "dnc" | "blacklisted">("active");
  const [importOpen, setImportOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [csv, setCsv] = useState("");
  const [add, setAdd] = useState({ name: "", phone: "", truckType: "Dry Van", locationCity: "", locationState: "" });
  const [busy, setBusy] = useState(false);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      if (typeof ev.target?.result === 'string') setCsv(ev.target.result);
    };
    reader.readAsText(file);
  };

  const shown = drivers.filter((d) => (statusFilter === "active" ? d.status === "Active" : statusFilter === "dnc" ? d.status === "DNC" : d.status === "Blacklisted"));
  const count = (s: string) => drivers.filter((d) => d.status === s).length;

  const runImport = async () => {
    if (!csv.trim()) { toast("error", "Paste CSV first"); return; }
    setBusy(true);
    try { const r = await api.importDrivers(csv); toast("success", `Imported ${r.imported} drivers (${r.skipped} skipped)`); setImportOpen(false); setCsv(""); reload(); }
    catch (e: any) { toast("error", e.message ?? "Import failed"); }
    finally { setBusy(false); }
  };
  const runAdd = async () => {
    if (!add.name.trim() || !add.phone.trim()) { toast("error", "Name and phone are required"); return; }
    setBusy(true);
    try { await api.createDriver(add); toast("success", `Driver ${add.name} added`); setAddOpen(false); setAdd({ name: "", phone: "", truckType: "Dry Van", locationCity: "", locationState: "" }); reload(); }
    catch (e: any) { toast("error", e.message ?? "Could not add driver"); }
    finally { setBusy(false); }
  };
  const dnc = async (e: React.MouseEvent, d: any) => {
    e.stopPropagation();
    try { await api.markDnc(d.id); toast("info", `${d.name} marked Do Not Call`); reload(); }
    catch (err: any) { toast("error", err.message ?? "Failed"); }
  };

  return (
    <div className="p-6 space-y-5">
      <PageHeader title={`Drivers (${drivers.length})`} actions={
        <>
          <button onClick={() => setImportOpen(true)} className="basil-btn-ghost" style={{ padding: "8px 12px", fontSize: 12 }}><Upload size={12} /> Import</button>
          <button onClick={() => setAddOpen(true)} className="basil-btn-primary" style={{ padding: "8px 14px", fontSize: 12 }}><Plus size={12} /> Add Driver</button>
        </>
      } />

      <div className="flex items-center gap-2 flex-wrap justify-between">
        <div className="flex items-center gap-2">
          <FilterChip active={statusFilter === "active"} onClick={() => setStatusFilter("active")} count={count("Active")}>Active</FilterChip>
          <FilterChip active={statusFilter === "dnc"} onClick={() => setStatusFilter("dnc")} count={count("DNC")}>Do Not Call</FilterChip>
          <FilterChip active={statusFilter === "blacklisted"} onClick={() => setStatusFilter("blacklisted")} count={count("Blacklisted")}>Blacklisted</FilterChip>
        </div>
        <Tabs tabs={[{ id: "table", label: "Table" }, { id: "cards", label: "Cards" }]} value={view} onChange={(v) => setView(v as any)} />
      </div>

      {view === "table" ? (
        <Card padded={false}>
          <table className="w-full">
            <thead><tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
              {["Driver", "Phone", "Truck", "Location", "Status", "Rating", "Last", ""].map(h => (
                <th key={h} className="px-4 py-3 text-left font-mono uppercase" style={{ fontSize: 10, color: "var(--text-tertiary)", letterSpacing: "0.1em" }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {shown.map(d => (
                <tr key={d.id} className="hover:bg-white/[0.02]" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                  <td className="px-4 py-3" style={{ fontSize: 13 }}>{d.name}</td>
                  <td className="px-4 py-3 font-mono" style={{ fontSize: 12, color: "var(--text-secondary)" }}>{d.phone}</td>
                  <td className="px-4 py-3"><Tag kind="neutral">{d.type}</Tag></td>
                  <td className="px-4 py-3" style={{ fontSize: 12, color: "var(--text-secondary)" }}>{d.loc}</td>
                  <td className="px-4 py-3"><Tag kind={d.status === "Active" ? "live" : "failed"}>{d.status}</Tag></td>
                  <td className="px-4 py-3" style={{ fontSize: 12 }}>{"★".repeat(d.rating)}<span style={{ color: "var(--text-tertiary)" }}>{"☆".repeat(5 - d.rating)}</span></td>
                  <td className="px-4 py-3 font-mono" style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{d.last}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      {d.status === "Active" && <button onClick={(e) => dnc(e, d)} className="basil-btn-ghost" style={{ padding: "3px 8px", fontSize: 11 }}>DNC</button>}
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (!window.confirm(`Delete driver ${d.name}? This cannot be undone.`)) return;
                          try { await api.deleteDriver(d.id); toast("success", `${d.name} deleted`); reload(); }
                          catch (err: any) { toast("error", err.message ?? "Delete failed"); }
                        }}
                        className="basil-btn-ghost"
                        style={{ padding: "3px 8px", fontSize: 11, color: "var(--status-failed)" }}
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {shown.map(d => (
            <Card key={d.id}>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "rgba(34,197,94,0.15)", color: "var(--accent)", fontSize: 11 }}>{d.name.split(" ").map((p: string) => p[0]).join("")}</div>
                <div className="flex-1 min-w-0">
                  <div style={{ fontSize: 13 }}>{d.name}</div>
                  <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{d.loc}</div>
                </div>
              </div>
              <Tag kind="neutral">{d.type}</Tag>
              <div className="mt-2" style={{ fontSize: 11 }}>{"★".repeat(d.rating)}<span style={{ color: "var(--text-tertiary)" }}>{"☆".repeat(5 - d.rating)}</span></div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={importOpen} onClose={() => setImportOpen(false)} width={620}>
        <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--border-subtle)" }}><h2 className="font-serif" style={{ fontSize: 18 }}>Import Drivers from CSV</h2></div>
        <div className="p-5 space-y-3">
          <div className="flex items-start justify-between gap-4" style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
            <span>Paste CSV with a header row. Recognized columns: name, phone, truck_type, city, state, email, mc. Every imported driver starts at <span className="font-mono">status_called = pending</span>.</span>
            <label className="cursor-pointer font-medium hover:opacity-80 flex-shrink-0" style={{ color: "var(--accent)" }}>
              Upload File
              <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
            </label>
          </div>
          <textarea value={csv} onChange={(e) => setCsv(e.target.value)} rows={8} className="px-3 py-2 rounded-md outline-none font-mono w-full" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", fontSize: 12, color: "var(--text-primary)" }} placeholder={"name,phone,truck_type,city,state\nJohn Doe,+14695550100,Dry Van,Dallas,TX"} />
        </div>
        <div className="px-5 py-3 flex justify-end gap-2" style={{ borderTop: "1px solid var(--border-subtle)" }}>
          <button onClick={() => setImportOpen(false)} className="basil-btn-ghost" style={{ padding: "6px 14px", fontSize: 12 }}>Cancel</button>
          <button onClick={runImport} disabled={busy} className="basil-btn-primary" style={{ padding: "6px 14px", fontSize: 12 }}>{busy ? "Importing…" : "Import Drivers"}</button>
        </div>
      </Modal>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} width={520}>
        <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--border-subtle)" }}><h2 className="font-serif" style={{ fontSize: 18 }}>Add Driver</h2></div>
        <div className="p-5 space-y-3">
          <Field label="Name"><Input value={add.name} onChange={(e) => setAdd({ ...add, name: e.target.value })} placeholder="Marcus Johnson" /></Field>
          <Field label="Phone" hint="E.164, e.g. +14695551234"><Input value={add.phone} onChange={(e) => setAdd({ ...add, phone: e.target.value })} placeholder="+1..." /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Truck type"><Select value={add.truckType} onChange={(e) => setAdd({ ...add, truckType: e.target.value })}><option>Dry Van</option><option>Reefer</option><option>Flatbed</option></Select></Field>
            <Field label="State"><Input value={add.locationState} onChange={(e) => setAdd({ ...add, locationState: e.target.value })} placeholder="TX" /></Field>
          </div>
          <Field label="City"><Input value={add.locationCity} onChange={(e) => setAdd({ ...add, locationCity: e.target.value })} placeholder="Dallas" /></Field>
        </div>
        <div className="px-5 py-3 flex justify-end gap-2" style={{ borderTop: "1px solid var(--border-subtle)" }}>
          <button onClick={() => setAddOpen(false)} className="basil-btn-ghost" style={{ padding: "6px 14px", fontSize: 12 }}>Cancel</button>
          <button onClick={runAdd} disabled={busy} className="basil-btn-primary" style={{ padding: "6px 14px", fontSize: 12 }}>{busy ? "Adding…" : "Add Driver"}</button>
        </div>
      </Modal>
    </div>
  );
}

/* =========================================================
   CALL LOG
   ========================================================= */
/* =========================================================
   DISPATCHER QUEUE — with optimistic locking simulation
   ========================================================= */
/* =========================================================
   AGENTS
   ========================================================= */
/* =========================================================
   PROMPT EDITOR
   ========================================================= */
export function PromptEditorPage() {
  const { agents, drivers } = useData();
  const { toast } = useDash();
  const [agentId, setAgentId] = useState<string>("");
  const [code, setCode] = useState(SAMPLE_PROMPT);
  const [versions, setVersions] = useState<any[]>([]);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [deployOpen, setDeployOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const tokens = useMemo(() => Math.round(code.length / 4), [code]);
  const pct = Math.min(100, Math.round((tokens / 2000) * 100));
  const currentAgent = agents.find((a) => a.id === agentId);
  const currentVersion = versions[0]?.version ?? 1;

  // Default to the first agent, then load its prompt history.
  useEffect(() => { if (!agentId && agents.length) setAgentId(agents[0].id); }, [agents]);
  const loadVersions = async (id: string) => {
    try {
      const vs = await api.promptVersions(id);
      setVersions(vs);
      if (vs[0]) setCode(vs[0].content);
    } catch { setVersions([]); }
  };
  useEffect(() => { if (agentId) loadVersions(agentId); }, [agentId]);

  const save = async (deploy: boolean) => {
    if (!agentId) { toast("error", "Select an agent first"); return; }
    setSaving(true);
    try {
      await api.savePrompt(agentId, code, deploy ? "Deployed from editor" : "Saved from editor");
      toast("success", deploy ? `Prompt deployed to ${currentAgent?.name}` : "Prompt saved");
      await loadVersions(agentId);
      if (deploy) setDeployOpen(false);
    } catch (e: any) { toast("error", e.message ?? "Save failed"); }
    finally { setSaving(false); }
  };
  const restore = async (versionId: string) => {
    try { await api.restorePrompt(agentId, versionId); toast("success", "Version restored"); await loadVersions(agentId); setVersionsOpen(false); }
    catch (e: any) { toast("error", e.message ?? "Restore failed"); }
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-serif" style={{ fontSize: 24 }}>System Prompt Editor</h1>
          <div className="mt-1 flex items-center gap-2" style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
            <span>Agent:</span>
            <Select value={agentId} onChange={(e) => setAgentId((e.target as HTMLSelectElement).value)}>
              {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
            <span>Version <span className="font-mono" style={{ color: "var(--accent)" }}>v{currentVersion}</span></span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => save(false)} disabled={saving} className="basil-btn-ghost" style={{ padding: "6px 10px", fontSize: 12 }}><Save size={11} /> Save</button>
          <button onClick={() => agentId && loadVersions(agentId)} className="basil-btn-ghost" style={{ padding: "6px 10px", fontSize: 12 }}><RotateCcw size={11} /> Revert</button>
          <button onClick={() => setVersionsOpen(true)} className="basil-btn-ghost" style={{ padding: "6px 10px", fontSize: 12 }}><GitBranch size={11} /> Versions</button>
          <button onClick={() => setDeployOpen(true)} className="basil-btn-primary" style={{ padding: "6px 10px", fontSize: 12 }}><Rocket size={11} /> Deploy</button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3 rounded-xl overflow-hidden" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}>
          <div className="px-4 py-2 font-mono uppercase" style={{ fontSize: 10, letterSpacing: "0.18em", color: "var(--text-tertiary)", borderBottom: "1px solid var(--border-subtle)" }}>Editor</div>
          <textarea value={code} onChange={(e) => setCode(e.target.value)}
            className="w-full p-4 outline-none font-mono"
            style={{ minHeight: 460, background: "transparent", border: "none", color: "var(--text-primary)", fontSize: 12, lineHeight: 1.55, resize: "vertical" }} />
          <div className="px-4 py-3 flex items-center gap-3" style={{ borderTop: "1px solid var(--border-subtle)" }}>
            <span className="font-mono" style={{ fontSize: 11, color: "var(--text-tertiary)" }}>Tokens {tokens}/2000</span>
            <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
              <div className="h-full" style={{ width: `${pct}%`, background: pct > 90 ? "var(--status-ringing)" : "var(--accent)" }} />
            </div>
            <span className="font-mono" style={{ fontSize: 11, color: "var(--text-tertiary)" }}>Last saved 2 min ago</span>
          </div>
        </div>

        <div className="lg:col-span-2 rounded-xl" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}>
          <div className="px-4 py-2 font-mono uppercase" style={{ fontSize: 10, letterSpacing: "0.18em", color: "var(--text-tertiary)", borderBottom: "1px solid var(--border-subtle)" }}>Live preview · simulated call</div>
          <div className="p-4 space-y-3 max-h-[500px] overflow-y-auto">
            {SIM.map((l, i) => (
              <div key={i}>
                <div className="font-mono" style={{ fontSize: 10, color: "var(--text-tertiary)" }}>{l.who}</div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.55 }}>{l.text}</div>
              </div>
            ))}
            <div className="mt-3 rounded p-3" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)" }}>
              <div className="font-mono uppercase mb-2" style={{ fontSize: 10, letterSpacing: "0.18em", color: "var(--text-tertiary)" }}>Analysis</div>
              <div className="space-y-1" style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                <div>✓ Tone: casual</div>
                <div>✓ Objection handling</div>
                <div>✓ Stayed on script</div>
                <div>✓ Rate quoted</div>
              </div>
            </div>
            <button className="basil-btn-ghost w-full" style={{ padding: "8px 12px", fontSize: 12 }}>🔄 Re-run Simulation</button>
          </div>
        </div>
      </div>

      <VersionsPanel open={versionsOpen} onClose={() => setVersionsOpen(false)} versions={versions} onRestore={restore} />
      <DeployModal open={deployOpen} onClose={() => setDeployOpen(false)} onDeploy={() => save(true)} />
    </div>
  );
}

const SAMPLE_PROMPT = `You are {AGENT_NAME}, a truck dispatch sales representative for {COMPANY_NAME}.
You are calling drivers to offer them freight.

## YOUR IDENTITY
- Name: {AGENT_NAME}
- Role: Dispatch coordinator
- Personality: Confident, direct, slightly casual.
  You talk like a real dispatcher who's been in the game.

## CURRENT LOAD INFORMATION
{LOAD_DATA}

## CONVERSATION FLOW

### PHASE 1: OPENING
- Keep it to ONE sentence.
- Template: "Hey {DRIVER_NAME}, this is {AGENT_NAME} over at {COMPANY_NAME}..."

### PHASE 2: PITCH
- State origin → destination, miles, rate.
- Pickup window.

### PHASE 3: NEGOTIATION
- Never go below {MIN_RATE}.
- If driver counters within 10% of floor, accept.
`;

const SIM = [
  { who: "BASIL", text: "Hey Marcus, this is Basil, an AI assistant for Northfleet Dispatch. Got some solid freight heading out of Dallas — you running today?" },
  { who: "DRIVER", text: "What's the rate?" },
  { who: "BASIL", text: "$2.85 a mile, 340 miles. Pickup tomorrow 6 AM. That work?" },
  { who: "DRIVER", text: "Hmm, a little low." },
  { who: "BASIL", text: "I hear you. What number makes this worth your time?" },
];

function VersionsPanel({ open, onClose, versions, onRestore }: { open: boolean; onClose: () => void; versions: any[]; onRestore: (id: string) => void }) {
  return (
    <SlideOver open={open} onClose={onClose} width={520}>
      <div className="p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-serif" style={{ fontSize: 22 }}>Version History</h2>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-white/5">×</button>
        </div>
        <div className="space-y-2">
          {versions.length === 0 && <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>No saved versions yet.</div>}
          {versions.map((v, i) => (
            <Card key={v.id}>
              <div className="flex items-center justify-between">
                <span className="font-mono" style={{ fontSize: 13 }}>v{v.version} {i === 0 && <Tag kind="live">current</Tag>}</span>
                <span className="font-mono" style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{new Date(v.createdAt).toLocaleString()}</span>
              </div>
              <div className="mt-1" style={{ fontSize: 12, color: "var(--text-secondary)" }}>{v.changeNote}</div>
              <div className="mt-1 font-mono" style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{v.tokenCount} tokens</div>
              {i !== 0 && (
                <div className="mt-2 flex gap-2">
                  <button onClick={() => onRestore(v.id)} className="basil-btn-ghost" style={{ padding: "4px 8px", fontSize: 11 }}>Restore</button>
                </div>
              )}
            </Card>
          ))}
        </div>
      </div>
    </SlideOver>
  );
}

function DeployModal({ open, onClose, onDeploy }: { open: boolean; onClose: () => void; onDeploy: () => void }) {
  const { agents } = useData();
  return (
    <Modal open={open} onClose={onClose} width={560}>
      <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
        <h2 className="font-serif" style={{ fontSize: 18 }}>Deploy Prompt Changes</h2>
      </div>
      <div className="p-5 space-y-3">
        <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>You're deploying prompt changes to:</div>
        {agents.slice(0, 4).map((a, i) => (
          <label key={a.name} className="flex items-center gap-3 p-3 rounded-lg cursor-pointer" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}>
            <input type="checkbox" defaultChecked={i < 2} />
            <span style={{ fontSize: 13 }}>{a.name}</span>
            <span className="flex-1" style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{a.activeCalls > 0 ? `currently in active campaign — ${a.activeCalls} calls` : a.status}</span>
          </label>
        ))}
        <div className="rounded-lg p-3" style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.3)" }}>
          <span style={{ fontSize: 12, color: "var(--status-ringing)" }}>⚠️ Basil-01 has active calls. New prompt applies to NEXT call, not current ones.</span>
        </div>
        <Field label="Version note"><Input defaultValue="Updated rate negotiation logic" /></Field>
      </div>
      <div className="px-5 py-3 flex justify-end gap-2" style={{ borderTop: "1px solid var(--border-subtle)" }}>
        <button onClick={onClose} className="basil-btn-ghost" style={{ padding: "6px 14px", fontSize: 12 }}>Cancel</button>
        <button onClick={onDeploy} className="basil-btn-primary" style={{ padding: "6px 14px", fontSize: 12 }}>Deploy to 2 Agents</button>
      </div>
    </Modal>
  );
}

/* =========================================================
   SETTINGS
   ========================================================= */
function DispatcherConnection() {
  const { toast } = useDash();
  const [me, setMe] = useState<any>(null);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"idle" | "verifying">("idle");

  const load = () => api.dispatcherMe().then((d) => { setMe(d); setPhone(d.phoneNumber ?? ""); }).catch(() => {});
  useEffect(() => { load(); }, []);

  const startVerify = async () => {
    if (!phone.trim()) { toast("error", "Enter a phone number"); return; }
    try { const r = await api.startPhoneVerify(phone.trim()); setStage("verifying"); toast("info", `Verification code sent (dev code: ${r.devCode})`); }
    catch (e: any) { toast("error", e.message ?? "Failed"); }
  };
  const verify = async () => {
    try { await api.verifyPhone(code.trim()); toast("success", "Phone verified — transferred calls will ring here"); setStage("idle"); setCode(""); load(); }
    catch (e: any) { toast("error", e.message ?? "Invalid code"); }
  };
  const toggleWebrtc = async (enabled: boolean) => {
    try { await api.useWebrtc(enabled); toast("success", enabled ? "Browser softphone enabled" : "Browser softphone disabled"); load(); }
    catch (e: any) { toast("error", e.message ?? "Failed"); }
  };
  const setAvail = async (a: "available" | "busy" | "offline") => {
    try { await api.setAvailability(a); toast("success", `You're now ${a}`); load(); }
    catch (e: any) { toast("error", e.message ?? "Failed"); }
  };

  return (
    <>
      <Card>
        <div className="font-mono uppercase mb-3" style={{ fontSize: 10, letterSpacing: "0.18em", color: "var(--text-tertiary)" }}>How transferred calls reach you</div>
        <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6 }}>
          When Basil transfers a live driver to the human queue, the driver leg is parked on hold (max 3 min). When you pick the call up, the system either dials your verified phone and bridges you in, or rings your in-browser softphone over WebRTC.
        </div>
        <div className="mt-3 flex items-center gap-2">
          <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>Availability:</span>
          {(["available", "busy", "offline"] as const).map((a) => (
            <button key={a} onClick={() => setAvail(a)} className={me?.availability === a ? "basil-btn-primary" : "basil-btn-ghost"} style={{ padding: "4px 10px", fontSize: 11 }}>{a}</button>
          ))}
        </div>
      </Card>

      <Card>
        <div className="font-mono uppercase mb-3" style={{ fontSize: 10, letterSpacing: "0.18em", color: "var(--text-tertiary)" }}>Callback phone {me?.phoneVerified && <Tag kind="live">verified</Tag>}</div>
        <div className="flex items-end gap-2">
          <div className="flex-1"><Field label="Your phone number" hint="E.164, e.g. +14695550123"><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1..." /></Field></div>
          <button onClick={startVerify} className="basil-btn-ghost" style={{ padding: "8px 12px", fontSize: 12 }}>Send code</button>
        </div>
        {stage === "verifying" && (
          <div className="mt-3 flex items-end gap-2">
            <div className="flex-1"><Field label="Verification code" hint="dev mode: 123456"><Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" /></Field></div>
            <button onClick={verify} className="basil-btn-primary" style={{ padding: "8px 12px", fontSize: 12 }}>Verify</button>
          </div>
        )}
      </Card>

      <Card>
        <div className="flex items-center justify-between">
          <div>
            <div style={{ fontSize: 13 }}>In-browser softphone (WebRTC)</div>
            <div className="mt-1" style={{ fontSize: 12, color: "var(--text-tertiary)" }}>Take transferred calls right here in the browser instead of on your phone.</div>
          </div>
          <button onClick={() => toggleWebrtc(!me?.useWebrtc)} className={me?.useWebrtc ? "basil-btn-primary" : "basil-btn-ghost"} style={{ padding: "6px 14px", fontSize: 12 }}>
            {me?.useWebrtc ? "Enabled" : "Enable"}
          </button>
        </div>
      </Card>
    </>
  );
}

export function SettingsPage() {
  const { role, setPage, toast } = useDash();
  const isAdmin = role === "admin";
  const [section, setSection] = useState(isAdmin ? "workspace" : "connection");
  const [ws, setWs] = useState<any>(null);
  const [team, setTeam] = useState<any[]>([]);
  const [invite, setInvite] = useState({ name: "", email: "", role: "dispatcher" as "admin" | "dispatcher" });
  const [created, setCreated] = useState<any>(null);
  const loadTeam = () => api.team().then(setTeam).catch(() => {});
  useEffect(() => { api.workspaceStatus().then(setWs).catch(() => {}); if (isAdmin) loadTeam(); }, []);
  const sections = [
    ...(isAdmin ? [{ id: "workspace", label: "Workspace" }] : []),
    { id: "connection", label: "My Connection" },
    ...(isAdmin ? [{ id: "team", label: "Team" }, { id: "integr", label: "Integrations" }, { id: "usage", label: "Usage" }] : []),
  ];
  const Status = ({ ok, label }: { ok: boolean; label: string }) => (
    <div className="flex items-center justify-between py-2" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
      <span style={{ fontSize: 13 }}>{label}</span>
      <Tag kind={ok ? "live" : "neutral"}>{ok ? "Configured" : "Not configured"}</Tag>
    </div>
  );
  const addTeammate = async () => {
    try { const r = await api.addTeammate(invite); setCreated(r); setInvite({ name: "", email: "", role: "dispatcher" }); loadTeam(); }
    catch (e: any) { toast("error", e.message); }
  };
  return (
    <div className="p-6">
      <PageHeader title="Settings" />
      <div className="grid grid-cols-12 gap-6">
        <aside className="col-span-3">
          <div className="space-y-1">
            {sections.map(s => (
              <button key={s.id} onClick={() => setSection(s.id)} className="w-full text-left px-3 py-2 rounded-lg"
                style={{ fontSize: 13, background: section === s.id ? "rgba(34,197,94,0.08)" : "transparent", color: section === s.id ? "var(--text-primary)" : "var(--text-secondary)" }}>
                {s.label}
              </button>
            ))}
            {isAdmin && (
              <div className="pt-3 space-y-1">
                <button onClick={() => setPage("agents")} className="w-full text-left px-3 py-2 rounded-lg" style={{ fontSize: 12, color: "var(--text-tertiary)" }}>Agents →</button>
                <button onClick={() => setPage("phones")} className="w-full text-left px-3 py-2 rounded-lg" style={{ fontSize: 12, color: "var(--text-tertiary)" }}>Phone numbers →</button>
                <button onClick={() => setPage("prompt")} className="w-full text-left px-3 py-2 rounded-lg" style={{ fontSize: 12, color: "var(--text-tertiary)" }}>Prompt editor →</button>
              </div>
            )}
          </div>
        </aside>
        <div className="col-span-9 space-y-4">
          {section === "connection" && <DispatcherConnection />}
          {section === "workspace" && (
            <Card>
              <div className="space-y-2" style={{ fontSize: 13 }}>
                <div className="flex justify-between"><span style={{ color: "var(--text-secondary)" }}>Telephony mode</span><Tag kind={ws?.telephonyMode === "live" ? "live" : "queued"}>{ws?.telephonyMode === "live" ? "Live — real calls" : "Simulation — no real calls"}</Tag></div>
                <div className="flex justify-between"><span style={{ color: "var(--text-secondary)" }}>Calling hours</span><span className="font-mono" style={{ fontSize: 12 }}>{ws?.limits?.callingHours ?? "—"}</span></div>
                <div className="flex justify-between"><span style={{ color: "var(--text-secondary)" }}>Daily cap per number</span><span className="font-mono" style={{ fontSize: 12 }}>{ws?.limits?.numberDailyCallCap ?? "—"} calls</span></div>
                <div className="flex justify-between"><span style={{ color: "var(--text-secondary)" }}>Max hold time before callback</span><span className="font-mono" style={{ fontSize: 12 }}>{ws?.limits ? `${Math.round(ws.limits.maxParkSeconds / 60)} min` : "—"}</span></div>
              </div>
              <div className="mt-4" style={{ fontSize: 11, color: "var(--text-tertiary)" }}>These are set in backend/.env (TELEPHONY_MODE, NUMBER_DAILY_CALL_CAP, MAX_PARK_SECONDS). Per-campaign call windows are edited on each campaign's Settings tab.</div>
            </Card>
          )}
          {section === "integr" && (
            <Card>
              <Status ok={!!ws?.integrations?.gemini?.configured} label={`Gemini Live voice AI${ws?.integrations?.gemini?.model ? ` (${ws.integrations.gemini.model})` : ""}`} />
              <Status ok={!!ws?.integrations?.telnyx?.configured} label="Telnyx (primary carrier)" />
              <Status ok={!!ws?.integrations?.twilio?.configured} label="Twilio (fallback carrier)" />
              <Status ok={!!ws?.integrations?.vapi?.configured} label="Vapi (managed mode)" />
              <Status ok={!!ws?.integrations?.dat?.configured} label="DAT load board" />
              <div className="mt-4 space-y-1 font-mono" style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                <div>Telnyx webhook: {ws?.webhooks?.telnyx}</div>
                <div>Twilio status callback: {ws?.webhooks?.twilio}</div>
                <div>Media stream: {ws?.webhooks?.mediaBridge}</div>
              </div>
              <div className="mt-3" style={{ fontSize: 11, color: "var(--text-tertiary)" }}>API keys live only in backend/.env and are never sent to the browser.</div>
            </Card>
          )}
          {section === "team" && (
            <>
              <Card padded={false}>
                <table className="w-full">
                  <thead><tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                    {["User", "Email", "Role", "Availability", ""].map(h => <th key={h} className="px-4 py-3 text-left font-mono uppercase" style={{ fontSize: 10, color: "var(--text-tertiary)", letterSpacing: "0.1em" }}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {team.map(u => (
                      <tr key={u.id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                        <td className="px-4 py-3" style={{ fontSize: 13 }}>{u.name}</td>
                        <td className="px-4 py-3 font-mono" style={{ fontSize: 12, color: "var(--text-secondary)" }}>{u.email}</td>
                        <td className="px-4 py-3"><Tag kind="neutral">{u.role}</Tag></td>
                        <td className="px-4 py-3">{u.role === "dispatcher" ? <Tag kind={u.availability === "available" ? "live" : "neutral"}>{u.availability ?? "offline"}</Tag> : "—"}</td>
                        <td className="px-4 py-3 text-right">{u.role !== "admin" && <button onClick={async () => { try { await api.removeTeammate(u.id); toast("info", `${u.name} removed`); loadTeam(); } catch (e: any) { toast("error", e.message); } }} className="basil-btn-ghost" style={{ padding: "3px 8px", fontSize: 11 }}>Remove</button>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
              <Card>
                <div className="mb-3" style={{ fontSize: 13 }}>Add a teammate</div>
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Name"><Input value={invite.name} onChange={(e) => setInvite({ ...invite, name: e.target.value })} /></Field>
                  <Field label="Email"><Input value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} /></Field>
                  <Field label="Role"><Select value={invite.role} onChange={(e) => setInvite({ ...invite, role: e.target.value as any })}><option value="dispatcher">Dispatcher</option><option value="admin">Admin</option></Select></Field>
                </div>
                <div className="mt-3 flex justify-end"><button onClick={addTeammate} className="basil-btn-primary" style={{ padding: "6px 14px", fontSize: 12 }}>Create account</button></div>
                {created && <div className="mt-3 rounded p-3 font-mono" style={{ fontSize: 12, background: "rgba(34,197,94,0.08)" }}>Created {created.email}. Temporary password: <b>{created.tempPassword}</b> — share it privately; it won't be shown again.</div>}
              </Card>
            </>
          )}
          {section === "usage" && (
            <Card>
              <div className="grid grid-cols-3 gap-3 font-mono" style={{ fontSize: 13 }}>
                <div><div style={{ fontSize: 10, color: "var(--text-tertiary)" }}>Calls this month</div>{ws?.usageThisMonth?.calls ?? 0}</div>
                <div><div style={{ fontSize: 10, color: "var(--text-tertiary)" }}>Talk minutes</div>{ws?.usageThisMonth?.minutes ?? 0}</div>
                <div><div style={{ fontSize: 10, color: "var(--text-tertiary)" }}>Estimated cost</div>${(ws?.usageThisMonth?.estimatedCostUsd ?? 0).toFixed(2)}</div>
              </div>
              <div className="mt-3" style={{ fontSize: 11, color: "var(--text-tertiary)" }}>Estimate only (~$0.13/min). Your carrier and Gemini dashboards show actual billing.</div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   LOAD GROUPS VIEW
   ========================================================= */
function LoadGroupsView({ toast }: { toast: (k: any, t: string) => void }) {
  const { loads, loadGroups, reload } = useData();
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [adding, setAdding] = useState<any>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const groupsWithUngrouped = [...loadGroups, { id: "_none", name: "Ungrouped" }];
  return (
    <div className="space-y-3">
      {groupsWithUngrouped.map(g => {
        const items = loads.filter(l => (g.id === "_none" ? !l.group : l.group === g.id));
        if (items.length === 0) return null;
        const open = !!expanded[g.id];
        const booked = items.filter(i => i.status === "Booked").length;
        const offered = items.filter(i => i.status === "Offered").length;
        const avail = items.filter(i => i.status === "Available").length;
        return (
          <Card key={g.id} padded={false}>
            <button onClick={() => setExpanded(e => ({ ...e, [g.id]: !open }))} className="w-full px-5 py-3 flex items-center gap-3" style={{ borderBottom: open ? "1px solid var(--border-subtle)" : "none" }}>
              {open ? <ChevronDown size={14} color="var(--text-secondary)" /> : <ChevronRight size={14} color="var(--text-secondary)" />}
              <Users size={14} color="var(--accent)" />
              <span style={{ fontSize: 14 }}>{g.name}</span>
              <span className="font-mono" style={{ fontSize: 11, color: "var(--text-tertiary)" }}>({items.length} loads)</span>
              <span className="ml-auto font-mono" style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                {booked} booked · {offered} offered · {avail} avail
              </span>
            </button>
            {open && (
              <div className="p-3 space-y-2">
                {items.map(l => (
                  <div key={l.ref} className="flex items-center gap-3 p-3 rounded-lg" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)" }}>
                    <span className="font-mono" style={{ fontSize: 12 }}>{l.ref}</span>
                    <span className="flex-1" style={{ fontSize: 13 }}>{l.origin} → {l.dest}</span>
                    <Tag kind="neutral">{l.type}</Tag>
                    <span className="font-mono" style={{ fontSize: 12, color: "var(--accent)" }}>${l.perMi}/mi</span>
                    <Tag kind={l.status === "Available" ? "live" : l.status === "Offered" ? "ringing" : "booked"}>{l.status}</Tag>
                  </div>
                ))}
                {g.id !== "_none" && (
                  <div className="flex gap-2 pt-2">
                    <button onClick={() => setRenaming({ id: g.id, name: g.name })} className="basil-btn-ghost" style={{ padding: "4px 8px", fontSize: 11 }}><Edit3 size={11} /> Rename</button>
                    <button onClick={() => { setAdding(g); setPicked([]); }} className="basil-btn-ghost" style={{ padding: "4px 8px", fontSize: 11 }}><Plus size={11} /> Add Loads</button>
                  </div>
                )}
              </div>
            )}
          </Card>
        );
      })}
      <button onClick={() => setRenaming({ id: "", name: "" })} className="basil-btn-ghost w-full" style={{ padding: "8px", fontSize: 12 }}><Plus size={12} /> Create New Group</button>

      <Modal open={!!renaming} onClose={() => setRenaming(null)} width={420}>
        {renaming && (
          <div className="p-5 space-y-3">
            <h2 className="font-serif" style={{ fontSize: 18 }}>{renaming.id ? "Rename group" : "New load group"}</h2>
            <Field label="Group name"><Input autoFocus value={renaming.name} onChange={(e) => setRenaming({ ...renaming, name: e.target.value })} /></Field>
            <div className="flex justify-end gap-2">
              <button onClick={() => setRenaming(null)} className="basil-btn-ghost">Cancel</button>
              <button onClick={async () => {
                if (!renaming.name.trim()) return;
                try { renaming.id ? await api.renameLoadGroup(renaming.id, renaming.name) : await api.createLoadGroup(renaming.name); toast("success", renaming.id ? "Group renamed" : "Group created"); setRenaming(null); reload(); }
                catch (e: any) { toast("error", e.message); }
              }} className="basil-btn-primary">Save</button>
            </div>
          </div>
        )}
      </Modal>
      <Modal open={!!adding} onClose={() => setAdding(null)} width={520}>
        {adding && (
          <div className="p-5 space-y-3">
            <h2 className="font-serif" style={{ fontSize: 18 }}>Add loads to {adding.name}</h2>
            <div className="space-y-1 max-h-72 overflow-y-auto">
              {loads.filter((l: any) => l.group !== adding.id).map((l: any) => (
                <label key={l.id} className="flex items-center gap-3 p-2 rounded hover:bg-white/[0.03]" style={{ fontSize: 12 }}>
                  <input type="checkbox" checked={picked.includes(l.id)} onChange={() => setPicked((p) => p.includes(l.id) ? p.filter((x) => x !== l.id) : [...p, l.id])} />
                  <span className="font-mono">{l.ref}</span><span className="flex-1">{l.origin} → {l.dest}</span><Tag kind="neutral">{l.type}</Tag>
                </label>
              ))}
              {loads.filter((l: any) => l.group !== adding.id).length === 0 && <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>Every load is already in this group.</div>}
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setAdding(null)} className="basil-btn-ghost">Cancel</button>
              <button disabled={!picked.length} onClick={async () => {
                try { const r = await api.addLoadsToGroup(adding.id, picked); toast("success", `Moved ${r.moved} load${r.moved === 1 ? "" : "s"} into ${adding.name}`); setAdding(null); reload(); }
                catch (e: any) { toast("error", e.message); }
              }} className="basil-btn-primary">Add {picked.length || ""}</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

/* =========================================================
   LIVE FREIGHT FEED (DAT integration)
   ========================================================= */
function FreightFeed() {
  const { loads, freightFeed, reload } = useData();
  const { toast } = useDash();
  const [selected, setSelected] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const toggle = (id: string) => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  const [typeFilter, setTypeFilter] = useState("");
  const [minRate, setMinRate] = useState("");
  const shown = freightFeed.filter((f: any) => (!typeFilter || f.type === typeFilter) && (!minRate || Number(String(f.rate).replace(/[^0-9.]/g, "")) >= Number(minRate)));
  const doImport = async () => {
    if (!selected.length) { toast("error", "Select at least one load"); return; }
    setImporting(true);
    try { const r = await api.importDatLoads({ ids: selected }); toast("success", `Imported ${r.imported} loads into My Loads`); setSelected([]); reload(); }
    catch (e: any) { toast("error", e.message ?? "Import failed"); }
    finally { setImporting(false); }
  };
  const download = () => {
    const header = "origin,dest,type,rate_per_mi,miles,broker,broker_phone,broker_credit\n";
    const rows = freightFeed.map((f: any) => `${f.origin},${f.dest},${f.type},${f.rate},${f.miles},${f.broker},${f.brokerPhone},${f.brokerCredit}`).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "freight-feed.csv"; a.click();
    URL.revokeObjectURL(url);
    toast("success", "Downloaded freight-feed.csv");
  };
  return (
    <Card>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Radio size={14} color="var(--accent)" />
          <span style={{ fontSize: 13 }}>Load board feed</span>
          <Tag kind="queued">Sample data</Tag>
        </div>
        <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>Set DAT_API_KEY in backend/.env to pull live market loads</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-3">
        <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={{ padding: "6px", fontSize: 12 }}><option value="">Type: All</option><option>Dry Van</option><option>Reefer</option><option>Flatbed</option></Select>
        <Input value={minRate} onChange={(e) => setMinRate(e.target.value)} placeholder="Min $/mi e.g. 2.50" style={{ padding: "6px", fontSize: 12 }} />
      </div>
      <Card padded={false}>
        <table className="w-full">
          <thead><tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
            {["", "Origin → Dest", "Type", "$/mi", "Miles", "Broker"].map(h => (
              <th key={h} className="px-4 py-3 text-left font-mono uppercase" style={{ fontSize: 10, color: "var(--text-tertiary)", letterSpacing: "0.1em" }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {shown.map((f: any) => (
              <tr key={f.id} className="hover:bg-white/[0.02]" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                <td className="px-4 py-3"><input type="checkbox" checked={selected.includes(f.id)} onChange={() => toggle(f.id)} /></td>
                <td className="px-4 py-3" style={{ fontSize: 13 }}>{f.origin} → {f.dest}</td>
                <td className="px-4 py-3"><Tag kind="neutral">{f.type}</Tag></td>
                <td className="px-4 py-3 font-mono" style={{ fontSize: 12, color: "var(--accent)" }}>{f.rate}</td>
                <td className="px-4 py-3 font-mono" style={{ fontSize: 12, color: "var(--text-secondary)" }}>{f.miles}</td>
                <td className="px-4 py-3" style={{ fontSize: 12 }}>
                  <span title={`${f.broker} · ${f.brokerPhone} · Credit ${f.brokerCredit}/100`} style={{ color: "var(--text-secondary)", borderBottom: "1px dotted var(--text-tertiary)", cursor: "help" }}>{f.broker}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <div className="mt-3 flex items-center justify-between flex-wrap gap-2">
        <span className="font-mono" style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{selected.length} selected · {shown.length} of {freightFeed.length} shown</span>
        <div className="flex gap-2">
          <button onClick={download} className="basil-btn-ghost" style={{ padding: "6px 10px", fontSize: 11 }}><Download size={11} /> Download CSV</button>
          <button onClick={doImport} disabled={importing} className="basil-btn-primary" style={{ padding: "6px 12px", fontSize: 11 }}>📦 Import {selected.length} to My Loads</button>
        </div>
      </div>
    </Card>
  );
}

/* =========================================================
   PHONE NUMBERS
   ========================================================= */
export function PhoneNumbersPage() {
  const { agents, phoneNumbers: phoneNumbersData, reload } = useData();
  const { toast } = useDash();
  const [filter, setFilter] = useState<"all" | "Available" | "Assigned" | "Disabled">("all");
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ e164: "", label: "", provider: "telnyx", areaCode: "469 — Dallas" });
  const [bulk, setBulk] = useState("");
  const [mode, setMode] = useState<"single" | "bulk">("single");
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const addNumbers = async () => {
    let toAdd: { e164: string; label?: string; provider?: string; areaCode?: string }[] = [];
    if (mode === "single") {
      if (!form.e164.trim()) { toast("error", "Enter a phone number"); return; }
      toAdd = [{ e164: form.e164.trim(), label: form.label || undefined, provider: form.provider, areaCode: form.areaCode }];
    } else {
      toAdd = bulk.split(/[\n,]/).map((s) => s.trim()).filter(Boolean).map((e164) => ({ e164, provider: form.provider }));
      if (!toAdd.length) { toast("error", "Paste at least one number"); return; }
    }
    setSaving(true);
    try {
      const res = await api.addNumbers(toAdd);
      toast("success", `Added ${res.created} number${res.created === 1 ? "" : "s"}`);
      setAddOpen(false); setForm({ e164: "", label: "", provider: "telnyx", areaCode: "469 — Dallas" }); setBulk("");
      reload();
    } catch (e: any) { toast("error", e.message ?? "Could not add"); }
    finally { setSaving(false); }
  };

  const del = async (p: any) => {
    try { await api.deleteNumber(p.id); toast("success", `Number ${p.number} deleted`); reload(); }
    catch (e: any) { toast("warn", e.message ?? "Could not delete"); }
  };
  const toggleDisabled = async (p: any) => {
    try { await api.updateNumber(p.id, { disabled: p.status !== "Disabled" }); toast("success", p.status === "Disabled" ? "Number re-enabled" : "Number disabled"); reload(); }
    catch (e: any) { toast("warn", e.message ?? "Could not update"); }
  };

  const filtered = phoneNumbersData.filter(p => filter === "all" || p.status === filter);
  const activeAgents = agents.filter(a => a.status !== "offline").length;
  const totalNumbers = phoneNumbersData.length;
  const available = phoneNumbersData.filter(p => p.status === "Available").length;
  const assigned = phoneNumbersData.filter(p => p.status === "Assigned").length;
  const disabled = phoneNumbersData.filter(p => p.status === "Disabled").length;
  const buffer = available;
  const lowPool = totalNumbers <= activeAgents;

  return (
    <div className="p-6 space-y-5">
      <PageHeader title={`Phone Numbers (${totalNumbers})`} actions={
        <>
          <button onClick={() => { setMode("bulk"); setAddOpen(true); }} className="basil-btn-ghost" style={{ padding: "8px 12px", fontSize: 12 }}><Upload size={12} /> Bulk import</button>
          <button onClick={() => setAddOpen(true)} className="basil-btn-primary" style={{ padding: "8px 14px", fontSize: 12 }}><Plus size={12} /> Add</button>
        </>
      } />

      <div className="flex items-center gap-2 flex-wrap">
        {(["all", "Available", "Assigned", "Disabled"] as const).map(f => (
          <FilterChip key={f} active={filter === f} onClick={() => setFilter(f)} count={f === "all" ? totalNumbers : phoneNumbersData.filter(p => p.status === f).length}>
            {f}
          </FilterChip>
        ))}
      </div>

      {lowPool && (
        <Card>
          <div className="flex items-start gap-3">
            <AlertTriangle size={16} color="var(--status-ringing)" />
            <div className="flex-1">
              <div style={{ fontSize: 13, color: "var(--status-ringing)" }}>Pool is low</div>
              <div className="mt-1" style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                You have {totalNumbers} phone numbers and {activeAgents} active agents. Add more numbers to ensure every agent has a unique caller ID. Phone numbers must always exceed your agent count.
              </div>
            </div>
            <button onClick={() => setAddOpen(true)} className="basil-btn-primary" style={{ padding: "6px 12px", fontSize: 11 }}><Plus size={11} /> Add Numbers</button>
          </div>
        </Card>
      )}

      <Card padded={false}>
        <table className="w-full">
          <thead><tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
            {["Number", "Label", "Provider", "Area", "Status", "Assigned To", ""].map(h => (
              <th key={h} className="px-4 py-3 text-left font-mono uppercase" style={{ fontSize: 10, color: "var(--text-tertiary)", letterSpacing: "0.1em" }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {filtered.map(p => (
              <tr key={p.id} className="hover:bg-white/[0.02]" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                <td className="px-4 py-3 font-mono" style={{ fontSize: 12 }}>{p.number}</td>
                <td className="px-4 py-3" style={{ fontSize: 13 }}>{p.label}</td>
                <td className="px-4 py-3" style={{ fontSize: 12, color: "var(--text-secondary)" }}>{p.provider}</td>
                <td className="px-4 py-3 font-mono" style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{p.area}</td>
                <td className="px-4 py-3"><Tag kind={p.status === "Assigned" ? "live" : p.status === "Available" ? "neutral" : "failed"}>{p.status}</Tag></td>
                <td className="px-4 py-3 font-mono" style={{ fontSize: 12, color: p.assignedTo ? "var(--accent)" : "var(--text-tertiary)" }}>{p.assignedTo || "—"}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-1">
                    <button onClick={() => toggleDisabled(p)} className="p-1.5 rounded hover:bg-white/5" title={p.status === "Disabled" ? "Enable" : "Disable"}><Edit3 size={12} color="var(--text-secondary)" /></button>
                    <button onClick={() => del(p)} className="p-1.5 rounded hover:bg-white/5" title="Delete"><Trash2 size={12} color="var(--status-failed)" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card>
        <div className="font-mono uppercase mb-3" style={{ fontSize: 10, letterSpacing: "0.18em", color: "var(--text-tertiary)" }}>Pool health</div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-3 font-mono" style={{ fontSize: 12 }}>
          <div><div style={{ fontSize: 10, color: "var(--text-tertiary)" }}>Total</div>{totalNumbers}</div>
          <div><div style={{ fontSize: 10, color: "var(--text-tertiary)" }}>Assigned</div>{assigned}</div>
          <div><div style={{ fontSize: 10, color: "var(--text-tertiary)" }}>Available</div><span style={{ color: "var(--accent)" }}>{available}</span></div>
          <div><div style={{ fontSize: 10, color: "var(--text-tertiary)" }}>Disabled</div>{disabled}</div>
          <div><div style={{ fontSize: 10, color: "var(--text-tertiary)" }}>Active agents</div>{activeAgents}</div>
        </div>
        <div style={{ fontSize: 12, color: lowPool ? "var(--status-failed)" : "var(--accent)" }}>
          {lowPool ? "⚠️ Low pool — add more numbers" : `✅ Healthy · buffer of ${buffer} available numbers`}
        </div>
      </Card>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} width={520}>
        <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
          <h2 className="font-serif" style={{ fontSize: 18 }}>Add Phone Number</h2>
        </div>
        <div className="p-5 space-y-3">
          <div className="flex gap-3">
            <label className="flex items-center gap-2" style={{ fontSize: 12 }}><input type="radio" name="mode" checked={mode === "single"} onChange={() => setMode("single")} /> Single</label>
            <label className="flex items-center gap-2" style={{ fontSize: 12 }}><input type="radio" name="mode" checked={mode === "bulk"} onChange={() => setMode("bulk")} /> Import multiple (paste)</label>
          </div>
          {mode === "single" ? (
            <>
              <Field label="Phone Number" hint="E.164 format, e.g. +14695551234"><Input value={form.e164} onChange={(e) => set("e164", e.target.value)} placeholder="+1 (___) ___-____" /></Field>
              <Field label="Label" hint="optional friendly name"><Input value={form.label} onChange={(e) => set("label", e.target.value)} placeholder="Reception Line" /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Provider"><Select value={form.provider} onChange={(e) => set("provider", e.target.value)}><option value="telnyx">Telnyx</option><option value="twilio">Twilio</option><option value="vapi">Vapi</option></Select></Field>
                <Field label="Area Code Pref"><Select value={form.areaCode} onChange={(e) => set("areaCode", e.target.value)}><option>469 — Dallas</option><option>713 — Houston</option><option>512 — Austin</option></Select></Field>
              </div>
            </>
          ) : (
            <Field label="Paste numbers" hint="one per line or comma-separated, E.164">
              <textarea value={bulk} onChange={(e) => setBulk(e.target.value)} rows={6} className="px-3 py-2 rounded-md outline-none font-mono w-full" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", fontSize: 12, color: "var(--text-primary)" }} placeholder="+14695550001&#10;+14695550002" />
            </Field>
          )}
        </div>
        <div className="px-5 py-3 flex justify-end gap-2" style={{ borderTop: "1px solid var(--border-subtle)" }}>
          <button onClick={() => setAddOpen(false)} className="basil-btn-ghost" style={{ padding: "6px 14px", fontSize: 12 }}>Cancel</button>
          <button onClick={addNumbers} disabled={saving} className="basil-btn-primary" style={{ padding: "6px 14px", fontSize: 12 }}>{saving ? "Adding…" : "Add Number"}</button>
        </div>
      </Modal>
    </div>
  );
}

