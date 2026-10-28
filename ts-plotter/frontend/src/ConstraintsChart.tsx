import { useMemo } from "react";
import { Bar } from "react-chartjs-2";
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip, Legend } from "chart.js";

import { ResetZoomButton, useChartZoom } from "./zoom";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

// One record per (sub, master, micro), posted by every rank to /added_constraints.
export interface AddedConstraints {
  rank: number;
  sub_name: string;
  num_master_iter: number;
  num_micro_iter: number;
  constraints: { name: string; is_N: boolean }[];
}

// Same layout as MicroIterChart (one stacked bar per Benders iteration, one segment per
// micro-iteration) but each segment is the number of constraints added at that micro-iteration.
const colorFor = (micro: number) => `hsl(${(micro * 137.508) % 360} 65% 52%)`;

export default function ConstraintsChart({ items, sub }: { items: AddedConstraints[]; sub: string }) {
  const { chartRef, saved, plugin, reset } = useChartZoom();
  const { masters, micros, cell } = useMemo(() => {
    const cell = new Map<string, AddedConstraints>();
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
    return <div style={{ color: "#777", fontSize: 14 }}>No added constraints received for {sub} yet…</div>;
  }

  const sx = saved.current.x;
  const sy = saved.current.y;

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
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
                  const nbN = it.constraints.filter((k) => k.is_N).length;
                  const preview = it.constraints.slice(0, 5).map((k) => `  ${k.name} (${k.is_N ? "N" : "N-1"})`);
                  const more = it.constraints.length - preview.length;
                  return [
                    `added constraints: ${it.constraints.length}`,
                    `N: ${nbN} · N-1: ${it.constraints.length - nbN}`,
                    ...preview,
                    ...(more > 0 ? [`  … ${more} more`] : []),
                  ];
                },
              },
            },
          },
          scales: {
            x: { stacked: true, title: { display: true, text: "Benders iteration" }, border: { display: true, color: "#888" }, grid: { display: false }, min: sx?.min, max: sx?.max },
            y: { stacked: true, title: { display: true, text: "Added constraints" }, border: { display: true, color: "#888" }, grid: { color: "#f0f0f0" }, beginAtZero: true, min: sy?.min, max: sy?.max },
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
              return it ? it.constraints.length : null;
            }),
          })),
        }}
      />
    </div>
  );
}
