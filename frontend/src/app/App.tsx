import { useState, useEffect, Component, ErrorInfo, ReactNode } from "react";
import "./components/basil/tokens.css";

// Error boundary: catches runtime crashes in the Dashboard (or anywhere) and
// shows the actual error instead of a blank white screen.
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error("Basil error boundary:", error, info); }
  render() {
    if (this.state.error) {
      return (
        <div style={{ background: "#050505", color: "#f5f5f5", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "monospace", padding: 40 }}>
          <div style={{ maxWidth: 600 }}>
            <h1 style={{ color: "#ef4444", fontSize: 20 }}>Something went wrong</h1>
            <pre style={{ marginTop: 16, padding: 16, background: "#111", borderRadius: 8, fontSize: 12, overflow: "auto", whiteSpace: "pre-wrap" }}>{this.state.error.message}{"\n"}{this.state.error.stack}</pre>
            <button onClick={() => { this.setState({ error: null }); window.location.reload(); }} style={{ marginTop: 16, padding: "8px 16px", background: "#22c55e", color: "#000", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13 }}>Reload</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
import { Navbar } from "./components/basil/Navbar";
import { Hero } from "./components/basil/Hero";
import { StatsBanner } from "./components/basil/StatsBanner";
import { AgentsAtWork } from "./components/basil/AgentsAtWork";
import { HowItWorks } from "./components/basil/HowItWorks";
import { FeatureGrid } from "./components/basil/FeatureGrid";
import { CTA } from "./components/basil/CTA";
import { Footer } from "./components/basil/Footer";
import { Dashboard } from "./components/basil/Dashboard";
import { Auth, AuthUser } from "./components/basil/Auth";
import { api, setToken, getToken } from "./lib/api";

export default function App() {
  const [view, setView] = useState<"site" | "auth" | "dashboard">("site");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [restoring, setRestoring] = useState(true);

  // Force body to dark so there's never a white flash between view transitions.
  useEffect(() => { document.body.style.background = "#050505"; document.body.style.color = "#f5f5f5"; }, []);

  // Restore an existing session from a stored JWT.
  useEffect(() => {
    if (!getToken()) { setRestoring(false); return; }
    api.me()
      .then((res) => {
        setUser({ name: res.user.name, email: res.user.email, company: res.user.company ?? "", role: res.user.role });
        setView("dashboard");
      })
      .catch(() => setToken(null))
      .finally(() => setRestoring(false));
  }, []);

  const logout = () => {
    setToken(null);
    setUser(null);
    setView("site");
  };

  if (restoring) {
    return <div className="basil-root min-h-screen flex items-center justify-center" style={{ background: "var(--bg-root)", color: "var(--text-tertiary)" }}>Loading…</div>;
  }

  if (view === "auth") {
    return (
      <ErrorBoundary>
        <Auth onAuth={(u) => { setUser(u); setView("dashboard"); }} onCancel={() => setView("site")} />
      </ErrorBoundary>
    );
  }

  if (view === "dashboard" && user) {
    return (
      <ErrorBoundary>
        <Dashboard role={user.role} user={user} onExit={logout} />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <div className="basil-root">
        <Navbar onEnterApp={() => setView("auth")} />
        <Hero />
        <StatsBanner />
        <AgentsAtWork />
        <HowItWorks />
        <FeatureGrid />
        <CTA />
        <Footer />
      </div>
    </ErrorBoundary>
  );
}
