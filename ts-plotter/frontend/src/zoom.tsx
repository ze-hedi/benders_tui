import { useReducer, useRef } from "react";
import { Chart as ChartJS } from "chart.js";
import zoomPlugin from "chartjs-plugin-zoom";

ChartJS.register(zoomPlugin);

interface Range {
  min: number;
  max: number;
}
interface Saved {
  x?: Range;
  y?: Range;
}

// Wheel/pinch to zoom, drag to pan (like an image viewer). The zoomed range is mirrored into
// `saved` so charts can re-apply it as scale min/max when live data re-renders them,
// otherwise every incoming point would reset the view.
export function useChartZoom() {
  const chartRef = useRef<ChartJS | null>(null);
  const saved = useRef<Saved>({});
  const [, rerender] = useReducer((n: number) => n + 1, 0);

  const capture = ({ chart }: { chart: ChartJS }) => {
    const { x, y } = chart.scales;
    saved.current = {
      x: x ? { min: x.min, max: x.max } : undefined,
      y: y ? { min: y.min, max: y.max } : undefined,
    };
  };

  const plugin = {
    zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: "xy" as const, onZoom: capture },
    pan: { enabled: true, mode: "xy" as const, onPan: capture },
  };

  const reset = () => {
    saved.current = {};
    chartRef.current?.resetZoom();
    rerender();
  };

  return { chartRef, saved, plugin, reset };
}

export function ResetZoomButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        zIndex: 1,
        padding: "4px 10px",
        fontSize: 12,
        border: "1px solid #d0d5dd",
        borderRadius: 6,
        background: "#fff",
        color: "#444",
        cursor: "pointer",
      }}
    >
      Reset zoom
    </button>
  );
}
