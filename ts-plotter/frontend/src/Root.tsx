import { useState } from "react";

import App from "./App";

type Mode = "choose" | "stream" | "load";

const card = {
  width: 240,
  padding: "32px 24px",
  border: "1px solid #2e86de",
  borderRadius: 8,
  background: "#fff",
  color: "#2e86de",
  cursor: "pointer",
  textAlign: "center" as const,
};

// Entry page: "Stream" mounts the live app (its polling starts on mount, so it must not be
// mounted before the choice); "Load" will rebuild the graphs from the Benders log files (TODO).
export default function Root() {
  // A reload caused by a new run (POST /set, see App) must come back to the stream, same save name.
  const resumed = sessionStorage.getItem("skipReset") === "1" ? sessionStorage.getItem("saveName") : null;
  const [mode, setMode] = useState<Mode>(resumed !== null ? "stream" : "choose");
  const [saveName, setSaveName] = useState(resumed ?? "");
  const [askName, setAskName] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The server auto-saves to this name when the run ends; the name is also what Save/Load use.
  const startStream = async () => {
    try {
      const res = await fetch("/api/save_name", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: saveName }),
      });
      const json = await res.json();
      if (!res.ok) return setError(json.error ?? "Invalid name");
      sessionStorage.setItem("saveName", json.name);
      setSaveName(json.name);
      setMode("stream");
    } catch {
      setError("Server not reachable");
    }
  };

  if (mode === "stream") return <App saveName={saveName} />;

  if (mode === "load") {
    return (
      <div style={{ padding: 32, color: "#222" }}>
        <button onClick={() => setMode("choose")} style={{ marginBottom: 16, cursor: "pointer" }}>
          ← Back
        </button>
        <div style={{ color: "#777", fontSize: 14 }}>Loading from log files is not implemented yet.</div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 32, color: "#222" }}>
      <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600 }}>Benders</h1>
      <div style={{ display: "flex", gap: 24 }}>
        <button style={card} onClick={() => setAskName(true)}>
          <div style={{ fontSize: 18, fontWeight: 600 }}>Stream</div>
          <div style={{ fontSize: 13, color: "#777", marginTop: 8 }}>Follow a running Benders live</div>
        </button>
        <button style={card} onClick={() => setMode("load")}>
          <div style={{ fontSize: 18, fontWeight: 600 }}>Load</div>
          <div style={{ fontSize: 13, color: "#777", marginTop: 8 }}>Rebuild graphs from log files</div>
        </button>
      </div>
      {askName && (
        <div
          onClick={() => setAskName(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10 }}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              void startStream();
            }}
            style={{ background: "#fff", borderRadius: 8, padding: 20, width: 340, boxShadow: "0 8px 30px rgba(0,0,0,0.2)" }}
          >
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 10 }}>Save this run as</div>
            <input
              autoFocus
              value={saveName}
              onChange={(e) => {
                setSaveName(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => e.key === "Escape" && setAskName(false)}
              placeholder="benders_save"
              style={{ width: "100%", boxSizing: "border-box", padding: "6px 8px", border: "1px solid #ccc", borderRadius: 6, fontSize: 14 }}
            />
            <div style={{ fontSize: 12, color: error ? "#c0392b" : "#777", margin: "6px 0 14px" }}>
              {error ?? "Saved as <name>.json in the project root, automatically when the run ends and on Save."}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button type="button" onClick={() => setAskName(false)} style={{ padding: "6px 14px", border: "1px solid #ccc", borderRadius: 6, background: "#fff", fontSize: 13, cursor: "pointer" }}>
                Cancel
              </button>
              <button type="submit" style={{ padding: "6px 14px", border: "1px solid #2e86de", borderRadius: 6, background: "#2e86de", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                Start
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
