import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

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

app.get("/api/micro_iter", (_req, res) => {
  res.json(microIters);
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
  res.json({ ok: true });
});

app.listen(3123, () => console.log("Server running on http://localhost:3123"));