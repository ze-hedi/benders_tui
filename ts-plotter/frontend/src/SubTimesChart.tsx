import { useMemo } from "react";
import { Line } from "react-chartjs-2";
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend } from "chart.js";
import type { MicroIter } from "./MicroIterChart";
import { ResetZoomButton, useChartZoom } from "./zoom";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

const colorFor = (i: number) => `hsl(${(i * 137.508) % 360} 65% 48%)`;

// Full time of each subproblem per Benders iteration = sum over its micro-iterations of
// elapsed_time + solving_time. Derived from the micro-iteration stream, no extra fetch.
export default function SubTimesChart({ items, subNames }: { items: MicroIter[]; subNames: string[] }) {
  const { chartRef, saved, plugin, reset } = useChartZoom();

  const { masters, totals, names } = useMemo(() => {
    const totals = new Map<string, Map<number, number>>();
    const masterSet = new Set<number>();
    for (const it of items) {
      let perMaster = totals.get(it.sub_name);
      if (!perMaster) totals.set(it.sub_name, (perMaster = new Map()));
      perMaster.set(it.num_master_iter, (perMaster.get(it.num_master_iter) ?? 0) + it.elapsed_time + it.solving_time);
      masterSet.add(it.num_master_iter);
    }
    const known = new Set(subNames);
    const names = [...subNames, ...[...totals.keys()].filter((n) => !known.has(n))];
    return { totals, names, masters: [...masterSet].sort((a, b) => a - b) };
  }, [items, subNames]);

  if (!masters.length) {
    return <div style={{ color: "#777", fontSize: 14 }}>Waiting for micro-iterations…</div>;
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
          interaction: { mode: "nearest", intersect: false },
          plugins: { legend: { position: "top" }, zoom: plugin },
          scales: {
            x: { title: { display: true, text: "Benders iteration" }, border: { display: true, color: "#888" }, grid: { color: "#f0f0f0" }, min: sx?.min, max: sx?.max },
            y: { title: { display: true, text: "Total subproblem time" }, border: { display: true, color: "#888" }, grid: { color: "#f0f0f0" }, beginAtZero: true, min: sy?.min, max: sy?.max },
          },
        }}
        data={{
          labels: masters,
          datasets: names.map((name, i) => ({
            label: name,
            borderColor: colorFor(i),
            backgroundColor: colorFor(i),
            borderWidth: 2,
            pointRadius: 2,
            spanGaps: true,
            tension: 0.2,
            data: masters.map((m) => totals.get(name)?.get(m) ?? null),
          })),
        }}
      />
    </div>
  );
}
