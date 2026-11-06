import { useMemo, useState } from "react";
import { Bar } from "react-chartjs-2";
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip, Legend } from "chart.js";

import type { AddedConstraints } from "./ConstraintsChart";
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

export default function MicroIterChart({
  items,
  addedItems,
  sub,
}: {
  items: MicroIter[];
  addedItems: AddedConstraints[];
  sub: string;
}) {
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

  // Saturation detail: one bar per micro-iteration of the chosen Benders iteration.
  // Derived from `items` on every render, so it updates as new micro-iterations arrive.
  const detailMicros = micros.filter((micro) => lookup(selectedMaster ?? -1, micro));
  const pct = (num: number, den: number) => (den > 0 ? (100 * num) / den : null);
  // Number of added constraints with is_inc = false at (selectedMaster, micro), from /added_constraints.
  // The saturation measured at micro k concerns the constraints added at micro k-1, so look up k-1.
  const nbNotInc = new Map<number, number>();
  for (const a of addedItems) {
    if (a.sub_name === sub && a.num_master_iter === selectedMaster) {
      nbNotInc.set(a.num_micro_iter, a.constraints.filter((c) => !c.is_inc).length);
    }
  }

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
        {detail ? "Back to micro-iterations chart" : "Saturated constraint rate"}
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
            <div style={{ color: "#777", fontSize: 14 }}>Select an iteration to see its saturated constraint rates.</div>
          ) : (
            <Bar
              options={{
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                plugins: {
                  legend: { position: "top" },
                  title: { display: true, text: `${sub} · iteration ${selectedMaster}` },
                  tooltip: {
                    callbacks: {
                      label: (ctx) => {
                        const micro = detailMicros[ctx.dataIndex];
                        const it = lookup(selectedMaster, micro);
                        if (!it) return "";
                        const den = ctx.datasetIndex === 0 ? it.n_all_constraints : nbNotInc.get(micro - 1) ?? 0;
                        return `${ctx.dataset.label}: ${it.n_saturated_constraints} / ${den}`;
                      },
                    },
                  },
                },
                scales: {
                  x: { title: { display: true, text: "Micro-iteration" }, grid: { display: false } },
                  y: { title: { display: true, text: "Saturated constraint rate (%)" }, beginAtZero: true, suggestedMax: 100, grid: { color: "#f0f0f0" } },
                },
              }}
              data={{
                labels: detailMicros,
                datasets: [
                  {
                    label: "Saturated / all constraints",
                    backgroundColor: "#16a085",
                    data: detailMicros.map((micro) => {
                      const it = lookup(selectedMaster, micro)!;
                      return pct(it.n_saturated_constraints, it.n_all_constraints);
                    }),
                  },
                  {
                    label: "Saturated / added constraints (is_inc = false)",
                    backgroundColor: "#8e44ad",
                    data: detailMicros.map((micro) =>
                      pct(lookup(selectedMaster, micro)!.n_saturated_constraints, nbNotInc.get(micro - 1) ?? 0),
                    ),
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
                  return [
                    `elapsed_time: ${it.elapsed_time}`,
                    `solving_time: ${it.solving_time}`,
                    `added constraints: ${it.nb_added_constraints}`,
                  ];
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
