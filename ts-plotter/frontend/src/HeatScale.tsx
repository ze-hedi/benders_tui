import { heatColor } from "./heatmapColor";

// Vertical color bar (100% at the top, 0% at the bottom) shown next to the heatmaps.
const TICKS = [100, 75, 50, 25, 0];
const gradient = `linear-gradient(to top, ${[0, 25, 50, 75, 100].map((p) => `${heatColor(p)} ${p}%`).join(", ")})`;

export default function HeatScale({ height = 480 }: { height?: number }) {
  return (
    <div style={{ display: "flex", flexShrink: 0, alignItems: "stretch", height, position: "sticky", top: 0, marginLeft: 16 }}>
      <div style={{ width: 16, background: gradient, border: "1px solid #ccc", boxSizing: "border-box" }} />
      <div style={{ position: "relative", width: 40, fontSize: 12, color: "#555" }}>
        {TICKS.map((t) => (
          <div key={t} style={{ position: "absolute", left: 6, top: `${100 - t}%`, transform: "translateY(-50%)" }}>
            {t}%
          </div>
        ))}
      </div>
    </div>
  );
}
