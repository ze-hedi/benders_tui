import { useEffect, useState } from "react";

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

// Read and consume the flag once per page load, at module level: StrictMode runs effects and
// initializers twice, so consuming it inside them would lose it on the second run.
const RESUMED_NAME = sessionStorage.getItem("skipReset") === "1" ? sessionStorage.getItem("saveName") : null;
sessionStorage.removeItem("skipReset");

interface SaveFile {
  name: string;
  modified: number;
  size: number;
}

// Entry page: "Stream" mounts the live app (its polling starts on mount, so it must not be
// mounted before the choice); "Load" lists the saved runs and opens the chosen one.
export default function Root() {
  // A reload caused by a new run (POST /set, see App) must come back to the stream, same save name.
  const resumed = RESUMED_NAME;
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

  const [saves, setSaves] = useState<SaveFile[] | null>(null);
  const [loadName, setLoadName] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== "load") return;
    setSaves(null);
    setError(null);
    fetch("/api/saves")
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error);
        setSaves(json);
      })
      .catch((e) => {
        setSaves([]);
        setError(e.message || "Server not reachable");
      });
  }, [mode]);

  if (mode === "stream") return <App saveName={saveName} fromNewRun={resumed !== null} />;
  if (mode === "load" && loadName) return <App saveName={loadName} fromNewRun={false} loadName={loadName} />;

  if (mode === "load") {
    return (
      <div style={{ maxWidth: 520, margin: "0 auto", padding: 32, color: "#222" }}>
        <button onClick={() => setMode("choose")} style={{ marginBottom: 16, cursor: "pointer" }}>
          ← Back
        </button>
        <h2 style={{ margin: "0 0 16px", fontSize: 20, fontWeight: 600 }}>Load a saved run</h2>
        {error && <div style={{ color: "#c0392b", fontSize: 14 }}>{error}</div>}
        {saves === null && <div style={{ color: "#777", fontSize: 14 }}>Loading…</div>}
        {saves?.length === 0 && !error && <div style={{ color: "#777", fontSize: 14 }}>No saved runs found.</div>}
        {saves?.map((s) => (
          <button
            key={s.name}
            onClick={() => setLoadName(s.name)}
            style={{ display: "flex", justifyContent: "space-between", width: "100%", padding: "10px 14px", marginBottom: 8, border: "1px solid #e5e7eb", borderRadius: 6, background: "#fff", color: "#2e86de", fontSize: 14, cursor: "pointer", textAlign: "left" }}
          >
            <span style={{ fontWeight: 600 }}>{s.name}</span>
            <span style={{ color: "#777", fontSize: 12 }}>
              {new Date(s.modified).toLocaleString()} · {(s.size / 1024).toFixed(0)} KB
            </span>
          </button>
        ))}
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
          <div style={{ fontSize: 13, color: "#777", marginTop: 8 }}>Open a saved run</div>
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
