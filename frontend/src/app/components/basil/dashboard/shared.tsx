import { ReactNode, createContext, useContext, useState, useCallback, useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { X, CheckCircle2, AlertTriangle, Info, XCircle } from "lucide-react";

export type PageKey =
  | "mission" | "campaigns" | "campaign-detail" | "loads" | "drivers"
  | "calls" | "analytics" | "phones" | "queue" | "agents" | "prompt" | "settings";

export type Role = "admin" | "dispatcher";

type Toast = { id: number; kind: "success" | "error" | "warn" | "info"; text: string };
type Ctx = {
  page: PageKey;
  setPage: (p: PageKey) => void;
  payload: any;
  setPayload: (p: any) => void;
  role: Role;
  openAgent: (name: string | null) => void;
  openAgentName: string | null;
  openListen: (info: { agent: string; driver: string; load?: string } | null) => void;
  listenInfo: { agent: string; driver: string; load?: string } | null;
  openCmdK: () => void;
  cmdKOpen: boolean;
  setCmdKOpen: (v: boolean) => void;
  toast: (kind: Toast["kind"], text: string) => void;
  toasts: Toast[];
  dismissToast: (id: number) => void;
};
const DashCtx = createContext<Ctx | null>(null);
export function useDash() {
  const c = useContext(DashCtx);
  if (!c) throw new Error("useDash outside provider");
  return c;
}

export function DashProvider({ children, role = "admin" }: { children: ReactNode; role?: Role }) {
  const [page, setPage] = useState<PageKey>("mission");
  const [payload, setPayload] = useState<any>(null);
  const [openAgentName, setOpenAgent] = useState<string | null>(null);
  const [listenInfo, setListenInfo] = useState<Ctx["listenInfo"]>(null);
  const [cmdKOpen, setCmdKOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((kind: Toast["kind"], text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, text }]);
    if (kind !== "error") setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000);
  }, []);
  const dismissToast = (id: number) => setToasts((t) => t.filter((x) => x.id !== id));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdKOpen((v) => !v);
      } else if (e.key === "Escape") {
        setCmdKOpen(false);
        setOpenAgent(null);
        setListenInfo(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <DashCtx.Provider value={{
      page, setPage: (p) => { setPage(p); setPayload(null); },
      payload, setPayload,
      role,
      openAgent: setOpenAgent, openAgentName,
      openListen: setListenInfo, listenInfo,
      openCmdK: () => setCmdKOpen(true), cmdKOpen, setCmdKOpen,
      toast, toasts, dismissToast,
    }}>
      {children}
      <ToastStack />
    </DashCtx.Provider>
  );
}

