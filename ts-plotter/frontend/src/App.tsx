import { useEffect, useRef, useState } from "react";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";

import MicroIterChart, { type MicroIter } from "./MicroIterChart";
import ConstraintsChart, { type AddedConstraints } from "./ConstraintsChart";
import HeatmapChart from "./HeatmapChart";
import type { HeatSource } from "./heatmapColor";
import IterationHeatmapChart, { masterIterations } from "./IterationHeatmapChart";
import SubTimesChart from "./SubTimesChart";
import CumulativeCutsChart from "./CumulativeCutsChart";
import MasterTimesChart, { type MasterTime } from "./MasterTimesChart";
import { ResetZoomButton, useChartZoom } from "./zoom";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

interface PlotData {
  iteration: number[];
  lb: number[];
  ub: number[];
  best_ub: number[];
}

type Tab = "convergence" | "subproblems" | "master-times";
type SubView = "micro-iterations" | "sub-times" | "constraints" | "heatmap";
type HeatMode = "per-iteration" | "per-subproblem";
const TABS: { id: Tab; label: string }[] = [
  { id: "convergence", label: "Convergence" },
  { id: "subproblems", label: "Subproblems" },
  { id: "master-times", label: "Master" },
];
const SUB_VIEWS: { id: SubView; label: string }[] = [
  { id: "micro-iterations", label: "Micro-iterations" },
  { id: "sub-times", label: "Subproblem times" },
  { id: "constraints", label: "Constraints" },
  { id: "heatmap", label: "Heatmap" },
];
const HEAT_MODES: { id: HeatMode; label: string }[] = [
  { id: "per-iteration", label: "Common per iteration" },
  { id: "per-subproblem", label: "Common per subproblem" },
];

