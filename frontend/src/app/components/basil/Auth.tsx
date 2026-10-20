import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Eye, EyeOff, Check, X, ArrowRight, Loader2 } from "lucide-react";
import { LeafMark } from "./Navbar";
import { ParticleGalaxy } from "./ParticleGalaxy";
import { api, setToken } from "../../lib/api";

export type AuthUser = { name: string; email: string; company: string; role: "admin" | "dispatcher" };

export function Auth({ onAuth, onCancel }: { onAuth: (u: AuthUser) => void; onCancel: () => void }) {
  const [mode, setMode] = useState<"login" | "signup" | "forgot" | "forgot-sent">("login");

  return (
    <div className="basil-root min-h-screen flex" style={{ background: "#050505", color: "var(--text-primary)" }}>
      <div className="flex-[3] flex items-center justify-center p-6 relative overflow-hidden">
        <div className="absolute inset-0 opacity-30 pointer-events-none">
          <ParticleGalaxy />
        </div>
        <div className="relative w-full max-w-md rounded-2xl p-8" style={{ background: "rgba(14,18,14,0.92)", border: "1px solid var(--border-medium)", backdropFilter: "blur(20px)" }}>
          <button onClick={onCancel} className="absolute top-4 right-4 p-1.5 rounded hover:bg-white/5" title="Close"><X size={14} color="var(--text-tertiary)" /></button>
          <div className="flex items-center gap-2 mb-6">
            <LeafMark size={22} />
            <div className="font-serif" style={{ fontSize: 22 }}>Basil</div>
          </div>
          <AnimatePresence mode="wait">
            <motion.div key={mode} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
              {mode === "login" && <LoginForm onAuth={onAuth} onForgot={() => setMode("forgot")} onSignup={() => setMode("signup")} />}
              {mode === "signup" && <SignupForm onAuth={onAuth} onLogin={() => setMode("login")} />}
              {mode === "forgot" && <ForgotForm onSent={() => setMode("forgot-sent")} onBack={() => setMode("login")} />}
              {mode === "forgot-sent" && (
                <div className="text-center py-4">
                  <Check size={36} className="mx-auto mb-3" color="var(--accent)" />
                  <div className="font-serif" style={{ fontSize: 20 }}>Check your inbox</div>
                  <div className="mt-2" style={{ fontSize: 13, color: "var(--text-secondary)" }}>We sent a reset link to your email.</div>
                  <button onClick={() => setMode("login")} className="basil-btn-ghost mt-4" style={{ padding: "8px 14px", fontSize: 12 }}>← Back to sign in</button>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
      <div className="hidden md:block flex-[2] relative overflow-hidden" style={{ background: "#050505", borderLeft: "1px solid var(--border-subtle)" }}>
        <ParticleGalaxy />
        <div className="absolute inset-0 flex items-end p-10 pointer-events-none">
          <div className="max-w-sm">
            <div className="font-serif" style={{ fontSize: 26, lineHeight: 1.2 }}>The autonomous voice agent for freight dispatch.</div>
            <div className="mt-3" style={{ fontSize: 13, color: "var(--text-tertiary)" }}>Basil calls drivers, negotiates, and hands warm leads to your dispatchers.</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function LoginForm({ onAuth, onForgot, onSignup }: { onAuth: (u: AuthUser) => void; onForgot: () => void; onSignup: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!emailValid) return setError("Please enter a valid email address");
    if (password.length < 8) return setError("Password must be at least 8 characters");
    if (attempts >= 5) return setError("Too many attempts. Please try again in 5 minutes.");
    setLoading(true);
    setAttempts((a) => a + 1);
    try {
      const res = await api.login(email, password);
      setToken(res.token);
      onAuth({ name: res.user.name, email: res.user.email, company: res.user.company ?? "", role: res.user.role });
    } catch (err: any) {
      setError(err.message ?? "Sign in failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <h1 className="font-serif" style={{ fontSize: 28 }}>Welcome back</h1>
        <div className="mt-1" style={{ fontSize: 12, color: "var(--text-tertiary)" }}>Sign in to your Basil account</div>
      </div>
      {error && (
        <div className="rounded-md px-3 py-2" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", fontSize: 12, color: "var(--status-failed)" }}>{error}</div>
      )}
      <FieldLabel label="Email">
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" className="auth-input" autoComplete="email" />
      </FieldLabel>
      <FieldLabel label="Password">
        <div className="relative">
          <input value={password} onChange={(e) => setPassword(e.target.value)} type={show ? "text" : "password"} placeholder="••••••••" className="auth-input w-full pr-10" autoComplete="current-password" />
          <button type="button" onClick={() => setShow(s => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded hover:bg-white/5">{show ? <EyeOff size={14} color="var(--text-tertiary)" /> : <Eye size={14} color="var(--text-tertiary)" />}</button>
        </div>
      </FieldLabel>
      <div className="flex items-center justify-between" style={{ fontSize: 12 }}>
        <label className="flex items-center gap-2" style={{ color: "var(--text-secondary)" }}><input type="checkbox" /> Remember me</label>
        <button type="button" onClick={onForgot} style={{ color: "var(--accent)" }}>Forgot password? →</button>
      </div>
      <button type="submit" disabled={loading} className="basil-btn-primary w-full justify-center" style={{ padding: "10px", fontSize: 13 }}>
        {loading ? <><Loader2 size={14} className="animate-spin" /> Signing in...</> : "Sign In"}
      </button>
      <Divider label="or continue with" />
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className="basil-btn-ghost justify-center" style={{ padding: "8px", fontSize: 12 }}>G · Google</button>
        <button type="button" className="basil-btn-ghost justify-center" style={{ padding: "8px", fontSize: 12 }}>M · Microsoft</button>
      </div>
      <div className="text-center" style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
        Don't have an account? <button type="button" onClick={onSignup} style={{ color: "var(--accent)" }}>Sign Up →</button>
      </div>
      <div className="text-center" style={{ fontSize: 10, color: "var(--text-tertiary)" }}>Demo: admin@basil.demo / password123 (admin) · dispatch@basil.demo / password123 (dispatcher)</div>
      <style>{`.auth-input{padding:10px 12px;border-radius:6px;background:var(--bg-surface);border:1px solid var(--border-subtle);font-size:13px;color:var(--text-primary);outline:none;width:100%}.auth-input:focus{border-color:var(--accent)}`}</style>
    </form>
  );
}

function SignupForm({ onAuth, onLogin }: { onAuth: (u: AuthUser) => void; onLogin: () => void }) {
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [role, setRole] = useState<"admin" | "dispatcher">("admin");
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const rules = {
    len: password.length >= 8,
    upper: /[A-Z]/.test(password),
    num: /\d/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
  };
  const strength = Object.values(rules).filter(Boolean).length;
  const strengthLabel = strength <= 1 ? "Weak" : strength <= 2 ? "Fair" : strength <= 3 ? "Good" : "Strong";
  const strengthColor = strength <= 1 ? "var(--status-failed)" : strength <= 2 ? "var(--status-ringing)" : "var(--accent)";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (name.length < 2) return setError("Name must be at least 2 characters");
    if (!company) return setError("Company is required");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setError("Please enter a valid work email");
    if (strength < 3) return setError("Password is too weak");
    if (password !== confirm) return setError("Passwords do not match");
    if (!agree) return setError("You must agree to the Terms of Service");
    setLoading(true);
    try {
      const res = await api.signup({ name, email, company, password, role });
      setToken(res.token);
      onAuth({ name: res.user.name, email: res.user.email, company: res.user.company ?? company, role: res.user.role });
    } catch (err: any) {
      setError(err.message ?? "Could not create account");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <h1 className="font-serif" style={{ fontSize: 28 }}>Get started</h1>
        <div className="mt-1" style={{ fontSize: 12, color: "var(--text-tertiary)" }}>Create your Basil account</div>
      </div>
      {error && <div className="rounded-md px-3 py-2" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", fontSize: 12, color: "var(--status-failed)" }}>{error}</div>}
      <FieldLabel label="Full Name"><input value={name} onChange={(e) => setName(e.target.value)} className="auth-input" placeholder="Muhammad Hassan" /></FieldLabel>
      <FieldLabel label="Company Name"><input value={company} onChange={(e) => setCompany(e.target.value)} className="auth-input" placeholder="Northfleet Dispatch" /></FieldLabel>
      <FieldLabel label="Work Email"><input value={email} onChange={(e) => setEmail(e.target.value)} className="auth-input" placeholder="you@company.com" /></FieldLabel>
      <FieldLabel label="Password">
        <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" className="auth-input" placeholder="••••••••" />
      </FieldLabel>
      {password && (
        <div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
            <div className="h-full transition-all" style={{ width: `${(strength / 4) * 100}%`, background: strengthColor }} />
          </div>
          <div className="mt-1 flex items-center justify-between" style={{ fontSize: 11 }}>
            <span style={{ color: strengthColor }}>{strengthLabel}</span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-1" style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
            <RuleChk on={rules.len}>8+ characters</RuleChk>
            <RuleChk on={rules.upper}>Uppercase</RuleChk>
            <RuleChk on={rules.num}>Number</RuleChk>
            <RuleChk on={rules.special}>Special char</RuleChk>
          </div>
        </div>
      )}
      <FieldLabel label="Confirm Password"><input value={confirm} onChange={(e) => setConfirm(e.target.value)} type="password" className="auth-input" placeholder="••••••••" /></FieldLabel>
      <FieldLabel label="Role">
        <div className="grid grid-cols-2 gap-2">
          <RoleCard active={role === "admin"} onClick={() => setRole("admin")} title="Admin" desc="Full access: create agents, edit prompts, manage team & billing" />
          <RoleCard active={role === "dispatcher"} onClick={() => setRole("dispatcher")} title="Dispatcher" desc="Operational: pick up calls, manage loads & drivers" />
        </div>
      </FieldLabel>
      <label className="flex items-start gap-2" style={{ fontSize: 12, color: "var(--text-secondary)" }}>
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5" />
        I agree to the Terms of Service and Privacy Policy
      </label>
      <button type="submit" disabled={loading} className="basil-btn-primary w-full justify-center" style={{ padding: "10px", fontSize: 13 }}>
        {loading ? <><Loader2 size={14} className="animate-spin" /> Creating your account...</> : "Create Account"}
      </button>
      <div className="text-center" style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
        Already have an account? <button type="button" onClick={onLogin} style={{ color: "var(--accent)" }}>Sign In →</button>
      </div>
    </form>
  );
}

function ForgotForm({ onSent, onBack }: { onSent: () => void; onBack: () => void }) {
  const [email, setEmail] = useState("");
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSent(); }} className="space-y-4">
      <div>
        <h1 className="font-serif" style={{ fontSize: 26 }}>Reset password</h1>
        <div className="mt-1" style={{ fontSize: 12, color: "var(--text-tertiary)" }}>Enter your email and we'll send a reset link.</div>
      </div>
      <FieldLabel label="Email"><input value={email} onChange={(e) => setEmail(e.target.value)} className="auth-input" placeholder="name@company.com" /></FieldLabel>
      <button type="submit" className="basil-btn-primary w-full justify-center" style={{ padding: "10px", fontSize: 13 }}>Send Reset Link <ArrowRight size={13} /></button>
      <button type="button" onClick={onBack} className="basil-btn-ghost w-full justify-center" style={{ padding: "8px", fontSize: 12 }}>← Back to sign in</button>
    </form>
  );
}

function FieldLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block mb-1.5" style={{ fontSize: 11, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.1em" }}>{label}</span>
      {children}
    </label>
  );
}

function RuleChk({ on, children }: { on: boolean; children: React.ReactNode }) {
  return <span className="flex items-center gap-1" style={{ color: on ? "var(--accent)" : "var(--text-tertiary)" }}>{on ? <Check size={11} /> : <X size={11} />} {children}</span>;
}

function RoleCard({ active, onClick, title, desc }: { active: boolean; onClick: () => void; title: string; desc: string }) {
  return (
    <button type="button" onClick={onClick} className="p-3 rounded-lg text-left" style={{ background: active ? "rgba(34,197,94,0.08)" : "var(--bg-surface)", border: `1px solid ${active ? "var(--accent)" : "var(--border-subtle)"}` }}>
      <div style={{ fontSize: 13, color: active ? "var(--accent)" : "var(--text-primary)" }}>{title}</div>
      <div className="mt-1" style={{ fontSize: 11, color: "var(--text-tertiary)", lineHeight: 1.4 }}>{desc}</div>
    </button>
  );
}

function Divider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3" style={{ color: "var(--text-tertiary)" }}>
      <div className="flex-1 h-px" style={{ background: "var(--border-subtle)" }} />
      <span style={{ fontSize: 11 }}>{label}</span>
      <div className="flex-1 h-px" style={{ background: "var(--border-subtle)" }} />
    </div>
  );
}