function ToastStack() {
  const { toasts, dismissToast } = useDash();
  const map: Record<Toast["kind"], { Icon: any; color: string }> = {
    success: { Icon: CheckCircle2, color: "var(--accent)" },
    error: { Icon: XCircle, color: "var(--status-failed)" },
    warn: { Icon: AlertTriangle, color: "var(--status-ringing)" },
    info: { Icon: Info, color: "var(--status-queued)" },
  };
  return (
    <div className="fixed top-4 right-4 z-[200] flex flex-col gap-2 max-w-sm">
      <AnimatePresence initial={false}>
        {toasts.map((t) => {
          const { Icon, color } = map[t.kind];
          return (
            <motion.div key={t.id}
              initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 30 }}
              className="flex items-start gap-3 px-4 py-3 rounded-lg"
              style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-medium)", borderLeft: `3px solid ${color}` }}
            >
              <Icon size={16} style={{ color, marginTop: 2 }} />
              <div className="flex-1" style={{ fontSize: 13 }}>{t.text}</div>
              <button onClick={() => dismissToast(t.id)} className="opacity-60 hover:opacity-100">
                <X size={14} color="var(--text-secondary)" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

export function Card({ children, className, padded = true }: { children: ReactNode; className?: string; padded?: boolean }) {
  return (
    <div className={`rounded-xl ${padded ? "p-5" : ""} ${className ?? ""}`}
      style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}>
      {children}
    </div>
  );
}

export function Tag({ children, kind = "neutral" }: { children: ReactNode; kind?: "live" | "ringing" | "failed" | "queued" | "neutral" | "completed" | "booked" }) {
  const colors: Record<string, [string, string]> = {
    live: ["rgba(34,197,94,0.10)", "var(--status-live)"],
    booked: ["rgba(99,102,241,0.10)", "var(--status-queued)"],
    ringing: ["rgba(245,158,11,0.10)", "var(--status-ringing)"],
    failed: ["rgba(239,68,68,0.10)", "var(--status-failed)"],
    queued: ["rgba(99,102,241,0.10)", "var(--status-queued)"],
    completed: ["rgba(255,255,255,0.04)", "var(--status-completed)"],
    neutral: ["rgba(255,255,255,0.04)", "var(--text-secondary)"],
  };
  const [bg, fg] = colors[kind];
  return (
    <span className="font-mono inline-flex items-center px-1.5 py-0.5 rounded"
      style={{ fontSize: 10, background: bg, color: fg, letterSpacing: "0.04em" }}>
      {children}
    </span>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="flex items-end justify-between mb-5 flex-wrap gap-4">
      <div>
        <h1 className="font-serif" style={{ fontSize: 28, letterSpacing: -0.5, lineHeight: 1.1 }}>{title}</h1>
        {subtitle && <div className="mt-1" style={{ color: "var(--text-tertiary)", fontSize: 12 }}>{subtitle}</div>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Tabs({ tabs, value, onChange }: { tabs: { id: string; label: string }[]; value: string; onChange: (id: string) => void }) {
  return (
    <div className="flex items-center gap-1 p-1 rounded-lg w-fit" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}>
      {tabs.map((t) => (
        <button key={t.id} onClick={() => onChange(t.id)}
          className="px-3 py-1.5 rounded-md transition-colors"
          style={{
            fontSize: 12,
            background: value === t.id ? "rgba(34,197,94,0.10)" : "transparent",
            color: value === t.id ? "var(--accent)" : "var(--text-secondary)",
          }}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function FilterChip({ children, active, onClick, count }: { children: ReactNode; active?: boolean; onClick?: () => void; count?: number }) {
  return (
    <button onClick={onClick}
      className="px-3 py-1.5 rounded-full inline-flex items-center gap-1.5"
      style={{
        fontSize: 12,
        background: active ? "rgba(34,197,94,0.10)" : "transparent",
        color: active ? "var(--accent)" : "var(--text-secondary)",
        border: `1px solid ${active ? "rgba(34,197,94,0.3)" : "var(--border-subtle)"}`,
      }}>
      {children}
      {count != null && (
        <span className="font-mono" style={{ fontSize: 10, opacity: 0.8 }}>· {count}</span>
      )}
    </button>
  );
}

export function SlideOver({ open, onClose, children, width = 460 }: { open: boolean; onClose: () => void; children: ReactNode; width?: number }) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose} className="fixed inset-0 z-[90]" style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(2px)" }} />
          <motion.aside initial={{ x: width }} animate={{ x: 0 }} exit={{ x: width }}
            transition={{ type: "spring", damping: 28, stiffness: 260 }}
            className="fixed top-0 right-0 bottom-0 z-[91] overflow-y-auto"
            style={{ width, background: "var(--bg-surface)", borderLeft: "1px solid var(--border-medium)" }}>
            {children}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

export function Modal({ open, onClose, children, width = 560 }: { open: boolean; onClose: () => void; children: ReactNode; width?: number }) {
  // Escape closes the top modal (every modal used to trap the keyboard user).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose} className="fixed inset-0 z-[100]" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }} />
          <div className="fixed inset-0 z-[101] flex items-center justify-center p-4 pointer-events-none">
            <motion.div initial={{ opacity: 0, scale: 0.96, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }}
              className="pointer-events-auto rounded-2xl overflow-hidden max-h-[90vh] flex flex-col"
              role="dialog" aria-modal="true"
              style={{ width, maxWidth: "100%", background: "var(--bg-elevated)", border: "1px solid var(--border-medium)" }}>
              {children}
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span style={{ fontSize: 11, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.1em" }}>{label}</span>
      {children}
      {hint && <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{hint}</span>}
    </label>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input {...props}
      className={`px-3 py-2 rounded-md outline-none ${props.className ?? ""}`}
      style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", fontSize: 13, color: "var(--text-primary)", ...(props.style ?? {}) }}
    />
  );
}

export function Select({ children, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...rest}
      className={`px-3 py-2 rounded-md outline-none ${rest.className ?? ""}`}
      style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", fontSize: 13, color: "var(--text-primary)", ...(rest.style ?? {}) }}>
      {children}
    </select>
  );
}
