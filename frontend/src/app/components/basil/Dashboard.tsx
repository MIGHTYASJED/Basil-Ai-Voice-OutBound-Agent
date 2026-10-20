import { useState } from "react";
import { LeafMark } from "./Navbar";
import {
  Home, PhoneCall, Package, Truck, ListChecks, BarChart3, Headphones,
  Settings as SettingsIcon, Search, Bell, ChevronLeft, Plus, FileCode,
  Smartphone, ChevronDown, LogOut, User as UserIcon, CreditCard, Users,
} from "lucide-react";
import { DashProvider, useDash, PageKey, Role } from "./dashboard/shared";
import { DataProvider, useData } from "./dashboard/useData";
import {
  MissionControl, CampaignsPage, CampaignDetail, LoadsPage, DriversPage,
  CallLogPage, AnalyticsPage, QueuePage, AgentsPage, PromptEditorPage, SettingsPage,
  PhoneNumbersPage,
} from "./dashboard/pages";
import { AgentDetailPanel, ListenModal, CommandPalette, CreateAgentModal } from "./dashboard/overlays";

const nav: { key: PageKey; icon: any; label: string }[] = [
  { key: "mission", icon: Home, label: "Mission Control" },
  { key: "campaigns", icon: PhoneCall, label: "Campaigns" },
  { key: "loads", icon: Package, label: "Loads" },
  { key: "drivers", icon: Truck, label: "Drivers" },
  { key: "calls", icon: ListChecks, label: "Call Log" },
  { key: "analytics", icon: BarChart3, label: "Analytics" },
];

const breadcrumbs: Record<PageKey, string> = {
  mission: "Mission Control",
  campaigns: "Campaigns",
  "campaign-detail": "Campaigns / Detail",
  loads: "Loads",
  drivers: "Drivers",
  calls: "Call Log",
  analytics: "Analytics",
  phones: "Phone Numbers",
  queue: "Dispatcher Queue",
  agents: "Agents",
  prompt: "Prompt Editor",
  settings: "Settings",
};

export function Dashboard({ onExit, role = "admin", user }: { onExit: () => void; role?: Role; user?: { name: string; email: string; company: string } }) {
  return (
    <DashProvider role={role}>
      <DataProvider>
        <Shell onExit={onExit} user={user} />
      </DataProvider>
    </DashProvider>
  );
}

