// Viridis-like stops: purple (0%) -> teal (50%) -> yellow (100%)
const STOPS: [number, number, number][] = [
  [68, 1, 84],
  [59, 82, 139],
  [33, 145, 140],
  [94, 201, 98],
  [253, 231, 37],
];

export const heatColor = (pct: number): string => {
  const t = Math.min(1, Math.max(0, pct / 100)) * (STOPS.length - 1);
  const i = Math.min(STOPS.length - 2, Math.floor(t));
  const f = t - i;
  const [r, g, b] = STOPS[i].map((c, k) => Math.round(c + (STOPS[i + 1][k] - c) * f));
  return `rgb(${r}, ${g}, ${b})`;
};

// Light text on the dark (purple/teal) half, dark text on the bright (green/yellow) half.
export const heatTextColor = (pct: number): string => (pct < 60 ? "#fff" : "#222");

import type { AddedConstraints } from "./ConstraintsChart";

export type HeatSource = "all" | "active";

// Constraint names compared by the heatmaps for one group of records (same sub + master iteration):
// "all" = every constraint added over the micro-iterations; "active" = the saturated constraints
// at the final micro-iteration.
export function constraintSet(records: AddedConstraints[], source: HeatSource): Set<string> {
  if (source === "all") return new Set(records.flatMap((r) => r.constraints.map((c) => c.name)));
  const last = records.reduce<AddedConstraints | null>((m, r) => (!m || r.num_micro_iter > m.num_micro_iter ? r : m), null);
  return new Set(last?.active_constraints ?? []);
}
