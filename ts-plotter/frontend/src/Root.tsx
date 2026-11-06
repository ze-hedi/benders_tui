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
  const [mode, setMode] = useState<Mode>("choose");

  if (mode === "stream") return <App />;

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
        <button style={card} onClick={() => setMode("stream")}>
          <div style={{ fontSize: 18, fontWeight: 600 }}>Stream</div>
          <div style={{ fontSize: 13, color: "#777", marginTop: 8 }}>Follow a running Benders live</div>
        </button>
        <button style={card} onClick={() => setMode("load")}>
          <div style={{ fontSize: 18, fontWeight: 600 }}>Load</div>
          <div style={{ fontSize: 13, color: "#777", marginTop: 8 }}>Rebuild graphs from log files</div>
        </button>
      </div>
    </div>
  );
}