// saveName: file chosen on the landing page; Save and Load use it, and the server auto-saves to it.
// loadName: when set, the app opens on that saved snapshot instead of following a live run.
function App({ saveName, fromNewRun, loadName }: { saveName: string; fromNewRun: boolean; loadName?: string }) {
  const [data, setData] = useState<PlotData>({ iteration: [], lb: [], ub: [], best_ub: [] });
  const [tab, setTab] = useState<Tab>("convergence");
  const [subNames, setSubNames] = useState<string[]>([]);
  const [subView, setSubView] = useState<SubView>("micro-iterations");
  const [heatMode, setHeatMode] = useState<HeatMode>("per-iteration");
  const [heatSource, setHeatSource] = useState<HeatSource>("all");
  const [selectedSub, setSelectedSub] = useState<string | null>(null);
  // null = follow the latest master iteration as new ones arrive
  const [selectedIter, setSelectedIter] = useState<number | null>(null);
  const zoom = useChartZoom();
  // Convergence curves hidden via the legend; the y axis rescales to the visible ones only.
  const [hiddenSeries, setHiddenSeries] = useState<Record<string, boolean>>({});
  const [microIters, setMicroIters] = useState<MicroIter[]>([]);
  const [masterTimes, setMasterTimes] = useState<MasterTime[]>([]);
  const [addedCuts, setAddedCuts] = useState<number[]>([]);
  const [addedConstraints, setAddedConstraints] = useState<AddedConstraints[]>([]);

  const stopPolling = useRef<() => void>(() => {});
  const [status, setStatus] = useState<string | null>(null);


  const save = async () => {
    try {
      const res = await fetch("/api/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: saveName }),
      });
      const json = await res.json();
      setStatus(res.ok ? "Saved" : (json.error ?? "Save failed"));
    } catch {
      setStatus("Save failed: server not reachable");
    }
  };

  const load = async (name: string = saveName) => {
    try {
      const res = await fetch("/api/load", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const json = await res.json();
      if (!res.ok) return setStatus(json.error ?? "Load failed");
      stopPolling.current(); // the loaded snapshot is final: stop live streams
      setData(json.data);
      setSubNames(json.subproblemNames);
      setSelectedSub(json.subproblemNames[0] ?? null);
      setMicroIters(json.microIters);
      setMasterTimes(json.masterTimes);
      setAddedCuts(json.addedCuts ?? []);
      setAddedConstraints(json.addedConstraints);
      setStatus("Loaded");
    } catch {
      setStatus("Load failed: server not reachable");
    }
  };

  useEffect(() => {
    if (!status) return;
    const t = setTimeout(() => setStatus(null), 3000);
    return () => clearTimeout(t);
  }, [status]);

  // Skip first iteration
  const skip = 1;
  const iterations = data.iteration.slice(skip);
  const ub = data.ub.slice(skip);
  const lb = data.lb.slice(skip);
  const bestUb = data.best_ub.slice(skip);

  useEffect(() => {
    let cancelled = false;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    // The server flags the end of the algorithm on every /api response (POST /end). The flag is
    // only set after all data was posted, so the response carrying it is the last one needed.
    const isEnded = (res: Response) => res.headers.get("X-Ended") === "true";

    // UB/LB stream: runs for the lifetime of the page, independent of the subproblem fetch.
    const pollData = async () => {
      while (!cancelled) {
        try {
          const res = await fetch("/api/data");
          const json: PlotData = await res.json();
          if (!cancelled) setData(json);
          if (isEnded(res)) return;
        } catch {
          // server not reachable, retry on next tick
        }
        await sleep(500);
      }
    };

    // Subproblem names: polled every 5 ms, ends as soon as they are received.
    const pollSubproblems = async () => {
      while (!cancelled) {
        try {
          const res = await fetch("/api/set");
          const names: string[] = await res.json();
          if (names.length) {
            if (!cancelled) {
              setSubNames(names);
              setSelectedSub((cur) => cur ?? names[0]);
            }
            return;
          }
          if (isEnded(res)) return;
        } catch {
          // server not reachable, retry on next tick
        }
        await sleep(5);
      }
    };

    // Micro-iterations: incremental stream, appended to App-level state so it survives
    // tab/subproblem switches. `received` is only touched by this loop.
    const pollMicroIters = async () => {
      let received = 0;
      while (!cancelled) {
        try {
          const res = await fetch(`/api/micro_iter?since=${received}`);
          const json: { total: number; items: MicroIter[] } = await res.json();
          if (!cancelled && json.items.length) {
            received += json.items.length;
            setMicroIters((cur) => cur.concat(json.items));
          }
          if (isEnded(res)) return;
        } catch {
          // server not reachable, retry on next tick
        }
        await sleep(300);
      }
    };

    // Master times: incremental stream, same pattern as micro-iterations.
    const pollMasterTimes = async () => {
      let received = 0;
      while (!cancelled) {
        try {
          const res = await fetch(`/api/master_times?since=${received}`);
          const json: { total: number; items: MasterTime[] } = await res.json();
          if (!cancelled && json.items.length) {
            received += json.items.length;
            setMasterTimes((cur) => cur.concat(json.items));
          }
          if (isEnded(res)) return;
        } catch {
          // server not reachable, retry on next tick
        }
        await sleep(300);
      }
    };

    // Cuts added to the master per iteration: incremental stream, same pattern.
    const pollAddedCuts = async () => {
      let received = 0;
      while (!cancelled) {
        try {
          const res = await fetch(`/api/added_cuts?since=${received}`);
          const json: { total: number; items: number[] } = await res.json();
          if (!cancelled && json.items.length) {
            received += json.items.length;
            setAddedCuts((cur) => cur.concat(json.items));
          }
          if (isEnded(res)) return;
        } catch {
          // server not reachable, retry on next tick
        }
        await sleep(300);
      }
    };

    // Added constraints: incremental stream, same pattern; payloads can be large so poll less often.
    const pollAddedConstraints = async () => {
      let received = 0;
      while (!cancelled) {
        try {
          const res = await fetch(`/api/added_constraints?since=${received}`);
          const json: { total: number; items: AddedConstraints[] } = await res.json();
          if (!cancelled && json.items.length) {
            received += json.items.length;
            setAddedConstraints((cur) => cur.concat(json.items));
          }
          if (isEnded(res)) return;
        } catch {
          // server not reachable, retry on next tick
        }
        await sleep(1000);
      }
    };

    // Page load/refresh starts a fresh graph: clear server-side data, then start all
    // streams independently (none waits for another).
    // A reload triggered by a new run (POST /set) must keep the server state it just received.
    const events = new EventSource("/api/events");
    events.addEventListener("new-run", () => {
      sessionStorage.setItem("skipReset", "1");
      window.location.reload();
    });

    if (loadName) {
      // Opened from the Load page: show the snapshot, no live streams.
      void load(loadName);
      return () => {
        cancelled = true;
        events.close();
      };
    }

    (fromNewRun ? Promise.resolve() : fetch("/api/reset", { method: "POST" }))
      .catch(() => {})
      .then(() => {
        if (cancelled) return;
        void pollData();
        void pollSubproblems();
        void pollMicroIters();
        void pollMasterTimes();
        void pollAddedCuts();
        void pollAddedConstraints();
      });

    stopPolling.current = () => {
      cancelled = true;
    };
    return () => {
      cancelled = true;
      events.close();
    };
  }, []);

  const tabButton = (t: { id: Tab; label: string }) => (
    <button
      key={t.id}
      onClick={() => setTab(t.id)}
      style={{
        padding: "14px 20px",
        border: "none",
        borderBottom: tab === t.id ? "2px solid #2e86de" : "2px solid transparent",
        background: "transparent",
        color: tab === t.id ? "#2e86de" : "#555",
        fontSize: 14,
        fontWeight: 600,
        cursor: "pointer",
      }}
    >
      {t.label}
    </button>
  );

  const isView = (v: SubView) => tab === "subproblems" && subView === v;
  const showSidebar =
    (isView("micro-iterations") || isView("constraints") || (isView("heatmap") && heatMode === "per-iteration")) &&
    subNames.length > 0;
  const heatIters = masterIterations(addedConstraints);
  const currentIter = selectedIter ?? heatIters[heatIters.length - 1] ?? null;
  const showIterSidebar = isView("heatmap") && heatMode === "per-subproblem" && heatIters.length > 0;

  const series = [
    { label: "UB", data: ub, color: "#e74c3c" },
    { label: "LB", data: lb, color: "#2e86de" },
    { label: "Best UB", data: bestUb, color: "#27ae60" },
  ];
  const visibleValues = series.filter((x) => !hiddenSeries[x.label]).flatMap((x) => x.data);
  const yMin = visibleValues.length ? Math.min(...visibleValues) : undefined;
  const yMax = visibleValues.length ? Math.max(...visibleValues) : undefined;
  const yPad = yMin !== undefined && yMax !== undefined ? ((yMax - yMin) || Math.abs(yMax) || 1) * 0.05 : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", boxSizing: "border-box", background: "#fff", color: "#222" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 32px", borderBottom: "1px solid #e5e7eb" }}>
        <h1 style={{ margin: "0 24px 0 0", fontSize: 18, fontWeight: 600 }}>Benders</h1>
        {TABS.map(tabButton)}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          {status && <span style={{ fontSize: 13, color: "#555" }}>{status}</span>}
          {[["Save", save], ["Load", load]].map(([label, fn]) => (
            <button
              key={label as string}
              onClick={() => (fn as () => void)()}
              style={{ padding: "6px 14px", border: "1px solid #2e86de", borderRadius: 6, background: "#fff", color: "#2e86de", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
            >
              {label as string}
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
        {showSidebar && (
          <div style={{ width: 220, flexShrink: 0, overflowY: "auto", borderRight: "1px solid #e5e7eb", padding: "12px 0" }}>
            {subNames.map((name) => (
              <button
                key={name}
                onClick={() => setSelectedSub(name)}
                title={name}
                style={{
                  display: "block",
                  width: "100%",
                  padding: "8px 20px",
                  border: "none",
                  borderLeft: selectedSub === name ? "3px solid #2e86de" : "3px solid transparent",
                  background: selectedSub === name ? "#eef5fd" : "transparent",
                  color: selectedSub === name ? "#2e86de" : "#333",
                  textAlign: "left",
                  fontSize: 13,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  cursor: "pointer",
                }}
              >
                {name}
              </button>
            ))}
          </div>
        )}

        {showIterSidebar && (
          <div style={{ width: 220, flexShrink: 0, overflowY: "auto", borderRight: "1px solid #e5e7eb", padding: "12px 0" }}>
            {[...heatIters].reverse().map((it) => (
              <button
                key={it}
                onClick={() => setSelectedIter(it === heatIters[heatIters.length - 1] ? null : it)}
                style={{
                  display: "block",
                  width: "100%",
                  padding: "8px 20px",
                  border: "none",
                  borderLeft: currentIter === it ? "3px solid #2e86de" : "3px solid transparent",
                  background: currentIter === it ? "#eef5fd" : "transparent",
                  color: currentIter === it ? "#2e86de" : "#333",
                  textAlign: "left",
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                Iteration {it}
              </button>
            ))}
          </div>
        )}

        <div style={{ flex: 1, minWidth: 0, boxSizing: "border-box", padding: "24px 32px", display: "flex", flexDirection: "column" }}>
          <div style={{ display: tab === "convergence" ? "block" : "none", flex: 1, minHeight: 0, border: "1px solid #e5e7eb", borderRadius: 8, padding: 16 }}>
              <div style={{ position: "relative", width: "100%", height: "100%" }}>
                <ResetZoomButton onClick={zoom.reset} />
                <Line
                  ref={zoom.chartRef as never}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: false,
                    plugins: {
                      legend: {
                        position: "top",
                        onClick: (_e, item) => {
                          const label = item.text;
                          // drop the zoomed y range so the axis refits the remaining curves
                          zoom.saved.current = { ...zoom.saved.current, y: undefined };
                          setHiddenSeries((h) => ({ ...h, [label]: !h[label] }));
                        },
                      },
                      zoom: zoom.plugin,
                    },
                    scales: {
                      x: { title: { display: true, text: "Iteration" }, border: { display: true, color: "#888" }, grid: { color: "#f0f0f0" }, min: zoom.saved.current.x?.min, max: zoom.saved.current.x?.max },
                      y: {
                        title: { display: true, text: "Value" },
                        border: { display: true, color: "#888" },
                        grid: { color: "#f0f0f0" },
                        beginAtZero: !visibleValues.length,
                        min: zoom.saved.current.y?.min ?? (yMin !== undefined ? yMin - yPad : undefined),
                        max: zoom.saved.current.y?.max ?? (yMax !== undefined ? yMax + yPad : undefined),
                      },
                    },
                  }}
                  data={{
                    labels: iterations,
                    datasets: series.map((x) => ({
                      label: x.label,
                      data: x.data,
                      borderColor: x.color,
                      borderWidth: 2,
                      pointRadius: 2,
                      fill: false,
                      tension: 0.2,
                      hidden: !!hiddenSeries[x.label],
                    })),
                  }}
                />
              </div>
          </div>

          {tab === "subproblems" && (
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              {SUB_VIEWS.map((v) => (
                <button
                  key={v.id}
                  onClick={() => setSubView(v.id)}
                  style={{
                    padding: "6px 14px",
                    border: "1px solid #2e86de",
                    borderRadius: 6,
                    background: subView === v.id ? "#2e86de" : "#fff",
                    color: subView === v.id ? "#fff" : "#2e86de",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {v.label}
                </button>
              ))}
            </div>
          )}

          {isView("micro-iterations") &&
            (subNames.length === 0 || !selectedSub ? (
              <div style={{ color: "#777", fontSize: 14 }}>Waiting for subproblems…</div>
            ) : (
              <div style={{ flex: 1, minHeight: 0, border: "1px solid #e5e7eb", borderRadius: 8, padding: 16 }}>
                <MicroIterChart items={microIters} addedItems={addedConstraints} sub={selectedSub} />
              </div>
            ))}

          {isView("sub-times") && (
            <div style={{ flex: 1, minHeight: 0, border: "1px solid #e5e7eb", borderRadius: 8, padding: 16 }}>
              <SubTimesChart items={microIters} subNames={subNames} />
            </div>
          )}

          {tab === "master-times" && (
            <>
              <div style={{ flex: 1, minHeight: 0, border: "1px solid #e5e7eb", borderRadius: 8, padding: 16 }}>
                <MasterTimesChart items={masterTimes} />
              </div>
              <div style={{ flex: 1, minHeight: 0, border: "1px solid #e5e7eb", borderRadius: 8, padding: 16, marginTop: 16 }}>
                <CumulativeCutsChart items={addedCuts} />
              </div>
            </>
          )}

          {isView("constraints") &&
            (subNames.length === 0 || !selectedSub ? (
              <div style={{ color: "#777", fontSize: 14 }}>Waiting for subproblems…</div>
            ) : (
              <div style={{ flex: 1, minHeight: 0, border: "1px solid #e5e7eb", borderRadius: 8, padding: 16 }}>
                <ConstraintsChart items={addedConstraints} microItems={microIters} sub={selectedSub} />
              </div>
            ))}

          {isView("heatmap") && (
            <>
              <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                {HEAT_MODES.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setHeatMode(m.id)}
                    style={{
                      padding: "6px 14px",
                      border: "1px solid #2e86de",
                      borderRadius: 6,
                      background: heatMode === m.id ? "#2e86de" : "#fff",
                      color: heatMode === m.id ? "#fff" : "#2e86de",
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                {(["all", "active"] as const).map((src) => (
                  <button
                    key={src}
                    onClick={() => setHeatSource(src)}
                    style={{
                      padding: "4px 12px",
                      border: "1px solid #2e86de",
                      borderRadius: 6,
                      background: heatSource === src ? "#2e86de" : "#fff",
                      color: heatSource === src ? "#fff" : "#2e86de",
                      fontSize: 13,
                      cursor: "pointer",
                    }}
                  >
                    {src === "all" ? "All" : "Active"}
                  </button>
                ))}
              </div>

              {heatMode === "per-iteration" &&
                (subNames.length === 0 || !selectedSub ? (
                  <div style={{ color: "#777", fontSize: 14 }}>Waiting for subproblems…</div>
                ) : (
                  <div style={{ flex: 1, minHeight: 0, border: "1px solid #e5e7eb", borderRadius: 8, padding: 16 }}>
                    <HeatmapChart items={addedConstraints} sub={selectedSub} source={heatSource} />
                  </div>
                ))}

              {heatMode === "per-subproblem" &&
                (currentIter === null ? (
                  <div style={{ color: "#777", fontSize: 14 }}>Waiting for added constraints…</div>
                ) : (
                  <div style={{ flex: 1, minHeight: 0, border: "1px solid #e5e7eb", borderRadius: 8, padding: 16 }}>
                    <IterationHeatmapChart items={addedConstraints} iter={currentIter} source={heatSource} />
                  </div>
                ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
