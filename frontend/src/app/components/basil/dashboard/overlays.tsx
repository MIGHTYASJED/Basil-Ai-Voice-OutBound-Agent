import { useEffect, useState } from "react";
import { X, Phone, Headphones, FileText, Edit, Pause, Copy, Trash2, Mic, ArrowRightLeft, Flag, Search } from "lucide-react";
import { SlideOver, Modal, useDash, Tag, Field, Input, Select } from "./shared";
import { useData } from "./useData";
import { api } from "../../../lib/api";
import { Waveform } from "../Waveform";

export function AgentDetailPanel() {
  const { openAgentName, openAgent, openListen } = useDash();
  const { agents, reload } = useData();
  const { toast } = useDash();
  const [editingAgent, setEditingAgent] = useState(false);
  const agent = agents.find((a) => a.name === openAgentName);
  const act = async (fn: () => Promise<any>, msg: string) => {
    try { await fn(); toast("success", msg); reload(); openAgent(null); }
    catch (e: any) { toast("error", e.message ?? "Action failed"); }
  };
  return (
    <SlideOver open={!!agent} onClose={() => openAgent(null)} width={460}>
      {agent && (
        <div className="p-6">
          <div className="flex items-start justify-between mb-5">
            <div>
              <div className="flex items-center gap-2">
                <StatusDot kind={agent.status as any} />
                <h2 className="font-serif" style={{ fontSize: 22 }}>{agent.name}</h2>
              </div>
              <div className="mt-1" style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{agent.role}</div>
            </div>
            <button onClick={() => openAgent(null)} className="p-1.5 rounded hover:bg-white/5">
              <X size={16} color="var(--text-secondary)" />
            </button>
          </div>

          <div className="rounded-lg p-4 space-y-1.5" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)" }}>
            <Row label="Voice" value={agent.voice} />
            <Row label="Model" value={agent.model} />
            <Row label="Phone" value={agent.phone} mono />
            <Row label="Max duration" value={agent.maxDuration} />
          </div>

          <SectionLabel>Today's stats</SectionLabel>
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Calls" value={agent.today.calls} />
            <Stat label="Connected" value={agent.today.connected} />
            <Stat label="Booked" value={agent.today.booked} />
            <Stat label="Avg dur" value={agent.today.avgDur} />
          </div>

          {agent.activeCalls > 0 && (
            <div className="mt-4 rounded-lg p-3 flex items-center justify-between" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)" }}>
              <span style={{ fontSize: 13 }}>📞 On a call right now</span>
              <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>Listen in from Mission Control</span>
            </div>
          )}

          <SectionLabel>Recent calls</SectionLabel>
          <AgentRecentCalls agentId={agent.id} />

          <SectionLabel>Actions</SectionLabel>
          <div className="grid grid-cols-2 gap-2">
            <ActionBtn icon={Edit} onClick={() => setEditingAgent(true)}>Edit</ActionBtn>
            <ActionBtn icon={Pause} onClick={() => act(() => agent.status === "paused" ? api.resumeAgent(agent.id) : api.pauseAgent(agent.id), agent.status === "paused" ? "Agent resumed" : "Agent paused")}>{agent.status === "paused" ? "Resume" : "Pause"}</ActionBtn>
            <ActionBtn icon={Copy} onClick={() => act(() => api.duplicateAgent(agent.id), "Agent duplicated")}>Duplicate</ActionBtn>
            <ActionBtn icon={Trash2} danger onClick={() => { if (window.confirm(`Delete ${agent.name}? Its phone number goes back to the pool.`)) act(() => api.deleteAgent(agent.id), "Agent deleted"); }}>Delete</ActionBtn>
          </div>
        </div>
      )}
      {editingAgent && <EditAgentModal open={editingAgent} onClose={() => setEditingAgent(false)} agent={agent} />}
    </SlideOver>
  );
}

export { ListenModal } from "./live";

