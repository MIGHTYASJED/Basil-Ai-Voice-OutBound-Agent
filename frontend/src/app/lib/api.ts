// Basil API client. One typed surface over the backend, with the JWT attached
// automatically. Base URL comes from VITE_API_URL (defaults to localhost:4000).

const BASE = (import.meta as any).env?.VITE_API_URL ?? "http://localhost:4000";

let token: string | null = localStorage.getItem("basil_token");

export function setToken(t: string | null) {
  token = t;
  if (t) localStorage.setItem("basil_token", t);
  else localStorage.removeItem("basil_token");
}
export function getToken() {
  return token;
}

async function req<T = any>(method: string, path: string, body?: any): Promise<T> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const j = await res.json();
      msg = j.error ?? msg;
    } catch {}
    const err = new Error(msg) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  if (res.status === 204) return undefined as T;
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) return res.json();
  return (await res.text()) as T;
}

/** Download a protected file (CSV export etc.) — a plain <a href> can't send the JWT. */
export async function downloadFile(path: string, fallbackName: string) {
  const res = await fetch(BASE + path, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const cd = res.headers.get("content-disposition") ?? "";
  const name = /filename="?([^";]+)"?/.exec(cd)?.[1] ?? fallbackName;
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const api = {
  base: BASE,
  // ── system ──
  health: () => req("GET", "/health"),
  // ── auth ──
  login: (email: string, password: string) => req("POST", "/auth/login", { email, password }),
  signup: (data: { name: string; email: string; company?: string; password: string; role: "admin" | "dispatcher" }) =>
    req("POST", "/auth/signup", data),
  me: () => req("GET", "/auth/me"),

  // ── agents ──
  agents: () => req("GET", "/agents"),
  createAgent: (data: any) => req("POST", "/agents", data),
  editAgent: (id: string, data: any) => req("PUT", `/agents/${id}`, data),
  createAgentGroup: (data: any) => req("POST", "/agent-groups", data),
  pauseAgent: (id: string) => req("POST", `/agents/${id}/pause`),
  resumeAgent: (id: string) => req("POST", `/agents/${id}/resume`),
  duplicateAgent: (id: string) => req("POST", `/agents/${id}/duplicate`),
  deleteAgent: (id: string) => req("DELETE", `/agents/${id}`),
  promptVersions: (id: string) => req("GET", `/agents/${id}/prompt/versions`),
  savePrompt: (id: string, content: string, changeNote?: string) => req("POST", `/agents/${id}/prompt`, { content, changeNote }),
  restorePrompt: (id: string, versionId: string) => req("POST", `/agents/${id}/prompt/restore/${versionId}`),

  // ── phone numbers ──
  phoneNumbers: () => req("GET", "/phone-numbers"),
  poolHealth: () => req("GET", "/phone-numbers/pool-health"),
  addNumbers: (numbers: { e164: string; label?: string; provider?: string; areaCode?: string }[]) =>
    req("POST", "/phone-numbers", { numbers }),
  updateNumber: (id: string, data: { label?: string; disabled?: boolean }) => req("PATCH", `/phone-numbers/${id}`, data),
  deleteNumber: (id: string) => req("DELETE", `/phone-numbers/${id}`),

  // ── drivers ──
  drivers: (q?: { status?: string; search?: string; truckType?: string }) =>
    req("GET", "/drivers" + qs(q)),
  driver: (id: string) => req("GET", `/drivers/${id}`),
  createDriver: (data: any) => req("POST", "/drivers", data),
  updateDriver: (id: string, data: any) => req("PATCH", `/drivers/${id}`, data),
  markDnc: (id: string) => req("POST", `/drivers/${id}/dnc`),
  deleteDriver: (id: string) => req("DELETE", `/drivers/${id}`),
  importDrivers: (csv: string, mapping?: Record<string, string>) => req("POST", "/drivers/import", { csv, mapping }),

  // ── loads ──
  loads: (q?: { status?: string; group?: string }) => req("GET", "/loads" + qs(q)),
  load: (id: string) => req("GET", `/loads/${id}`),
  createLoad: (data: any) => req("POST", "/loads", data),
  updateLoad: (id: string, data: any) => req("PATCH", `/loads/${id}`, data),
  deleteLoad: (id: string) => req("DELETE", `/loads/${id}`),
  createLoadGroup: (name: string) => req("POST", "/load-groups", { name }),
  renameLoadGroup: (id: string, name: string) => req("PATCH", `/load-groups/${id}`, { name }),
  addLoadsToGroup: (id: string, loadIds: string[]) => req("POST", `/load-groups/${id}/loads`, { loadIds }),
  deleteLoadGroup: (id: string) => req("DELETE", `/load-groups/${id}`),
  importLoads: (data: { csv: string; groupId?: string; newGroupName?: string; mapping?: Record<string, string> }) =>
    req("POST", "/loads/import", data),
  datFeed: () => req("GET", "/loads/dat-feed"),
  importDatLoads: (data: { ids: string[]; groupId?: string; newGroupName?: string }) => req("POST", "/loads/dat-feed/import", data),

  // ── campaigns ──
  campaigns: () => req("GET", "/campaigns"),
  campaign: (id: string) => req("GET", `/campaigns/${id}`),
  previewDrivers: (filter: { truckType?: string; state?: string }) => req("POST", "/campaigns/preview-drivers", filter),
  createCampaign: (data: any) => req("POST", "/campaigns", data),
  launchCampaign: (id: string) => req("POST", `/campaigns/${id}/launch`),
  pauseCampaign: (id: string) => req("POST", `/campaigns/${id}/pause`),
  resumeCampaign: (id: string) => req("POST", `/campaigns/${id}/resume`),
  addLoadToCampaign: (campaignId: string, loadId: string) => req("POST", `/campaigns/${campaignId}/add-load`, { loadId }),
  updateCampaign: (id: string, data: any) => req("PATCH", `/campaigns/${id}`, data),
  duplicateCampaign: (id: string) => req("POST", `/campaigns/${id}/duplicate`),
  exportCampaign: (id: string) => downloadFile(`/campaigns/${id}/export`, "campaign-report.csv"),

  // ── calls ──
  calls: (q?: { outcome?: string; agentId?: string; campaignId?: string; days?: string }) => req("GET", "/calls" + qs(q)),
  exportCalls: () => downloadFile("/calls/export", "call-log.csv"),
  call: (id: string) => req("GET", `/calls/${id}`),
  flagCall: (id: string) => req("POST", `/calls/${id}/flag`),
  endCall: (id: string) => req("POST", `/calls/${id}/end`),
  transferCall: (id: string) => req("POST", `/calls/${id}/transfer`),

  // ── dispatch queue ──
  queue: () => req("GET", "/queue"),
  pickup: (id: string) => req("POST", `/queue/${id}/pickup`),
  releaseQueue: (id: string) => req("POST", `/queue/${id}/release`),
  endQueue: (id: string, data?: { outcome?: "booked" | "no_deal" | "callback" | "handled"; note?: string }) => req("POST", `/queue/${id}/end`, data ?? {}),
  queueRecent: () => req("GET", "/queue/recent"),

  // ── dispatcher self ──
  dispatcherMe: () => req("GET", "/dispatchers/me"),
  startPhoneVerify: (phoneNumber: string) => req("POST", "/dispatchers/phone/start", { phoneNumber }),
  verifyPhone: (code: string) => req("POST", "/dispatchers/phone/verify", { code }),
  useWebrtc: (enabled: boolean) => req("POST", "/dispatchers/use-webrtc", { enabled }),
  setAvailability: (availability: "available" | "busy" | "offline") => req("POST", "/dispatchers/availability", { availability }),

  // ── mission + analytics ──
  mission: () => req("GET", "/mission"),
  capacity: (data: { agents?: number; avgCallDurationSec?: number; callWindowHours?: number; targetCallsPerDay?: number }) =>
    req("POST", "/mission/capacity", data),
  analytics: (days = 7) => req("GET", `/analytics?days=${days}`),
  exportFreightFeed: () => downloadFile("/loads/dat-feed/export", "freight-feed.csv"),

  // ── team + workspace ──
  team: () => req("GET", "/team"),
  addTeammate: (data: { name: string; email: string; role: "admin" | "dispatcher" }) => req("POST", "/team", data),
  removeTeammate: (id: string) => req("DELETE", `/team/${id}`),
  workspaceStatus: () => req("GET", "/workspace/status"),
};

function qs(q?: Record<string, string | undefined>) {
  if (!q) return "";
  const parts = Object.entries(q).filter(([, v]) => v != null && v !== "").map(([k, v]) => `${k}=${encodeURIComponent(v!)}`);
  return parts.length ? `?${parts.join("&")}` : "";
}
