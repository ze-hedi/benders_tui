import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

const data: { iteration: number[]; lb: number[]; ub: number[]; best_ub: number[] } = {
  iteration: [], lb: [], ub: [], best_ub: [],
};

app.post("/get_data", (req, res) => {
  const { iteration, lb, ub, best_ub } = req.body;
  if ([iteration, lb, ub, best_ub].some((v) => typeof v !== "number")) {
    return res.status(400).json({ error: "iteration (int), lb, ub, best_ub (doubles) required" });
  }
  data.iteration.push(iteration);
  data.lb.push(lb);
  data.ub.push(ub);
  data.best_ub.push(best_ub);
  console.log(`[POST] iteration=${iteration} lb=${lb} ub=${ub} best_ub=${best_ub}`);
  res.json({ ok: true, points: data.iteration.length });
});

app.get("/api/data", (_req, res) => {
  res.json(data);
});

// Micro-iterations, posted by Julia_benders_micro_iterations (MicroIterationsHttpSender).
// Times arrive as strings (ms); we store them as numbers.
interface MicroIter {
  rank: number;
  sub_name: string;
  num_master_iter: number;
  num_micro_iter: number;
  nb_added_constraints: number;
  solving_time: number;
  elapsed_time: number;
}
const microIters: MicroIter[] = [];

app.post("/micro_iter", (req, res) => {
  const b = req.body ?? {};
  const solving_time = Number(b.solving_time);
  const elapsed_time = Number(b.elapsed_time);
  const ints = [b.rank, b.num_master_iter, b.num_micro_iter, b.nb_added_constraints];
  if (
    typeof b.sub_name !== "string" ||
    ints.some((v) => !Number.isInteger(v)) ||
    Number.isNaN(solving_time) ||
    Number.isNaN(elapsed_time)
  ) {
    return res.status(400).json({
      error:
        "rank, num_master_iter, num_micro_iter, nb_added_constraints (int), sub_name (string), solving_time, elapsed_time (numeric) required",
    });
  }
  microIters.push({
    rank: b.rank,
    sub_name: b.sub_name,
    num_master_iter: b.num_master_iter,
    num_micro_iter: b.num_micro_iter,
    nb_added_constraints: b.nb_added_constraints,
    solving_time,
    elapsed_time,
  });
  console.log(`[POST micro_iter] ${b.sub_name} master=${b.num_master_iter} micro=${b.num_micro_iter}`);
  res.json({ ok: true, points: microIters.length });
});

// Optional ?since=N returns only the records after the first N (incremental polling).
app.get("/api/micro_iter", (req, res) => {
  const since = Math.max(0, Number.parseInt(String(req.query.since ?? "0"), 10) || 0);
  res.json({ total: microIters.length, items: microIters.slice(since) });
});

// Master iteration times, posted once per master iteration by rank 0 (MicroIterationsHttpSender).
interface MasterTime {
  num_master_iter: number;
  elapsed_time: number;
  master_resolution_time: number;
}
const masterTimes: MasterTime[] = [];

app.post("/master_times", (req, res) => {
  const b = req.body ?? {};
  const elapsed_time = Number(b.elapsed_time);
  const master_resolution_time = Number(b.master_resolution_time);
  if (
    !Number.isInteger(b.num_master_iter) ||
    Number.isNaN(elapsed_time) ||
    Number.isNaN(master_resolution_time)
  ) {
    return res.status(400).json({
      error: "num_master_iter (int), elapsed_time, master_resolution_time (numeric) required",
    });
  }
  masterTimes.push({ num_master_iter: b.num_master_iter, elapsed_time, master_resolution_time });
  console.log(`[POST master_times] master=${b.num_master_iter} resolution=${master_resolution_time}`);
  res.json({ ok: true, points: masterTimes.length });
});

app.get("/api/master_times", (req, res) => {
  const since = Math.max(0, Number.parseInt(String(req.query.since ?? "0"), 10) || 0);
  res.json({ total: masterTimes.length, items: masterTimes.slice(since) });
});

// Constraints added per micro-iteration, posted by every rank (MicroIterationsLog::DumpAddedConstraints).
// Each record holds only that micro-iteration's new constraints; it matches the /micro_iter record
// with the same (rank, sub_name, num_master_iter, num_micro_iter).
interface AddedConstraints {
  rank: number;
  sub_name: string;
  num_master_iter: number;
  num_micro_iter: number;
  constraints: { name: string; is_N: boolean }[];
}
const addedConstraints: AddedConstraints[] = [];

app.post("/added_constraints", (req, res) => {
  const b = req.body ?? {};
  const ints = [b.rank, b.num_master_iter, b.num_micro_iter];
  if (
    typeof b.sub_name !== "string" ||
    ints.some((v) => !Number.isInteger(v)) ||
    !Array.isArray(b.constraints) ||
    b.constraints.some(
      (c: unknown) =>
        typeof c !== "object" ||
        c === null ||
        typeof (c as { name?: unknown }).name !== "string" ||
        typeof (c as { is_N?: unknown }).is_N !== "boolean",
    )
  ) {
    return res.status(400).json({
      error:
        "rank, num_master_iter, num_micro_iter (int), sub_name (string), constraints ({ name: string, is_N: boolean }[]) required",
    });
  }
  addedConstraints.push({
    rank: b.rank,
    sub_name: b.sub_name,
    num_master_iter: b.num_master_iter,
    num_micro_iter: b.num_micro_iter,
    constraints: b.constraints.map((c: { name: string; is_N: boolean }) => ({ name: c.name, is_N: c.is_N })),
  });
  console.log(
    `[POST added_constraints] ${b.sub_name} master=${b.num_master_iter} micro=${b.num_micro_iter} n=${b.constraints.length}`,
  );
  res.json({ ok: true, points: addedConstraints.length });
});

// Optional ?since=N (incremental polling); optional ?sub_name= and ?num_master_iter= filters.
app.get("/api/added_constraints", (req, res) => {
  const since = Math.max(0, Number.parseInt(String(req.query.since ?? "0"), 10) || 0);
  let items = addedConstraints.slice(since);
  if (typeof req.query.sub_name === "string") {
    items = items.filter((r) => r.sub_name === req.query.sub_name);
  }
  if (req.query.num_master_iter !== undefined) {
    const m = Number.parseInt(String(req.query.num_master_iter), 10);
    items = items.filter((r) => r.num_master_iter === m);
  }
  res.json({ total: addedConstraints.length, items });
});

// Subproblem names, posted once by BendersMpi::InitializeProblems (rank 0) as a JSON array.
// The array index is the subproblem id.
let subproblemNames: string[] = [];

app.post("/set", (req, res) => {
  const names = req.body;
  if (!Array.isArray(names) || names.some((n) => typeof n !== "string")) {
    return res.status(400).json({ error: "body must be a JSON array of strings" });
  }
  subproblemNames = names;
  console.log(`[POST set] ${names.length} subproblems`);
  res.json({ ok: true, count: names.length });
});

app.get("/api/set", (_req, res) => {
  res.json(subproblemNames);
});

app.post("/api/reset", (_req, res) => {
  subproblemNames = [];
  data.iteration.length = 0;
  data.lb.length = 0;
  data.ub.length = 0;
  data.best_ub.length = 0;
  microIters.length = 0;
  masterTimes.length = 0;
  addedConstraints.length = 0;
  res.json({ ok: true });
});

app.listen(3999, () => console.log("Server running on http://localhost:3123"));