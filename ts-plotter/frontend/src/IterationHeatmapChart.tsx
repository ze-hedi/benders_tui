import { useMemo } from "react";

import type { AddedConstraints } from "./ConstraintsChart";

// DECISION: for one master iteration, cell (a, b) = Jaccard similarity |Ca ∩ Cb| / |Ca ∪ Cb| of the
// sets of constraints added by subproblems a and b during that iteration (union over micro-iterations).
// Symmetric, diagonal = 100%. Mirror of HeatmapChart (which compares iterations for one subproblem).
const CELL = 34;
const LABEL = 120;

// White (0%) -> blue (100%).
const colorFor = (pct: number) => `hsl(213 ${20 + pct * 0.7}% ${97 - pct * 0.5}%)`;

export function masterIterations(items: AddedConstraints[]): number[] {
  return [...new Set(items.map((it) => it.num_master_iter))].sort((a, b) => a - b);
}

export default function IterationHeatmapChart({ items, iter }: { items: AddedConstraints[]; iter: number }) {
  const { subs, pct, sizes } = useMemo(() => {
    const bySub = new Map<string, Set<string>>();
    for (const it of items) {
      if (it.num_master_iter !== iter) continue;
      let set = bySub.get(it.sub_name);
      if (!set) bySub.set(it.sub_name, (set = new Set()));
      for (const c of it.constraints) set.add(c.name);
    }
    const subs = [...bySub.keys()].sort();
    const sets = subs.map((s) => bySub.get(s)!);
    const pct = sets.map((a, i) =>
      sets.map((b, j) => {
        if (i === j) return 100;
        const [small, large] = a.size <= b.size ? [a, b] : [b, a];
        let common = 0;
        for (const n of small) if (large.has(n)) common++;
        const union = a.size + b.size - common;
        return union ? (100 * common) / union : 0;
      }),
    );
    return { subs, pct, sizes: sets.map((s) => s.size) };
  }, [items, iter]);

  if (!subs.length) {
    return <div style={{ color: "#777", fontSize: 14 }}>No added constraints received for iteration {iter} yet…</div>;
  }

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>Iteration {iter}</div>
      <div style={{ color: "#777", fontSize: 12, marginBottom: 12 }}>
        % of common added constraints between subproblems (shared / total distinct)
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `${LABEL}px repeat(${subs.length}, ${CELL}px)`,
            width: "max-content",
          }}
        >
          <div />
          {subs.map((s) => (
            <div
              key={`c${s}`}
              title={s}
              style={{ fontSize: 11, textAlign: "center", color: "#555", paddingBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
            >
              {s}
            </div>
          ))}
          {subs.map((s, i) => (
            <Row key={s} label={s} values={pct[i]} subs={subs} sizes={sizes} i={i} iter={iter} />
          ))}
        </div>
      </div>
    </div>
  );
}

function Row({ label, values, subs, sizes, i, iter }: { label: string; values: number[]; subs: string[]; sizes: number[]; i: number; iter: number }) {
  return (
    <>
      <div
        title={label}
        style={{ fontSize: 11, color: "#555", display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: 6, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}
      >
        {label}
      </div>
      {values.map((v, j) => (
        <div
          key={j}
          title={`Iteration ${iter}, ${label} vs ${subs[j]}: ${v.toFixed(1)}% (${sizes[i]} / ${sizes[j]} constraints)`}
          style={{
            height: CELL,
            background: colorFor(v),
            border: "1px solid #fff",
            boxSizing: "border-box",
            fontSize: 10,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: v > 60 ? "#fff" : "#333",
          }}
        >
          {Math.round(v)}
        </div>
      ))}
    </>
  );
}