function Shell({ onExit, user }: { onExit: () => void; user?: { name: string; email: string; company: string } }) {
  const { page, setPage, openAgent, openCmdK, role } = useDash();
  const { agents, agentGroups, queueWaiting } = useData();
  const [createOpen, setCreateOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState<Record<string, boolean>>({ "dallas-cold": true });
  const queueCount = queueWaiting.length;
  const isAdmin = role === "admin";
  const displayUser = user ?? { name: "Workspace admin", email: "", company: "" };
  const initials = displayUser.name.split(" ").map(p => p[0]).join("").slice(0, 2).toUpperCase();
  const ungroupedAgents = agents.filter(a => !a.group);

  return (
    <div className="basil-root min-h-screen flex" style={{ background: "var(--bg-root)" }}>
      {/* Sidebar */}
      <aside className="w-[260px] shrink-0 flex flex-col" style={{ background: "var(--bg-surface)", borderRight: "1px solid var(--border-subtle)" }}>
        <div className="px-5 pt-5 pb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <LeafMark size={20} />
            <div>
              <div className="font-serif" style={{ fontSize: 18, lineHeight: 1 }}>Basil</div>
              <div style={{ fontSize: 10, color: "var(--text-tertiary)", textTransform: "uppercase" }}>{displayUser.company || "Workspace"}</div>
            </div>
          </div>
          <button onClick={onExit} className="p-1.5 rounded-md hover:bg-white/5" title="Back to site">
            <ChevronLeft size={14} color="var(--text-secondary)" />
          </button>
        </div>

        <nav className="px-3 mt-2 space-y-0.5">
          {nav.map((n) => {
            const active = page === n.key;
            return (
              <button key={n.key} onClick={() => setPage(n.key)}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-left"
                style={{
                  background: active ? "rgba(34,197,94,0.08)" : "transparent",
                  color: active ? "var(--text-primary)" : "var(--text-secondary)",
                }}>
                <n.icon size={16} style={{ color: active ? "var(--accent)" : "var(--text-secondary)" }} />
                <span style={{ fontSize: 13 }} className="flex-1">{n.label}</span>
              </button>
            );
          })}
          {isAdmin && (
            <button onClick={() => setPage("phones")}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-left"
              style={{
                background: page === "phones" ? "rgba(34,197,94,0.08)" : "transparent",
                color: page === "phones" ? "var(--text-primary)" : "var(--text-secondary)",
              }}>
              <Smartphone size={16} style={{ color: page === "phones" ? "var(--accent)" : "var(--text-secondary)" }} />
              <span style={{ fontSize: 13 }} className="flex-1">Phone Numbers</span>
            </button>
          )}
        </nav>

        <div className="px-3 mt-2 pt-2" style={{ borderTop: "1px solid var(--border-subtle)" }}>
          <button onClick={() => setPage("queue")}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-left"
            style={{
              background: page === "queue" ? "rgba(34,197,94,0.08)" : "transparent",
              color: page === "queue" ? "var(--text-primary)" : "var(--text-secondary)",
            }}>
            <Headphones size={16} style={{ color: queueCount > 0 ? "var(--status-failed)" : "var(--text-secondary)" }} />
            <span style={{ fontSize: 13 }} className="flex-1">Dispatcher Queue</span>
            {queueCount > 0 && (
              <span className="font-mono px-1.5 py-0.5 rounded" style={{ fontSize: 10, background: "var(--status-failed)", color: "white" }}>
                {queueCount}
              </span>
            )}
          </button>
        </div>

        <div className="px-5 mt-6 mb-2 flex items-center justify-between">
          <button onClick={() => isAdmin && setPage("agents")} className="font-mono uppercase opacity-80 hover:opacity-100" style={{ fontSize: 10, letterSpacing: "0.18em", color: "var(--text-tertiary)" }}>Agents</button>
          {isAdmin && (
            <button onClick={() => setCreateOpen(true)} className="p-1 rounded hover:bg-white/5" title="Create agent">
              <Plus size={12} color="var(--text-secondary)" />
            </button>
          )}
        </div>

        <div className="px-3 space-y-1 overflow-y-auto flex-1">
          {agentGroups.map(g => {
            const members = agents.filter(a => a.group === g.id);
            const totalActive = members.reduce((s, m) => s + m.activeCalls, 0);
            const open = !!groupOpen[g.id];
            return (
              <div key={g.id}>
                <button onClick={() => setGroupOpen(s => ({ ...s, [g.id]: !open }))}
                  className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-white/[0.03]"
                  style={{ color: "var(--text-secondary)" }}>
                  {open ? <ChevronDown size={11} /> : <ChevronDown size={11} style={{ transform: "rotate(-90deg)" }} />}
                  <Users size={12} color="var(--accent)" />
                  <span className="flex-1 text-left truncate" style={{ fontSize: 12 }}>{g.name}</span>
                  <span className="font-mono" style={{ fontSize: 10, color: "var(--text-tertiary)" }}>{members.length}</span>
                  {totalActive > 0 && <span className="font-mono" style={{ fontSize: 10, color: "var(--accent)" }}>{totalActive} live</span>}
                </button>
                {open && members.map(a => (
                  <button key={a.name} onClick={() => openAgent(a.name)} className="w-full text-left pl-7 pr-3 py-1.5 rounded-lg hover:bg-white/[0.03]">
                    <div className="flex items-center gap-2">
                      <StatusDot kind={a.status as any} />
                      <span style={{ fontSize: 12 }} className="flex-1 truncate">{a.name}</span>
                      {a.activeCalls > 0 && <span className="font-mono shrink-0" style={{ fontSize: 10, color: "var(--accent)" }}>{a.activeCalls}</span>}
                    </div>
                  </button>
                ))}
              </div>
            );
          })}
          {ungroupedAgents.map((a) => (
            <button key={a.name} onClick={() => openAgent(a.name)}
              className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/[0.03]">
              <div className="flex items-center gap-2">
                <StatusDot kind={a.status as any} />
                <span style={{ fontSize: 13 }}>{a.name}</span>
              </div>
              <div className="ml-4 mt-0.5 flex items-center justify-between">
                <span className="truncate" style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{a.role}</span>
                {a.activeCalls > 0 && <span className="font-mono shrink-0 ml-2" style={{ fontSize: 10, color: "var(--accent)" }}>{a.activeCalls} live</span>}
              </div>
            </button>
          ))}
        </div>

        <div className="p-3 space-y-1 relative" style={{ borderTop: "1px solid var(--border-subtle)" }}>
          {isAdmin && (
            <button onClick={() => setPage("prompt")}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/[0.03]"
              style={{ color: page === "prompt" ? "var(--text-primary)" : "var(--text-secondary)" }}>
              <FileCode size={14} />
              <span style={{ fontSize: 13 }}>Prompt Editor</span>
            </button>
          )}
          <button onClick={() => setPage("settings")}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/[0.03]"
            style={{ color: page === "settings" ? "var(--text-primary)" : "var(--text-secondary)" }}>
            <SettingsIcon size={14} />
            <span style={{ fontSize: 13 }}>Settings</span>
          </button>
          <button onClick={() => setUserMenuOpen(v => !v)} className="w-full flex items-center gap-2 px-2 py-2 rounded hover:bg-white/[0.03] text-left">
            <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: "rgba(34,197,94,0.15)", color: "var(--accent)", fontSize: 11 }}>{initials}</div>
            <div className="flex-1 min-w-0">
              <div style={{ fontSize: 13 }}>{displayUser.name}</div>
              <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{isAdmin ? "Admin" : "Dispatcher"} · {displayUser.company}</div>
            </div>
            <ChevronDown size={12} color="var(--text-tertiary)" />
          </button>
          {userMenuOpen && (
            <div className="absolute bottom-full left-3 right-3 mb-2 rounded-lg overflow-hidden z-50" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-medium)" }}>
              <button onClick={() => { setUserMenuOpen(false); setPage("settings"); }} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/5 text-left" style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                <UserIcon size={12} /> Profile
              </button>
              {isAdmin && (
                <button onClick={() => { setUserMenuOpen(false); setPage("settings"); }} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/5 text-left" style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                  <CreditCard size={12} /> Billing
                </button>
              )}
              <button onClick={() => { setUserMenuOpen(false); onExit(); }} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/5 text-left" style={{ fontSize: 12, color: "var(--status-failed)", borderTop: "1px solid var(--border-subtle)" }}>
                <LogOut size={12} /> Log Out
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 min-w-0 flex flex-col">
        <header className="h-14 px-6 flex items-center justify-between shrink-0" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
          <div className="flex items-center gap-2" style={{ color: "var(--text-secondary)", fontSize: 13 }}>
            <span style={{ color: "var(--text-tertiary)" }}>Dashboard</span>
            <span style={{ color: "var(--text-tertiary)" }}>/</span>
            <span>{breadcrumbs[page]}</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={openCmdK}
              className="flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-white/[0.03]"
              style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", minWidth: 280 }}>
              <Search size={13} color="var(--text-tertiary)" />
              <span className="flex-1 text-left" style={{ fontSize: 12, color: "var(--text-tertiary)" }}>Search drivers, loads, agents...</span>
              <span className="font-mono px-1.5 py-0.5 rounded" style={{ fontSize: 10, color: "var(--text-tertiary)", border: "1px solid var(--border-subtle)" }}>⌘K</span>
            </button>
            <button className="p-2 rounded-md relative" style={{ border: "1px solid var(--border-subtle)" }}>
              <Bell size={14} color="var(--text-secondary)" />
              {queueCount > 0 && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full" style={{ background: "var(--status-failed)" }} />}
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto">
          <PageContent />
        </div>
      </main>

      {/* Global overlays */}
      <AgentDetailPanel />
      <ListenModal />
      <CommandPalette />
      <CreateAgentModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}

function PageContent() {
  const { page } = useDash();
  switch (page) {
    case "mission": return <MissionControl />;
    case "campaigns": return <CampaignsPage />;
    case "campaign-detail": return <CampaignDetail />;
    case "loads": return <LoadsPage />;
    case "drivers": return <DriversPage />;
    case "calls": return <CallLogPage />;
    case "analytics": return <AnalyticsPage />;
    case "phones": return <PhoneNumbersPage />;
    case "queue": return <QueuePage />;
    case "agents": return <AgentsPage />;
    case "prompt": return <PromptEditorPage />;
    case "settings": return <SettingsPage />;
  }
}

function StatusDot({ kind }: { kind: "live" | "idle" | "offline" }) {
  const map = { live: "var(--status-live)", idle: "var(--status-ringing)", offline: "var(--status-completed)" };
  return <span className="inline-block w-2 h-2 rounded-full" style={{ background: map[kind], boxShadow: kind === "live" ? "0 0 8px var(--accent-glow)" : undefined }} />;
}
