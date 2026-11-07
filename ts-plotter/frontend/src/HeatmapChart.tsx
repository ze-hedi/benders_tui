import { useMemo } from "react";

import type { AddedConstraints } from "./ConstraintsChart";
import HeatScale from "./HeatScale";

// DECISION: cell (i, j) = Jaccard similarity |Ci ∩ Cj| / |Ci ∪ Cj| of the sets of constraints
// added during master iterations i and j (union over all micro-iterations). Symmetric, diagonal = 100%.
const CELL = 56;
const LABEL = 60;

import { heatColor as colorFor, heatTextColor, constraintSet, type HeatSource } from "./heatmapColor";

export default function HeatmapChart({ items, sub, source }: { items: AddedConstraints[]; sub: string; source: HeatSource }) {
  const { masters, pct, sizes } = useMemo(() => {
    const byMaster = new Map<number, AddedConstraints[]>();
    for (const it of items) {
      if (it.sub_name !== sub) continue;
      const group = byMaster.get(it.num_master_iter);
      if (group) group.push(it);
      else byMaster.set(it.num_master_iter, [it]);
    }
    const masters = [...byMaster.keys()].sort((a, b) => a - b);
    const sets = masters.map((m) => constraintSet(byMaster.get(m)!, source));
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
    return { masters, pct, sizes: sets.map((s) => s.size) };
  }, [items, sub, source]);

  if (!masters.length) {
    return <div style={{ color: "#777", fontSize: 14 }}>No added constraints received for {sub} yet…</div>;
  }

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{sub}</div>
      <div style={{ color: "#777", fontSize: 12, marginBottom: 12 }}>
        % of common {source === "all" ? "added" : "active (final micro-iteration)"} constraints between master iterations (shared / total distinct)
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: "auto", display: "flex", alignItems: "flex-start" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `${LABEL}px repeat(${masters.length}, ${CELL}px)`,
            width: "max-content",
          }}
        >
          <div />
          {masters.map((m) => (
            <div key={`c${m}`} style={{ fontSize: 13, textAlign: "center", color: "#555", paddingBottom: 4 }}>
              {m}
            </div>
          ))}
          {masters.map((mi, i) => (
            <Row key={mi} label={mi} values={pct[i]} masters={masters} sizes={sizes} i={i} />
          ))}
        </div>
        <HeatScale />
      </div>
    </div>
  );
}

function Row({ label, values, masters, sizes, i }: { label: number; values: number[]; masters: number[]; sizes: number[]; i: number }) {
  return (
    <>
      <div style={{ fontSize: 13, color: "#555", display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: 6 }}>
        {label}
      </div>
      {values.map((v, j) => (
        <div
          key={j}
          title={`Iteration ${label} vs ${masters[j]}: ${v.toFixed(1)}% (${sizes[i]} / ${sizes[j]} constraints)`}
          style={{
            height: CELL,
            background: colorFor(v),
            border: "1px solid #fff",
            boxSizing: "border-box",
            fontSize: 13,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: heatTextColor(v),
          }}
        >
          {Math.round(v)}
        </div>
      ))}
    </>
  );
}
