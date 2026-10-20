import { ReactNode, createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { api } from "../../../lib/api";
import { useRealtime } from "../../../lib/realtime";

// Loads every dashboard collection from the backend and exposes them under the
// SAME names the pages already use (agents, campaigns, loads, ...), so page JSX
// stays unchanged — a page just does `const { agents } = useData();`.
// Auto-reloads on realtime events (new calls, queue changes, agent status…).

type DataShape = {
  agents: any[];
  agentGroups: any[];
  campaigns: any[];
  loads: any[];
  loadGroups: any[];
  drivers: any[];
  callLog: any[];
  queueWaiting: any[];
  phoneNumbers: any[];
  freightFeed: any[];
  poolHealth: any | null;
  mission: any | null;
  loading: boolean;
  reload: () => void;
};

const Ctx = createContext<DataShape | null>(null);
export function useData() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useData outside DataProvider");
  return c;
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Omit<DataShape, "reload">>({
    agents: [], agentGroups: [], campaigns: [], loads: [], loadGroups: [], drivers: [],
    callLog: [], queueWaiting: [], phoneNumbers: [], freightFeed: [], poolHealth: null, mission: null, loading: true,
  });

  const reload = useCallback(async () => {
    try {
      const [agentsRes, campaigns, loadsRes, drivers, callLog, queueWaiting, phoneNumbers, poolHealth, mission, feedRes] =
        await Promise.all([
          api.agents().catch(() => ({ agents: [], groups: [] })),
          api.campaigns().catch(() => []),
          api.loads().catch(() => ({ loads: [], groups: [] })),
          api.drivers().catch(() => []),
          api.calls().catch(() => []),
          api.queue().catch(() => []),
          api.phoneNumbers().catch(() => []),
          api.poolHealth().catch(() => null),
          api.mission().catch(() => null),
          api.datFeed().catch(() => ({ feed: [] })),
        ]);
      setState({
        agents: Array.isArray(agentsRes?.agents) ? agentsRes.agents : [],
        agentGroups: Array.isArray(agentsRes?.groups) ? agentsRes.groups : [],
        campaigns: Array.isArray(campaigns) ? campaigns : [],
        loads: Array.isArray(loadsRes?.loads) ? loadsRes.loads : [],
        loadGroups: Array.isArray(loadsRes?.groups) ? loadsRes.groups : [],
        drivers: (Array.isArray(drivers) ? drivers : []).map((d: any) => ({ ...d, status: d?.status === "Dnc" ? "DNC" : d?.status ?? "Active" })),
        callLog: (Array.isArray(callLog) ? callLog : []).map((c: any) => ({ ...c, driverInfo: c?.driverInfo ?? [] })),
        queueWaiting: Array.isArray(queueWaiting) ? queueWaiting : [],
        phoneNumbers: Array.isArray(phoneNumbers) ? phoneNumbers : [],
        poolHealth,
        mission,
        freightFeed: Array.isArray(feedRes?.feed) ? feedRes.feed : [],
        loading: false,
      });
    } catch (e) {
      console.error("DataProvider reload error:", e);
      setState((s) => ({ ...s, loading: false }));
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  // Throttled auto-reload on any realtime event.
  const timer = useRef<any>(null);
  const ping = useCallback(() => {
    if (timer.current) return;
    timer.current = setTimeout(() => { timer.current = null; reload(); }, 800);
  }, [reload]);
  useRealtime("dispatch-queue", ping);
  useRealtime("live-calls", ping);
  useRealtime("agent-status", ping);
  useRealtime("mission", ping);

  return <Ctx.Provider value={{ ...state, reload }}>{children}</Ctx.Provider>;
}
