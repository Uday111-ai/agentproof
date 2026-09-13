import type { AgentConsoleSummary } from "../api";

export type Screen = "console" | "execute" | "vault" | "verify" | "audit";

const ITEMS: { id: Screen; glyph: string; label: string }[] = [
  { id: "console", glyph: "01", label: "Agent console" },
  { id: "execute", glyph: "02", label: "Run agent" },
  { id: "vault", glyph: "03", label: "Evidence vault" },
  { id: "verify", glyph: "04", label: "Verification center" },
  { id: "audit", glyph: "05", label: "Audit timeline" },
];

export function Sidebar({
  screen,
  onNavigate,
  agent,
}: {
  screen: Screen;
  onNavigate: (s: Screen) => void;
  agent: AgentConsoleSummary | null;
}) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">
          AgentProof<span className="dot">.</span>
        </div>
        <div className="brand-tagline">Cryptographic accountability for autonomous AI.</div>
      </div>
      <nav className="nav">
        {ITEMS.map((item) => (
          <button
            key={item.id}
            className={`nav-item ${screen === item.id ? "active" : ""}`}
            onClick={() => onNavigate(item.id)}
          >
            <span className="nav-glyph">{item.glyph}</span>
            {item.label}
          </button>
        ))}
      </nav>
      <div className="sidebar-foot">
        <div className="env-row">
          <span>Evidence plane</span>
          <span>{agent ? agent.environment.provider : "…"}</span>
        </div>
        <div className="env-row">
          <span>Runtime mode</span>
          <span>{agent ? agent.environment.mode : "…"}</span>
        </div>
        <div className="env-row">
          <span>Vendor</span>
          <span>{agent ? agent.environment.vendor : "…"}</span>
        </div>
      </div>
    </aside>
  );
}