export function CommandPalette() {
  const { cmdKOpen, setCmdKOpen, setPage } = useDash();
  const [q, setQ] = useState("");
  useEffect(() => { if (!cmdKOpen) setQ(""); }, [cmdKOpen]);

  const actions = [
    { label: "Create new campaign", action: () => setPage("campaigns") },
    { label: "Add new load", action: () => setPage("loads") },
    { label: "Add new driver", action: () => setPage("drivers") },
    { label: "Create new agent", action: () => setPage("agents") },
  ];
  const nav = [
    { label: "Go to Mission Control", action: () => setPage("mission") },
    { label: "Go to Campaigns", action: () => setPage("campaigns") },
    { label: "Go to Dispatcher Queue", action: () => setPage("queue") },
    { label: "Go to Analytics", action: () => setPage("analytics") },
    { label: "Go to Prompt Editor", action: () => setPage("prompt") },
    { label: "Go to Settings", action: () => setPage("settings") },
  ];
  const filt = (l: string) => !q || l.toLowerCase().includes(q.toLowerCase());

  return (
    <Modal open={cmdKOpen} onClose={() => setCmdKOpen(false)} width={560}>
      <div className="px-4 py-3 flex items-center gap-3" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
        <Search size={14} color="var(--text-tertiary)" />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Type a command or search..."
          className="flex-1 bg-transparent outline-none" style={{ fontSize: 14, color: "var(--text-primary)" }} />
        <kbd className="font-mono px-1.5 py-0.5 rounded" style={{ fontSize: 10, color: "var(--text-tertiary)", border: "1px solid var(--border-subtle)" }}>ESC</kbd>
      </div>
      <div className="max-h-[420px] overflow-y-auto p-2">
        <Group title="Quick actions" items={actions.filter((a) => filt(a.label))} close={() => setCmdKOpen(false)} />
        <Group title="Navigation" items={nav.filter((a) => filt(a.label))} close={() => setCmdKOpen(false)} />
      </div>
    </Modal>
  );
}

function Group({ title, items, close }: { title: string; items: { label: string; action: () => void }[]; close: () => void }) {
  if (items.length === 0) return null;
  return (
    <div className="mb-2">
      <div className="px-3 pt-2 pb-1 font-mono uppercase" style={{ fontSize: 10, color: "var(--text-tertiary)", letterSpacing: "0.18em" }}>{title}</div>
      {items.map((it) => (
        <button key={it.label} onClick={() => { it.action(); close(); }}
          className="w-full text-left px-3 py-2 rounded-md hover:bg-white/[0.04]"
          style={{ fontSize: 13, color: "var(--text-secondary)" }}>
          {it.label}
        </button>
      ))}
    </div>
  );
}

