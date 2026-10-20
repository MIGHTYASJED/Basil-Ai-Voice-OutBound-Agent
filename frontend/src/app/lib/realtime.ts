import { useEffect, useRef, useState, useCallback } from "react";
import { api, getToken } from "./api";

// ── Realtime channel subscription ──
// Opens one shared WebSocket to the backend and lets components subscribe to
// channels ("dispatch-queue", "live-calls", "mission", "agent-status",
// "campaign:<id>"). Auto-reconnects.

type Listener = (event: string, data: any) => void;

let socket: WebSocket | null = null;
let connected = false;
const listeners = new Map<string, Set<Listener>>();
const wanted = new Set<string>();

function ensureSocket() {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;
  const wsUrl = api.base.replace(/^http/, "ws") + "/ws";
  socket = new WebSocket(wsUrl);
  socket.onopen = () => {
    connected = true;
    for (const ch of wanted) socket?.send(JSON.stringify({ type: "subscribe", channel: ch }));
  };
  socket.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      if (msg.type === "event") {
        listeners.get(msg.channel)?.forEach((l) => l(msg.event, msg.data));
        listeners.get("*")?.forEach((l) => l(msg.event, msg.data));
      }
    } catch {}
  };
  socket.onclose = () => {
    connected = false;
    socket = null;
    setTimeout(ensureSocket, 1500); // reconnect
  };
  socket.onerror = () => socket?.close();
}

export function useRealtime(channel: string, onEvent: Listener) {
  const cb = useRef(onEvent);
  cb.current = onEvent;
  useEffect(() => {
    ensureSocket();
    wanted.add(channel);
    if (connected) socket?.send(JSON.stringify({ type: "subscribe", channel }));
    const listener: Listener = (e, d) => cb.current(e, d);
    if (!listeners.has(channel)) listeners.set(channel, new Set());
    listeners.get(channel)!.add(listener);
    return () => {
      listeners.get(channel)?.delete(listener);
    };
  }, [channel]);
}

// ── Generic async data hook with manual refetch ──
export function useAsync<T>(fn: () => Promise<T>, deps: any[] = []): { data: T | null; loading: boolean; error: string | null; reload: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const reload = useCallback(() => {
    setLoading(true);
    fnRef.current()
      .then((d) => { setData(d); setError(null); })
      .catch((e) => setError(e.message ?? "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { if (getToken()) reload(); /* eslint-disable-next-line */ }, deps);
  return { data, loading, error, reload };
}
