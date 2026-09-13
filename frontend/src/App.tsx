import { useEffect, useState } from "react";
import { api, type AgentConsoleSummary } from "./api";
import { Sidebar, type Screen } from "./components/Sidebar";
import { ConsoleScreen } from "./screens/ConsoleScreen";
import { ExecuteScreen } from "./screens/ExecuteScreen";
import { EvidenceVaultScreen } from "./screens/EvidenceVaultScreen";
import { EvidenceReceiptScreen } from "./screens/EvidenceReceiptScreen";
import { VerifyScreen } from "./screens/VerifyScreen";
import { AuditScreen } from "./screens/AuditScreen";

export default function App() {
  const [screen, setScreen] = useState<Screen>("console");
  const [openRecordId, setOpenRecordId] = useState<string | null>(null);
  const [agent, setAgent] = useState<AgentConsoleSummary | null>(null);

  useEffect(() => {
    api
      .getAgent()
      .then(setAgent)
      .catch(() => undefined);
  }, [screen]);

  function navigate(next: Screen) {
    setOpenRecordId(null);
    setScreen(next);
  }

  function openEvidence(recordId: string) {
    setOpenRecordId(recordId);
    setScreen("vault");
  }

  let body;
  if (openRecordId) {
    body = <EvidenceReceiptScreen recordId={openRecordId} key={openRecordId} />;
  } else {
    switch (screen) {
      case "console":
        body = <ConsoleScreen onNavigate={navigate} />;
        break;
      case "execute":
        body = <ExecuteScreen onOpenEvidence={openEvidence} onNavigate={navigate} />;
        break;
      case "vault":
        body = <EvidenceVaultScreen onOpen={openEvidence} />;
        break;
      case "verify":
        body = <VerifyScreen />;
        break;
      case "audit":
        body = <AuditScreen onOpen={openEvidence} />;
        break;
    }
  }

  return (
    <div className="app-shell">
      <Sidebar screen={screen} onNavigate={navigate} agent={agent} />
      <main className="main">
        {openRecordId && (
          <button className="link-button" style={{ marginBottom: 18 }} onClick={() => setOpenRecordId(null)}>
            ← Back to evidence vault
          </button>
        )}
        {body}
      </main>
    </div>
  );
}