export function EditAgentModal({ open, onClose, agent }: { open: boolean; onClose: () => void; agent: any }) {
  const { toast } = useDash();
  const { phoneNumbers, reload } = useData();
  const available = phoneNumbers.filter((n: any) => n.status === "Available" || n.id === agent?.assignedNumberId);

  const [form, setForm] = useState<any>({});
  useEffect(() => {
    if (open && agent) {
      setForm({
        name: agent.name || "", description: agent.description || "", role: agent.role || "Cold Caller",
        voiceId: agent.voiceId || "Zephyr", llmModel: agent.llmModel || "gemini-3.1-flash-live-preview",
        temperature: agent.temperature || 0.7, maxCallDurationSec: agent.maxCallDurationSec || 300,
        numberId: agent.assignedNumberId || "",
      });
    }
  }, [open, agent]);

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!form.name.trim()) { toast("error", "Agent name is required"); return; }
    setSaving(true);
    try {
      await api.editAgent(agent.id, {
        name: form.name, role: form.role, description: form.description,
        voiceId: form.voiceId, llmModel: form.llmModel, temperature: Number(form.temperature),
        maxCallDurationSec: Number(form.maxCallDurationSec), numberId: form.numberId || undefined,
      });
      toast("success", `Agent ${form.name} updated`);
      reload();
      onClose();
    } catch (e: any) {
      toast("error", e.message ?? "Could not update agent");
    } finally {
      setSaving(false);
    }
  };

  if (!agent) return null;

  return (
    <Modal open={open} onClose={onClose} width={500}>
      <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
        <h2 className="font-serif" style={{ fontSize: 18 }}>Edit Agent</h2>
        <button onClick={onClose} className="p-1.5 rounded hover:bg-white/5"><X size={14} color="var(--text-secondary)" /></button>
      </div>
      <div className="p-5 overflow-y-auto space-y-4" style={{ maxHeight: "60vh" }}>
        <Field label="Agent name"><Input value={form.name} onChange={(e) => set("name", e.target.value)} /></Field>
        <Field label="Description"><Input value={form.description} onChange={(e) => set("description", e.target.value)} /></Field>
        <Field label="Agent type">
          <Select value={form.role} onChange={(e) => set("role", e.target.value)}><option>Cold Caller</option><option>Follow-up</option><option>Callback</option><option>Rate negotiation</option></Select>
        </Field>
        <Field label="Assigned phone number">
          <Select value={form.numberId} onChange={(e) => set("numberId", e.target.value)}>
            <option value="">Auto-assign next available</option>
            {available.map((n: any) => <option key={n.id} value={n.id}>{n.number} · {n.area}</option>)}
          </Select>
        </Field>
        <Field label="Voice"><Select value={form.voiceId} onChange={(e) => set("voiceId", e.target.value)}><option>Aoede</option><option>Charon</option><option>Fenrir</option><option>Kore</option><option>Puck</option><option>Zephyr</option></Select></Field>
        <Field label="Temperature" hint={form.temperature}><Input type="range" min="0" max="1" step="0.1" value={form.temperature} onChange={(e) => set("temperature", e.target.value)} /></Field>
        <Field label="Max duration (seconds)"><Input type="number" value={form.maxCallDurationSec} onChange={(e) => set("maxCallDurationSec", e.target.value)} /></Field>
      </div>
      <div className="px-5 py-3 flex justify-end gap-2" style={{ borderTop: "1px solid var(--border-subtle)" }}>
        <button onClick={onClose} className="basil-btn-ghost">Cancel</button>
        <button onClick={submit} className="basil-btn-primary" disabled={saving}>{saving ? "Saving..." : "Save Changes"}</button>
      </div>
    </Modal>
  );
}

