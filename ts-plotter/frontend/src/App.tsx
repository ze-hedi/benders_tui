import { useEffect, useState } from "react";
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

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

interface PlotData {
  iteration: number[];
  lb: number[];
  ub: number[];
  best_ub: number[];
}

function App() {
  const [data, setData] = useState<PlotData>({ iteration: [], lb: [], ub: [], best_ub: [] });

  // Skip first iteration
  const skip = 1;
  const iterations = data.iteration.slice(skip);
  const ub = data.ub.slice(skip);
  const lb = data.lb.slice(skip);

  useEffect(() => {
    let id: ReturnType<typeof setInterval> | undefined;
    let cancelled = false;
    // Page load/refresh starts a fresh graph: clear server-side data before polling.
    fetch("/api/reset", { method: "POST" })
      .catch(() => {})
      .then(() => {
        if (cancelled) return;
        id = setInterval(async () => {
          const res = await fetch("/api/data");
          setData(await res.json());
        }, 500);
      });
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", boxSizing: "border-box", padding: "24px 32px", background: "#fff", color: "#222" }}>
      <h1 style={{ margin: "0 0 16px", fontSize: 20, fontWeight: 600 }}>Benders convergence</h1>
      <div style={{ flex: 1, minHeight: 0, border: "1px solid #e5e7eb", borderRadius: 8, padding: 16 }}>
        <div style={{ position: "relative", width: "100%", height: "100%" }}>
        <Line
          options={{
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            plugins: { legend: { position: "top" } },
            scales: {
              x: { title: { display: true, text: "Iteration" }, border: { display: true, color: "#888" }, grid: { color: "#f0f0f0" } },
              y: {
                title: { display: true, text: "Value" },
                border: { display: true, color: "#888" },
                grid: { color: "#f0f0f0" },
                beginAtZero: !lb.length,
                min: lb.length ? Math.min(...lb) * 0.95 : undefined,
                max: ub.length ? Math.max(...ub) * 1.05 : undefined,
              },
            },
          }}
          data={{
            labels: iterations,
            datasets: [
              { label: "UB", data: ub, borderColor: "#e74c3c", borderWidth: 2, pointRadius: 2, fill: false, tension: 0.2 },
              { label: "LB", data: lb, borderColor: "#2e86de", borderWidth: 2, pointRadius: 2, fill: false, tension: 0.2 },
            ],
          }}
        />
        </div>
      </div>
    </div>
  );
}

export default App;
