import { useEffect, useRef, useState } from "react";
import { Modal, Select, useDash } from "./shared";
import { useData } from "./useData";
import { api, getToken } from "../../../lib/api";

// "Talk to the agent" — a live two-way voice test against Gemini, straight from
// the browser. Completely isolated from the call pipeline: it opens its own
// WebSocket to /agent-test, streams your mic as PCM 16 kHz, and plays back the
// agent's PCM 24 kHz. No carrier, no μ-law, no DB writes. Works in simulation
// mode as long as a GEMINI_API_KEY is set on the backend.

type Turn = { role: "user" | "agent"; text: string };

export function TestAgentModal({ open, onClose, initialAgentId }: { open: boolean; onClose: () => void; initialAgentId?: string }) {
  const { agents } = useData();
  const { toast } = useDash();
  const [agentId, setAgentId] = useState("");

  // Default to initialAgentId if provided, else the first agent in the list
  useEffect(() => { 
    if (open && agents.length) {
      if (initialAgentId && agents.some(a => a.id === initialAgentId)) setAgentId(initialAgentId);
      else if (!agentId) setAgentId(agents[0].id);
    }
  }, [open, agents, initialAgentId]);
  const [status, setStatus] = useState<"idle" | "connecting" | "live" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [tools, setTools] = useState<{ name: string; args: any }[]>([]);
  const [geminiReady, setGeminiReady] = useState<boolean | null>(null);
  const [speaking, setSpeaking] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const micCtxRef = useRef<AudioContext | null>(null);
  const playCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const playHeadRef = useRef(0);
  const playingRef = useRef<AudioBufferSourceNode[]>([]);
  const transcriptEnd = useRef<HTMLDivElement | null>(null);

  useEffect(() => { if (open && !agentId && agents.length) setAgentId(agents[0].id); }, [open, agents]);
  useEffect(() => {
    if (open) api.health().then((h) => setGeminiReady(!!h.gemini)).catch(() => setGeminiReady(null));
  }, [open]);
  useEffect(() => { transcriptEnd.current?.scrollIntoView({ behavior: "smooth" }); }, [turns]);
  useEffect(() => () => stop(), []); // cleanup on unmount

  const appendTurn = (role: "user" | "agent", text: string) => {
    setTurns((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.role === role) {
        // merge streaming transcript fragments into the latest bubble
        const copy = prev.slice();
        copy[copy.length - 1] = { role, text: (last.text + " " + text).trim() };
        return copy;
      }
      return [...prev, { role, text }];
    });
  };

  function flushPlayback() {
    playingRef.current.forEach((s) => { try { s.stop(); } catch {} });
    playingRef.current = [];
    if (playCtxRef.current) playHeadRef.current = playCtxRef.current.currentTime;
    setSpeaking(false);
  }

  function playChunk(b64: string) {
    const playCtx = playCtxRef.current;
    if (!playCtx) return;
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const int16 = new Int16Array(bytes.buffer);
    const float = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) float[i] = int16[i] / 32768;
    const buf = playCtx.createBuffer(1, float.length, 24000); // Gemini outputs 24kHz
    buf.getChannelData(0).set(float);
    const node = playCtx.createBufferSource();
    node.buffer = buf;
    node.connect(playCtx.destination);
    const startAt = Math.max(playHeadRef.current, playCtx.currentTime);
    if (playCtx.state === 'suspended') {
      playCtx.resume();
    }
    node.start(startAt);
    playHeadRef.current = startAt + buf.duration;
    setSpeaking(true);
    node.onended = () => {
      playingRef.current = playingRef.current.filter((s) => s !== node);
      if (playingRef.current.length === 0) setSpeaking(false);
    };
    playingRef.current.push(node);
  }

  async function start() {
    setTurns([]); setTools([]); setErrorMsg(null); setStatus("connecting");
    try {
      // 1) Mic capture → PCM 16kHz
      const micCtx = new AudioContext({ sampleRate: 16000 });
      micCtxRef.current = micCtx;
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;
      const src = micCtx.createMediaStreamSource(stream);
      const proc = micCtx.createScriptProcessor(2048, 1, 1);
      const mute = micCtx.createGain();
      mute.gain.value = 0; // keep the graph running without echoing the mic

      // 2) Playback context (device rate; AudioBuffer resamples 24k → device)
      const playCtx = new AudioContext();
      playCtxRef.current = playCtx;
      playHeadRef.current = playCtx.currentTime;

      // 3) WebSocket to the isolated test endpoint
      const ws = new WebSocket(api.base.replace(/^http/, "ws") + "/agent-test");
      wsRef.current = ws;

      ws.onopen = () => ws.send(JSON.stringify({ type: "start", agentId, token: getToken() }));
      ws.onmessage = (ev) => {
        let m: any; try { m = JSON.parse(ev.data); } catch { return; }
        if (m.type === "ready") setStatus("live");
        else if (m.type === "audio") playChunk(m.data);
        else if (m.type === "transcript") appendTurn(m.role, m.text);
        else if (m.type === "tool") setTools((t) => [...t, { name: m.name, args: m.args }]);
        else if (m.type === "interrupted") flushPlayback();
        else if (m.type === "error") { setErrorMsg(m.message); setStatus("error"); }
        else if (m.type === "closed") { /* server ended session */ }
      };
      ws.onerror = () => { setErrorMsg("Connection error. Is the backend running?"); setStatus("error"); };
      ws.onclose = () => { if (status === "live") setStatus("idle"); };

      proc.onaudioprocess = (e) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
        const input = e.inputBuffer.getChannelData(0);
        const pcm16 = floatToInt16(downsampleTo16k(input, micCtx.sampleRate));
        wsRef.current.send(JSON.stringify({ type: "audio", data: base64FromInt16(pcm16) }));
      };

      src.connect(proc);
      proc.connect(mute);
      mute.connect(micCtx.destination);
    } catch (err: any) {
      setErrorMsg(err?.message ?? "Could not access microphone");
      setStatus("error");
      stop();
    }
  }

  function stop() {
    try { wsRef.current?.send(JSON.stringify({ type: "stop" })); } catch {}
    try { wsRef.current?.close(); } catch {}
    wsRef.current = null;
    flushPlayback();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    micCtxRef.current?.close().catch(() => {});
    playCtxRef.current?.close().catch(() => {});
    micCtxRef.current = null; playCtxRef.current = null;
    if (status !== "error") setStatus("idle");
  }

  const close = () => { stop(); setTurns([]); setTools([]); onClose(); };

  return (
    <Modal open={open} onClose={close} width={640}>
      <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
        <div className="flex items-center gap-2">
          <h2 className="font-serif" style={{ fontSize: 18 }}>🎙 Test Agent</h2>
          {status === "live" && <span className="basil-dot-pulse" title="live" />}
        </div>
        <button onClick={close} className="p-1.5 rounded hover:bg-white/5" style={{ color: "var(--text-secondary)" }}>×</button>
      </div>

      <div className="p-5 space-y-4">
        <div style={{ fontSize: 12, color: "var(--text-tertiary)", lineHeight: 1.6 }}>
          Talk to the agent live in your browser, using its real system prompt. This is a sandbox — it never places calls, touches the queue, or writes any records. Speak as if you're the driver.
        </div>

        {geminiReady === false && (
          <div className="rounded-md px-3 py-2" style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)", fontSize: 12, color: "var(--status-ringing)" }}>
            No Gemini API key detected on the backend. Add <span className="font-mono">GEMINI_API_KEY</span> to <span className="font-mono">backend/.env</span> and restart to enable voice. (Driver calls stay in simulation mode regardless.)
          </div>
        )}
        {errorMsg && (
          <div className="rounded-md px-3 py-2" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", fontSize: 12, color: "var(--status-failed)" }}>{errorMsg}</div>
        )}

        <div className="flex items-center gap-3">
          <div className="flex-1">
            <div className="font-mono uppercase mb-1" style={{ fontSize: 10, letterSpacing: "0.14em", color: "var(--text-tertiary)" }}>Agent</div>
            <Select value={agentId} onChange={(e) => setAgentId((e.target as HTMLSelectElement).value)} disabled={status === "live" || status === "connecting"}>
              {agents.map((a) => <option key={a.id} value={a.id}>{a.name}{a.role ? ` · ${a.role}` : ""}</option>)}
            </Select>
          </div>
          {status === "idle" || status === "error" ? (
            <button onClick={start} className="basil-btn-primary" style={{ padding: "9px 16px", fontSize: 13, alignSelf: "flex-end" }}>Start talking</button>
          ) : (
            <button onClick={stop} className="basil-btn-ghost" style={{ padding: "9px 16px", fontSize: 13, alignSelf: "flex-end", borderColor: "var(--status-failed)", color: "var(--status-failed)" }}>End test</button>
          )}
        </div>

        {(status === "connecting" || status === "live") && (
          <div className="flex items-center gap-2" style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            <span className="basil-dot-pulse" />
            {status === "connecting" ? "Connecting to the agent…" : speaking ? "Agent is speaking…" : "Listening — go ahead and talk"}
          </div>
        )}

        <div className="rounded-lg p-3 space-y-2 overflow-y-auto" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", minHeight: 180, maxHeight: 300 }}>
          {turns.length === 0 && status !== "live" && (
            <div className="text-center py-8" style={{ fontSize: 12, color: "var(--text-tertiary)" }}>Transcript will appear here once you start.</div>
          )}
          {turns.map((t, i) => (
            <div key={i}>
              <div className="font-mono" style={{ fontSize: 10, color: t.role === "agent" ? "var(--accent)" : "var(--text-tertiary)" }}>{t.role === "agent" ? "AGENT" : "YOU"}</div>
              <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 }}>{t.text}</div>
            </div>
          ))}
          <div ref={transcriptEnd} />
        </div>

        {tools.length > 0 && (
          <div>
            <div className="font-mono uppercase mb-1" style={{ fontSize: 10, letterSpacing: "0.14em", color: "var(--text-tertiary)" }}>Function calls (sandboxed — no real action taken)</div>
            <div className="space-y-1">
              {tools.map((t, i) => (
                <div key={i} className="rounded px-3 py-2 font-mono" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", fontSize: 11, color: "var(--text-secondary)" }}>
                  <span style={{ color: "var(--accent)" }}>{t.name}</span>({JSON.stringify(t.args)})
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

// ── browser audio helpers ──
function downsampleTo16k(float32: Float32Array, inRate: number): Float32Array {
  if (inRate === 16000) return float32;
  const ratio = inRate / 16000;
  const outLen = Math.round(float32.length / ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const p = i * ratio, i0 = Math.floor(p), i1 = Math.min(i0 + 1, float32.length - 1), f = p - i0;
    out[i] = float32[i0] * (1 - f) + float32[i1] * f;
  }
  return out;
}
function floatToInt16(f: Float32Array): Int16Array {
  const o = new Int16Array(f.length);
  for (let i = 0; i < f.length; i++) { let s = Math.max(-1, Math.min(1, f[i])); o[i] = s < 0 ? s * 0x8000 : s * 0x7fff; }
  return o;
}
function base64FromInt16(int16: Int16Array): string {
  const bytes = new Uint8Array(int16.buffer);
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)) as any);
  return btoa(bin);
}