export function CreateAgentModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [step, setStep] = useState(0);
  const steps = ["Identity", "Voice", "Model", "Prompt", "Review"];
  const { toast } = useDash();
  const { phoneNumbers, reload } = useData();
  const available = phoneNumbers.filter((n) => n.status === "Available");

  const [form, setForm] = useState<any>({
    name: "", description: "", role: "Cold Caller",
    voiceProvider: "gemini", voiceId: "Zephyr", firstMessage: "Hey, this is Basil, an AI assistant calling from our dispatch team. Got a minute?",
    llmModel: "gemini-3.1-flash-live-preview", temperature: 0.7, maxCallDurationSec: 300,
    numberId: "", promptContent: `You are {AGENT_NAME}, an AI dispatch assistant for {COMPANY_NAME}. You call truck drivers to offer them freight.\n\n## CURRENT LOAD\n{LOAD_DATA}\n\n## CONVERSATION FLOW\n1. Greet {DRIVER_NAME}, say you're an AI assistant from {COMPANY_NAME}, ask if they're running today.\n2. Pitch the load: lane, rate, pickup.\n3. Stay within the rate floor of {MIN_RATE}; transfer to a dispatcher to negotiate or book.`,
  });
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) { setStep(0); setSaving(false); } }, [open]);

  const submit = async () => {
    if (!form.name.trim()) { toast("error", "Agent name is required"); setStep(0); return; }
    setSaving(true);
    try {
      await api.createAgent({
        name: form.name, role: form.role, description: form.description,
        voiceProvider: form.voiceProvider, voiceId: form.voiceId,
        llmModel: form.llmModel, temperature: Number(form.temperature),
        maxCallDurationSec: Number(form.maxCallDurationSec),
        numberId: form.numberId || undefined, promptContent: form.promptContent,
      });
      toast("success", `Agent ${form.name} created and activated`);
      reload();
      onClose();
    } catch (e: any) {
      toast("error", e.message ?? "Could not create agent");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} width={640}>
      <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
        <h2 className="font-serif" style={{ fontSize: 18 }}>Create New Agent</h2>
        <button onClick={onClose} className="p-1.5 rounded hover:bg-white/5"><X size={14} color="var(--text-secondary)" /></button>
      </div>
      <div className="px-5 py-3 flex items-center gap-2" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
        {steps.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <span className="rounded-full flex items-center justify-center font-mono" style={{
              width: 22, height: 22, fontSize: 11,
              background: i <= step ? "rgba(34,197,94,0.15)" : "transparent",
              color: i <= step ? "var(--accent)" : "var(--text-tertiary)",
              border: `1px solid ${i <= step ? "var(--accent)" : "var(--border-subtle)"}`,
            }}>{i + 1}</span>
            <span style={{ fontSize: 12, color: i === step ? "var(--text-primary)" : "var(--text-tertiary)" }}>{s}</span>
            {i < steps.length - 1 && <span style={{ color: "var(--text-tertiary)" }}>·</span>}
          </div>
        ))}
      </div>

      <div className="p-5 overflow-y-auto space-y-4" style={{ minHeight: 320 }}>
        {step === 0 && (
          <>
            <Field label="Agent name"><Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Basil-Reefer" /></Field>
            <Field label="Description"><Input value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="Reefer freight specialist for TX lanes" /></Field>
            <Field label="Agent type">
              <Select value={form.role} onChange={(e) => set("role", e.target.value)}><option>Cold Caller</option><option>Follow-up</option><option>Callback</option><option>Rate negotiation</option></Select>
            </Field>
            <Field label="Assigned phone number" hint={available.length ? `${available.length} available` : "No numbers available — add one on the Phone Numbers page"}>
              <Select value={form.numberId} onChange={(e) => set("numberId", e.target.value)}>
                <option value="">Auto-assign next available</option>
                {available.map((n) => <option key={n.id} value={n.id}>{n.number} · {n.area}</option>)}
              </Select>
            </Field>
          </>
        )}
        {step === 1 && (
          <>
            <Field label="Voice"><Select value={form.voiceId} onChange={(e) => set("voiceId", e.target.value)}><option>Aoede</option><option>Charon</option><option>Fenrir</option><option>Kore</option><option>Puck</option><option>Zephyr</option></Select></Field>
            <Field label="First message"><Input value={form.firstMessage} onChange={(e) => set("firstMessage", e.target.value)} /></Field>
          </>
        )}
        {step === 2 && (
          <>
            <Field label="Voice model" hint="The live model is set workspace-wide via GEMINI_MODEL in backend/.env"><Select value={form.llmModel} onChange={(e) => set("llmModel", e.target.value)}><option value="gemini-3.1-flash-live-preview">Gemini Live (native audio)</option></Select></Field>
            <Field label="Temperature" hint={`${form.temperature} — ${Number(form.temperature) < 0.5 ? "focused" : Number(form.temperature) > 0.8 ? "creative" : "balanced"}`}><Input type="range" min="0" max="1" step="0.1" value={form.temperature} onChange={(e) => set("temperature", e.target.value)} /></Field>
            <Field label="Max duration (seconds)"><Input type="number" value={form.maxCallDurationSec} onChange={(e) => set("maxCallDurationSec", e.target.value)} /></Field>
          </>
        )}
        {step === 3 && (
          <Field label="System prompt" hint="Use {AGENT_NAME}, {LOAD_DATA}, {DRIVER_NAME}, {ORIGIN}, {DESTINATION}, {RATE}, {MIN_RATE} — injected per call.">
            <textarea value={form.promptContent} onChange={(e) => set("promptContent", e.target.value)}
              rows={10}
              className="px-3 py-2 rounded-md outline-none font-mono w-full"
              style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", fontSize: 12, color: "var(--text-primary)" }} />
          </Field>
        )}
        {step === 4 && (
          <div className="space-y-2 font-mono" style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            <Row label="Name" value={form.name || "—"} />
            <Row label="Voice" value={form.voiceId} />
            <Row label="Model" value={`${form.llmModel} · ${form.temperature}`} />
            <Row label="Phone" value={form.numberId ? (available.find((n) => n.id === form.numberId)?.number ?? "selected") : "Auto-assign"} />
            <Row label="Max duration" value={`${form.maxCallDurationSec}s`} />
          </div>
        )}
      </div>

      <div className="px-5 py-3 flex items-center justify-between" style={{ borderTop: "1px solid var(--border-subtle)" }}>
        <button onClick={() => setStep((s) => Math.max(0, s - 1))} className="basil-btn-ghost" style={{ padding: "6px 12px", fontSize: 12, opacity: step === 0 ? 0.4 : 1 }}>← Back</button>
        {step < 4 ? (
          <button onClick={() => setStep((s) => s + 1)} className="basil-btn-primary" style={{ padding: "6px 14px", fontSize: 12 }}>Next →</button>
        ) : (
          <button onClick={submit} disabled={saving} className="basil-btn-primary" style={{ padding: "6px 14px", fontSize: 12 }}>{saving ? "Creating…" : "🟢 Create & Activate"}</button>
        )}
      </div>
    </Modal>
  );
}

