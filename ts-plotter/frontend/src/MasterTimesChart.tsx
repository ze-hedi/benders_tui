import { useMemo } from "react";
import { Line } from "react-chartjs-2";
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend } from "chart.js";
import { ResetZoomButton, useChartZoom } from "./zoom";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

export interface MasterTime {
  num_master_iter: number;
  elapsed_time: number;
  master_resolution_time: number;
}

// Master resolution time per Benders iteration; the tooltip also shows the elapsed (PTDF) time.
export default function MasterTimesChart({ items }: { items: MasterTime[] }) {
  const { chartRef, saved, plugin, reset } = useChartZoom();

  const sorted = useMemo(() => [...items].sort((a, b) => a.num_master_iter - b.num_master_iter), [items]);

  if (!sorted.length) {
    return <div style={{ color: "#777", fontSize: 14 }}>Waiting for master times…</div>;
  }

  const sx = saved.current.x;
  const sy = saved.current.y;

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <ResetZoomButton onClick={reset} />
      <Line
        ref={chartRef as never}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          interaction: { mode: "index", intersect: false },
          plugins: {
            legend: { position: "top" },
            zoom: plugin,
            tooltip: {
              callbacks: {
                label: (ctx) => {
                  const m = sorted[ctx.dataIndex];
                  return [`Resolution time: ${m.master_resolution_time}`, `Elapsed (PTDF): ${m.elapsed_time}`];
                },
              },
            },
          },
          scales: {
            x: { title: { display: true, text: "Benders iteration" }, border: { display: true, color: "#888" }, grid: { color: "#f0f0f0" }, min: sx?.min, max: sx?.max },
            y: { title: { display: true, text: "Master resolution time" }, border: { display: true, color: "#888" }, grid: { color: "#f0f0f0" }, beginAtZero: true, min: sy?.min, max: sy?.max },
          },
        }}
        data={{
          labels: sorted.map((m) => m.num_master_iter),
          datasets: [
            {
              label: "Master resolution time",
              borderColor: "#8e44ad",
              backgroundColor: "#8e44ad",
              borderWidth: 2,
              pointRadius: 2,
              tension: 0.2,
              data: sorted.map((m) => m.master_resolution_time),
            },
          ],
        }}
      />
    </div>
  );
}
