import { LeafMark } from "./Navbar";

export function Footer() {
  const cols = [
    { title: "Product", links: ["Overview", "Agents", "Dispatcher queue", "Analytics", "Changelog"] },
    { title: "Company", links: ["About", "Contact"] },
    { title: "Resources", links: ["Docs", "API", "Blog", "Status"] },
    { title: "Legal", links: ["Privacy", "Terms", "Security", "DPA"] },
  ];
  return (
    <footer className="relative px-6 pt-20 pb-10" style={{ borderTop: "1px solid var(--border-subtle)" }}>
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-10">
          <div className="col-span-2">
            <div className="flex items-center gap-2">
              <LeafMark />
              <span className="font-serif" style={{ fontSize: 24 }}>Basil</span>
            </div>
            <p className="mt-4" style={{ color: "var(--text-secondary)", fontSize: 13, maxWidth: 280, lineHeight: 1.55 }}>
              Autonomous AI voice agents for freight dispatch. Built for operators, not investors.
            </p>
          </div>
          {cols.map((c) => (
            <div key={c.title}>
              <div className="font-mono uppercase" style={{ fontSize: 10, letterSpacing: "0.2em", color: "var(--text-tertiary)" }}>{c.title}</div>
              <ul className="mt-4 space-y-2.5">
                {c.links.map((l) => (
                  <li key={l}><a href="#" style={{ fontSize: 13, color: "var(--text-secondary)" }} className="hover:text-white transition-colors">{l}</a></li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-16 pt-6 flex items-center justify-between flex-wrap gap-4" style={{ borderTop: "1px solid var(--border-subtle)" }}>
          <span className="font-mono" style={{ fontSize: 11, color: "var(--text-tertiary)" }}>© Basil AI 2026</span>
          <div className="flex items-center gap-4" style={{ color: "var(--text-secondary)", fontSize: 12 }}>
            <a href="#">X</a><a href="#">LinkedIn</a><a href="#">GitHub</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