function AgentRecentCalls({ agentId }: { agentId: string }) {
  const [rows, setRows] = useState<any[] | null>(null);
  useEffect(() => { api.calls({ agentId }).then((r) => setRows(r.slice(0, 6))).catch(() => setRows([])); }, [agentId]);
  if (!rows) return <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>Loading…</div>;
  if (!rows.length) return <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>No calls yet.</div>;
  const icon = (o: string) => (o === "booked" ? "✅" : o === "transferred" ? "🔀" : o === "callback" ? "🔄" : o === "no_answer" ? "📵" : o === "not_interested" ? "❌" : "📞");
  return (
    <div className="space-y-1.5">
      {rows.map((c) => <RecentRow key={c.id} icon={icon(c.outcome)} name={c.driver} outcome={String(c.outcome).replace(/_/g, " ")} when={c.time} />)}
    </div>
  );
}

/* helpers */
function StatusDot({ kind }: { kind: "live" | "idle" | "offline" }) {
  const map = { live: "var(--status-live)", idle: "var(--status-ringing)", offline: "var(--status-completed)" };
  return <span className="inline-block w-2 h-2 rounded-full" style={{ background: map[kind], boxShadow: kind === "live" ? "0 0 8px var(--accent-glow)" : undefined }} />;
}
function Row({ label, value, mono }: { label: string; value: string | number; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{label}</span>
      <span className={mono ? "font-mono" : ""} style={{ fontSize: 12, color: "var(--text-secondary)" }}>{value}</span>
    </div>
  );
}
function SectionLabel({ children }: { children: any }) {
  return <div className="font-mono uppercase mt-5 mb-2" style={{ fontSize: 10, letterSpacing: "0.18em", color: "var(--text-tertiary)" }}>{children}</div>;
}
function Stat({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded-lg p-3" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)" }}>
      <div style={{ fontSize: 10, color: "var(--text-tertiary)" }}>{label}</div>
      <div className="font-mono mt-0.5" style={{ fontSize: 18 }}>{value}</div>
    </div>
  );
}
function RecentRow({ icon, name, outcome, when }: { icon: string; name: string; outcome: string; when: string }) {
  return (
    <div className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-white/[0.03]" style={{ fontSize: 12 }}>
      <span><span className="mr-2">{icon}</span>{name}</span>
      <span style={{ color: "var(--text-tertiary)" }}>{outcome} · {when}</span>
    </div>
  );
}
function ActionBtn({ icon: Icon, children, danger, onClick }: { icon: any; children: any; danger?: boolean; onClick?: () => void }) {
  return (
    <button onClick={onClick} className="basil-btn-ghost flex items-center gap-2 justify-center" style={{ padding: "8px 12px", fontSize: 12, color: danger ? "var(--status-failed)" : undefined }}>
      <Icon size={12} /> {children}
    </button>
  );
}
function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: "var(--text-tertiary)" }}>{label}</div>
      <div className="font-mono mt-0.5" style={{ fontSize: 13 }}>{value}</div>
    </div>
  );
}
