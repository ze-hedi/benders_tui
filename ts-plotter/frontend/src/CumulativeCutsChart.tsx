import { useMemo } from "react";
import { Bar } from "react-chartjs-2";
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip, Legend } from "chart.js";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

// Cumulative number of cuts in the master at each iteration; `items[i]` = cuts added at iteration i+1.
export default function CumulativeCutsChart({ items }: { items: number[] }) {
  const cumulative = useMemo(() => {
    let sum = 0;
    return items.map((n) => (sum += n));
  }, [items]);

  if (!items.length) {
    return <div style={{ color: "#777", fontSize: 14 }}>Waiting for added cuts…</div>;
  }

  return (
    <Bar
      options={{
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
          legend: { position: "top" },
          tooltip: { callbacks: { afterLabel: (ctx) => `Added this iteration: ${items[ctx.dataIndex]}` } },
        },
        scales: {
          x: { title: { display: true, text: "Benders iteration" }, grid: { display: false } },
          y: { title: { display: true, text: "Cumulative cuts added" }, beginAtZero: true, grid: { color: "#f0f0f0" } },
        },
      }}
      data={{
        labels: items.map((_, i) => i + 1),
        datasets: [{ label: "Cumulative cuts", backgroundColor: "#2e86de", data: cumulative, categoryPercentage: 1, barPercentage: 0.95 }],
      }}
    />
  );
}
