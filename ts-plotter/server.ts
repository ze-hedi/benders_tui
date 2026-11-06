import express from "express";
import cors from "cors";
import fs from "node:fs";
import path from "node:path";

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// Set by POST /end when the algorithm finishes. Every /api response carries it as the
// X-Ended header, so the frontend stops polling after one last (complete) fetch.
let ended = false;
app.use("/api", (_req, res, next) => {
  res.setHeader("X-Ended", String(ended));
  res.setHeader("Access-Control-Expose-Headers", "X-Ended");
  next();
});

app.post("/end", (_req, res) => {
  ended = true;
  console.log("[POST end] algorithm finished, frontend polling will stop");
  // The run is complete: save automatically.
  const err = saveSnapshot(savePath(DEFAULT_SAVE_NAME)!);
  if (err) console.error(`[POST end] auto-save failed: ${err}`);
  res.json({ ok: true, saved: !err });
});

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
  n_saturated_constraints: number;
  n_all_constraints: number;
  n_added_constraints_N: number;
  n_added_constraints_NK: number;
}
const microIters: MicroIter[] = [];

app.post("/micro_iter", (req, res) => {
  const b = req.body ?? {};
  const solving_time = Number(b.solving_time);
  const elapsed_time = Number(b.elapsed_time);
  const ints = [b.rank, b.num_master_iter, b.num_micro_iter, b.nb_added_constraints,
    b.n_saturated_constraints,
    b.n_all_constraints,
    b.n_added_constraints_N,
    b.n_added_constraints_NK,
  ];
  if (
    typeof b.sub_name !== "string" ||
    ints.some((v) => !Number.isInteger(v)) ||
    Number.isNaN(solving_time) ||
    Number.isNaN(elapsed_time)
  ) {
    return res.status(400).json({
      error:
        "rank, num_master_iter, num_micro_iter, nb_added_constraints, n_saturated_constraints, n_all_constraints, n_added_constraints_N, n_added_constraints_NK (int), sub_name (string), solving_time, elapsed_time (numeric) required",
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
    n_saturated_constraints: b.n_saturated_constraints,
    n_all_constraints: b.n_all_constraints,
    n_added_constraints_N: b.n_added_constraints_N,
    n_added_constraints_NK: b.n_added_constraints_NK,
  });
  console.log(
    `[POST micro_iter] ${b.sub_name} master=${b.num_master_iter} micro=${b.num_micro_iter} saturated=${b.n_saturated_constraints} all=${b.n_all_constraints}`,
  );
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

// Cuts added to the master at each iteration (one entry per POST, in arrival order).
const addedCuts: number[] = [];

app.post("/added_cuts", (req, res) => {
  const n = req.body?.n_cuts_added;
  if (!Number.isInteger(n) || n < 0) {
    return res.status(400).json({ error: "n_cuts_added (non-negative int) required" });
  }
  addedCuts.push(n);
  console.log(`[POST added_cuts] iter=${addedCuts.length} n=${n}`);
  res.json({ ok: true, points: addedCuts.length });
});

app.get("/api/added_cuts", (req, res) => {
  const since = Math.max(0, Number.parseInt(String(req.query.since ?? "0"), 10) || 0);
  res.json({ total: addedCuts.length, items: addedCuts.slice(since) });
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
  constraints: { name: string; is_N: boolean; is_inc: boolean }[];
  active_constraints: string[]; // names of the saturated constraints at this micro-iteration
}
const addedConstraints: AddedConstraints[] = [];

app.post("/added_constraints", (req, res) => {
  const b = req.body ?? {};
  const ints = [b.rank, b.num_master_iter, b.num_micro_iter];
  if (
    typeof b.sub_name !== "string" ||
    ints.some((v) => !Number.isInteger(v)) ||
    !Array.isArray(b.constraints) ||
    !Array.isArray(b.active_constraints) ||
    b.active_constraints.some((n: unknown) => typeof n !== "string") ||
    b.constraints.some(
      (c: unknown) =>
        typeof c !== "object" ||
        c === null ||
        typeof (c as { name?: unknown }).name !== "string" ||
        typeof (c as { is_N?: unknown }).is_N !== "boolean" ||
        typeof (c as { is_inc?: unknown }).is_inc !== "boolean",
    )
  ) {
    return res.status(400).json({
      error:
        "rank, num_master_iter, num_micro_iter (int), sub_name (string), constraints ({ name: string, is_N: boolean, is_inc: boolean }[]), active_constraints (string[]) required",
    });
  }
  addedConstraints.push({
    rank: b.rank,
    sub_name: b.sub_name,
    num_master_iter: b.num_master_iter,
    num_micro_iter: b.num_micro_iter,
    constraints: b.constraints.map((c: { name: string; is_N: boolean; is_inc: boolean }) => ({
      name: c.name,
      is_N: c.is_N,
      is_inc: c.is_inc,
    })),
    active_constraints: [...b.active_constraints],
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

// Open frontends listen here (SSE); a POST /set means a new experiment started, so they reload.
const eventClients = new Set<express.Response>();
app.get("/api/events", (req, res) => {
  res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
  res.flushHeaders();
  res.write(": connected\n\n");
  eventClients.add(res);
  req.on("close", () => eventClients.delete(res));
});

app.post("/set", (req, res) => {
  const names = req.body;
  if (!Array.isArray(names) || names.some((n) => typeof n !== "string")) {
    return res.status(400).json({ error: "body must be a JSON array of strings" });
  }
  clearState();
  subproblemNames = names;
  for (const c of eventClients) c.write("event: new-run\ndata: {}\n\n");
  console.log(`[POST set] ${names.length} subproblems`);
  res.json({ ok: true, count: names.length });
});

app.get("/api/set", (_req, res) => {
  res.json(subproblemNames);
});

function clearState() {
  ended = false;
  subproblemNames = [];
  data.iteration.length = 0;
  data.lb.length = 0;
  data.ub.length = 0;
  data.best_ub.length = 0;
  microIters.length = 0;
  masterTimes.length = 0;
  addedCuts.length = 0;
  addedConstraints.length = 0;
}

app.post("/api/reset", (_req, res) => {
  clearState();
  res.json({ ok: true });
});

// Save/load: snapshot of everything above, stored in the repo root so it can be committed/shared.
const SAVE_DIR = path.resolve(__dirname, "..");
const DEFAULT_SAVE_NAME = "benders_save";

// Maps a user-supplied name to a file in SAVE_DIR; null if the name is not a plain file name.
function savePath(name: unknown): string | null {
  const base = (typeof name === "string" && name.trim() ? name.trim() : DEFAULT_SAVE_NAME).replace(/\.json$/i, "");
  if (!/^[\w. -]+$/.test(base) || base.startsWith(".")) return null;
  return path.join(SAVE_DIR, `${base}.json`);
}

// Returns an error message, or null on success.
function saveSnapshot(file: string): string | null {
  const snapshot = { data, subproblemNames, microIters, masterTimes, addedConstraints, addedCuts };
  try {
    fs.writeFileSync(file, JSON.stringify(snapshot));
  } catch (e) {
    return `could not write save file: ${(e as Error).message}`;
  }
  console.log(`[save] ${file}`);
  return null;
}

app.post("/api/save", (req, res) => {
  const file = savePath(req.body?.name);
  if (!file) return res.status(400).json({ error: "invalid file name (letters, digits, space, _ - . only)" });
  const err = saveSnapshot(file);
  if (err) return res.status(500).json({ error: err });
  res.json({ ok: true, file, points: data.iteration.length });
});

// Replaces the server state with the saved snapshot and flags the run as ended so a
// (re)connecting frontend does not wait for more data. Responds with the snapshot.
app.post("/api/load", (req, res) => {
  const file = savePath(req.body?.name);
  if (!file) return res.status(400).json({ error: "invalid file name" });
  let snap: any;
  try {
    snap = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    const missing = (e as NodeJS.ErrnoException).code === "ENOENT";
    return res.status(missing ? 404 : 500).json({
      error: missing ? "no save file found, click Save first" : `could not read save file: ${(e as Error).message}`,
    });
  }
  data.iteration = snap.data?.iteration ?? [];
  data.lb = snap.data?.lb ?? [];
  data.ub = snap.data?.ub ?? [];
  data.best_ub = snap.data?.best_ub ?? [];
  subproblemNames = snap.subproblemNames ?? [];
  microIters.splice(0, microIters.length, ...(snap.microIters ?? []));
  masterTimes.splice(0, masterTimes.length, ...(snap.masterTimes ?? []));
  addedConstraints.splice(0, addedConstraints.length, ...(snap.addedConstraints ?? []));
  addedCuts.splice(0, addedCuts.length, ...(snap.addedCuts ?? []));
  ended = true;
  res.setHeader("X-Ended", "true");
  console.log(`[POST load] ${file} (${data.iteration.length} points)`);
  res.json({ data, subproblemNames, microIters, masterTimes, addedConstraints, addedCuts });
});

app.listen(3123, () => console.log("Server running on http://localhost:3123"));