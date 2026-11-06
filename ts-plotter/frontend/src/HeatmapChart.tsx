import { useMemo } from "react";

import type { AddedConstraints } from "./ConstraintsChart";

// DECISION: cell (i, j) = Jaccard similarity |Ci ∩ Cj| / |Ci ∪ Cj| of the sets of constraints
// added during master iterations i and j (union over all micro-iterations). Symmetric, diagonal = 100%.
const CELL = 34;
const LABEL = 44;

// White (0%) -> blue (100%).
const colorFor = (pct: number) => `hsl(213 ${20 + pct * 0.7}% ${97 - pct * 0.5}%)`;

export default function HeatmapChart({ items, sub }: { items: AddedConstraints[]; sub: string }) {
  const { masters, pct, sizes } = useMemo(() => {
    const byMaster = new Map<number, Set<string>>();
    for (const it of items) {
      if (it.sub_name !== sub) continue;
      let set = byMaster.get(it.num_master_iter);
      if (!set) byMaster.set(it.num_master_iter, (set = new Set()));
      for (const c of it.constraints) set.add(c.name);
    }
    const masters = [...byMaster.keys()].sort((a, b) => a - b);
    const sets = masters.map((m) => byMaster.get(m)!);
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
  }, [items, sub]);

  if (!masters.length) {
    return <div style={{ color: "#777", fontSize: 14 }}>No added constraints received for {sub} yet…</div>;
  }

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{sub}</div>
      <div style={{ color: "#777", fontSize: 12, marginBottom: 12 }}>
        % of common added constraints between master iterations (shared / total distinct)
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `${LABEL}px repeat(${masters.length}, ${CELL}px)`,
            width: "max-content",
          }}
        >
          <div />
          {masters.map((m) => (
            <div key={`c${m}`} style={{ fontSize: 11, textAlign: "center", color: "#555", paddingBottom: 4 }}>
              {m}
            </div>
          ))}
          {masters.map((mi, i) => (
            <Row key={mi} label={mi} values={pct[i]} masters={masters} sizes={sizes} i={i} />
          ))}
        </div>
      </div>
    </div>
  );
}

function Row({ label, values, masters, sizes, i }: { label: number; values: number[]; masters: number[]; sizes: number[]; i: number }) {
  return (
    <>
      <div style={{ fontSize: 11, color: "#555", display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: 6 }}>
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
