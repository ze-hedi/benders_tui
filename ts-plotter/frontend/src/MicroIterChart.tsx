import { useMemo, useState } from "react";
import { Bar } from "react-chartjs-2";
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip, Legend } from "chart.js";

import { ResetZoomButton, useChartZoom } from "./zoom";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

export interface MicroIter {
  rank: number;
  sub_name: string;
  num_master_iter: number;
  num_micro_iter: number;
  nb_added_constraints: number;
  solving_time: number;
  elapsed_time: number;
  n_saturated_constraints: number;
  n_all_constraints: number;
  n_added_constraints_N: number;
  n_added_constraints_NK: number;
}

const colorFor = (micro: number) => `hsl(${(micro * 137.508) % 360} 65% 52%)`;

export default function MicroIterChart({ items, sub }: { items: MicroIter[]; sub: string }) {
  const { chartRef, saved, plugin, reset } = useChartZoom();
  const [detail, setDetail] = useState(false);
  const [selectedMaster, setSelectedMaster] = useState<number | null>(null);
  const { masters, micros, cell } = useMemo(() => {
    const cell = new Map<string, MicroIter>();
    const masterSet = new Set<number>();
    const microSet = new Set<number>();
    for (const it of items) {
      if (it.sub_name !== sub) continue;
      cell.set(`${it.num_master_iter}:${it.num_micro_iter}`, it);
      masterSet.add(it.num_master_iter);
      microSet.add(it.num_micro_iter);
    }
    const asc = (a: number, b: number) => a - b;
    return { cell, masters: [...masterSet].sort(asc), micros: [...microSet].sort(asc) };
  }, [items, sub]);

  const lookup = (master: number, micro: number) => cell.get(`${master}:${micro}`);

  if (!masters.length) {
    return <div style={{ color: "#777", fontSize: 14 }}>No micro-iterations received for {sub} yet…</div>;
  }

  const sx = saved.current.x;
  const sy = saved.current.y;

  // N / NK detail: one pair of bars per micro-iteration of the chosen Benders iteration.
  // Derived from `items` on every render, so it updates as new micro-iterations arrive.
  const detailMicros =
    selectedMaster === null ? [] : micros.filter((micro) => lookup(selectedMaster, micro));

  const toolbar = (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
      <button
        onClick={() => setDetail((d) => !d)}
        style={{
          padding: "4px 12px",
          border: "1px solid #2e86de",
          borderRadius: 6,
          background: detail ? "#2e86de" : "#fff",
          color: detail ? "#fff" : "#2e86de",
          fontSize: 13,
          cursor: "pointer",
        }}
      >
        {detail ? "Back to time chart" : "N / NK constraints"}
      </button>
      {detail && (
        <select
          value={selectedMaster ?? ""}
          onChange={(e) => setSelectedMaster(e.target.value === "" ? null : Number(e.target.value))}
          style={{ padding: "4px 8px", fontSize: 13 }}
        >
          <option value="">Select an iteration…</option>
          {masters.map((m) => (
            <option key={m} value={m}>
              Iteration {m}
            </option>
          ))}
        </select>
      )}
    </div>
  );

  if (detail) {
    return (
      <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%" }}>
        {toolbar}
        <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
          {selectedMaster === null ? (
            <div style={{ color: "#777", fontSize: 14 }}>Select an iteration to see its N / NK constraints.</div>
          ) : (
            <Bar
              options={{
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                plugins: {
                  legend: { position: "top" },
                  title: { display: true, text: `${sub} · iteration ${selectedMaster}` },
                },
                scales: {
                  x: { title: { display: true, text: "Micro-iteration" }, grid: { display: false } },
                  y: { title: { display: true, text: "Added constraints" }, beginAtZero: true, ticks: { precision: 0 }, grid: { color: "#f0f0f0" } },
                },
              }}
              data={{
                labels: detailMicros,
                datasets: [
                  {
                    label: "N",
                    backgroundColor: "#2e86de",
                    data: detailMicros.map((micro) => lookup(selectedMaster, micro)!.n_added_constraints_N),
                  },
                  {
                    label: "NK",
                    backgroundColor: "#e67e22",
                    data: detailMicros.map((micro) => lookup(selectedMaster, micro)!.n_added_constraints_NK),
                  },
                ],
              }}
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%" }}>
      {toolbar}
      <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
      <ResetZoomButton onClick={reset} />
      <Bar
        ref={chartRef as never}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          interaction: { mode: "nearest", intersect: true },
          plugins: {
            zoom: plugin,
            legend: { position: "top" },
            title: { display: true, text: sub },
            tooltip: {
              callbacks: {
                title: (ctx) => `Iteration ${ctx[0].label} · micro-iteration ${ctx[0].dataset.label?.replace("Micro ", "")}`,
                label: (ctx) => {
                  const it = lookup(masters[ctx.dataIndex], micros[ctx.datasetIndex]);
                  if (!it) return "";
                  const lines = [
                    `elapsed_time: ${it.elapsed_time}`,
                    `solving_time: ${it.solving_time}`,
                    `added constraints: ${it.nb_added_constraints}`,
                  ];
                  if (it.n_all_constraints > 0) {
                    const rate = (100 * it.n_saturated_constraints) / it.n_all_constraints;
                    lines.push(`saturated constraint rate: ${rate.toFixed(1)}%`);
                  }
                  return lines;
                },
              },
            },
          },
          scales: {
            x: { stacked: true, title: { display: true, text: "Benders iteration" }, border: { display: true, color: "#888" }, grid: { display: false }, min: sx?.min, max: sx?.max },
            y: { stacked: true, title: { display: true, text: "elapsed_time + solving_time" }, border: { display: true, color: "#888" }, grid: { color: "#f0f0f0" }, beginAtZero: true, min: sy?.min, max: sy?.max },
          },
        }}
        data={{
          labels: masters,
          datasets: micros.map((micro) => ({
            label: `Micro ${micro}`,
            backgroundColor: colorFor(micro),
            borderColor: "#fff",
            borderWidth: 1,
            data: masters.map((m) => {
              const it = lookup(m, micro);
              return it ? it.elapsed_time + it.solving_time : null;
            }),
          })),
        }}
      />
      </div>
    </div>
  );
}
