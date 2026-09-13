import { useState } from "react";
import { shorten } from "../api";

export function HashText({ value, full = false }: { value: string; full?: boolean }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // Clipboard access can be denied by the browser; the value is still
      // visible and selectable, so this is a soft failure.
    }
  }

  return (
    <button
      onClick={copy}
      title={value}
      className="link-button mono"
      style={{ color: "inherit", textAlign: "left" }}
    >
      {full ? value : shorten(value)}
      {copied && <span style={{ color: "var(--accent-verify)", marginLeft: 6 }}>copied</span>}
    </button>
  );
}
