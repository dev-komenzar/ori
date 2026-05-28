// src/flow.ts
import { existsSync as existsSync2 } from "fs";
import { readFile as readFile2 } from "fs/promises";
import path2 from "path";

// src/phases.ts
var PHASES = [
  "derive",
  "plan",
  "test-red",
  "impl-green",
  "refactor",
  "review",
  "finalize"
];
function nextPhase(current) {
  const idx = PHASES.indexOf(current);
  if (idx < 0 || idx === PHASES.length - 1) return null;
  return PHASES[idx + 1] ?? null;
}
function isValidPhase(value) {
  return PHASES.includes(value);
}

// src/runState.ts
import { mkdir, readFile, writeFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
var STATE_FILE = "status.json";
function runRoot(repoRoot, kind, id) {
  return path.join(repoRoot, ".ori", kind === "slice" ? "slices" : "pages", id, "run");
}
function phaseDir(repoRoot, kind, id, phase) {
  return path.join(runRoot(repoRoot, kind, id), phase);
}
function statePath(repoRoot, kind, id) {
  return path.join(runRoot(repoRoot, kind, id), STATE_FILE);
}
function ensureKind(value) {
  if (value === "slice" || value === "page") return value;
  throw new Error(`Unknown kind: ${value} (expected slice|page)`);
}
function ensurePhase(value) {
  if (!isValidPhase(value)) {
    throw new Error(`Unknown phase: ${value} (expected one of: ${PHASES.join(", ")})`);
  }
  return value;
}
async function loadState(repoRoot, kind, id) {
  const p = statePath(repoRoot, kind, id);
  if (!existsSync(p)) return null;
  const text = await readFile(p, "utf-8");
  return JSON.parse(text);
}
async function saveState(repoRoot, state) {
  const dir = runRoot(repoRoot, state.kind, state.id);
  await mkdir(dir, { recursive: true });
  await writeFile(statePath(repoRoot, state.kind, state.id), JSON.stringify(state, null, 2) + "\n");
}
async function ensurePhaseDir(repoRoot, state, phase) {
  const dir = phaseDir(repoRoot, state.kind, state.id, phase);
  await mkdir(dir, { recursive: true });
  return dir;
}
function newRunState(kind, id, now) {
  return {
    id,
    kind,
    started_at: now,
    current_phase: null,
    completion: [],
    phases: {}
  };
}
function setPhase(state, phase, patch) {
  const prev = state.phases[phase] ?? { state: "pending" };
  state.phases[phase] = { ...prev, ...patch };
}
function markStarted(state, phase, now) {
  setPhase(state, phase, { state: "in_progress", started_at: now });
  state.current_phase = phase;
}
function markEnded(state, phase, status, now, notes) {
  setPhase(state, phase, { state: status, completed_at: now, notes });
  if (status === "done" && !state.completion.includes(phase)) {
    state.completion.push(phase);
  }
}
function fixAttempts(state, phase) {
  return state.phases[phase]?.fix_attempts ?? 0;
}
function recordFixAttempt(state, phase) {
  const prev = fixAttempts(state, phase);
  const next = prev + 1;
  setPhase(state, phase, { fix_attempts: next });
  return next;
}

// src/flow.ts
function parseArgs(argv) {
  const [subcommand = "", ...rest] = argv;
  const flags = {};
  const positional = [];
  for (let i = 0; i < rest.length; i++) {
    const token = rest[i];
    if (token === void 0) continue;
    if (token.startsWith("--")) {
      const key = token.slice(2);
      const next = rest[i + 1];
      if (next === void 0 || next.startsWith("--")) {
        flags[key] = true;
      } else {
        flags[key] = next;
        i++;
      }
    } else {
      positional.push(token);
    }
  }
  return { subcommand, flags, positional };
}
function requireFlag(args, name) {
  const v = args.flags[name];
  if (typeof v !== "string" || v.length === 0) {
    throw new Error(`--${name} <value> is required`);
  }
  return v;
}
function flag(args, name, fallback) {
  const v = args.flags[name];
  if (typeof v !== "string" || v.length === 0) return fallback;
  return v;
}
function repoRootOf(args) {
  return path2.resolve(flag(args, "repo", process.cwd()));
}
function kindOf(args) {
  return ensureKind(flag(args, "kind", "slice"));
}
function manifestPath(repoRoot, kind, id) {
  return path2.join(repoRoot, ".ori", kind === "slice" ? "slices" : "pages", id, "manifest.yaml");
}
function nowIso() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
async function ensureState(repoRoot, kind, id) {
  const existing = await loadState(repoRoot, kind, id);
  if (existing) return existing;
  throw new Error(
    `No run state for ${kind} "${id}". Run "flow init --kind ${kind} --id ${id}" first.`
  );
}
function emit(payload) {
  process.stdout.write(JSON.stringify(payload, null, 2) + "\n");
}
async function cmdInit(args) {
  const id = requireFlag(args, "id");
  const kind = kindOf(args);
  const repoRoot = repoRootOf(args);
  const mPath = manifestPath(repoRoot, kind, id);
  if (!existsSync2(mPath)) {
    emit({
      ok: false,
      error: "manifest_missing",
      manifest_path: path2.relative(repoRoot, mPath),
      hint: `Expected ${kind} manifest at ${mPath}. ori does not auto-scaffold; create the ${kind} first or pick a different id.`
    });
    process.exitCode = 2;
    return;
  }
  const existing = await loadState(repoRoot, kind, id);
  if (existing) {
    const last = existing.completion[existing.completion.length - 1] ?? null;
    const resume = last ? nextPhase(last) : PHASES[0];
    emit({
      ok: true,
      resumed: true,
      kind,
      id,
      manifest_path: path2.relative(repoRoot, mPath),
      run_dir: path2.relative(repoRoot, runRoot(repoRoot, kind, id)),
      completion: existing.completion,
      current_phase: existing.current_phase,
      next_phase: resume
    });
    return;
  }
  const state = newRunState(kind, id, nowIso());
  await saveState(repoRoot, state);
  for (const p of PHASES) {
    await ensurePhaseDir(repoRoot, state, p);
  }
  emit({
    ok: true,
    resumed: false,
    kind,
    id,
    manifest_path: path2.relative(repoRoot, mPath),
    run_dir: path2.relative(repoRoot, runRoot(repoRoot, kind, id)),
    completion: [],
    current_phase: null,
    next_phase: PHASES[0]
  });
}
async function cmdStart(args) {
  const id = requireFlag(args, "id");
  const kind = kindOf(args);
  const phase = ensurePhase(requireFlag(args, "phase"));
  const repoRoot = repoRootOf(args);
  const state = await ensureState(repoRoot, kind, id);
  if (state.completion.includes(phase)) {
    emit({ ok: true, phase, already_done: true });
    return;
  }
  markStarted(state, phase, nowIso());
  await ensurePhaseDir(repoRoot, state, phase);
  await saveState(repoRoot, state);
  emit({
    ok: true,
    phase,
    log_dir: path2.relative(repoRoot, phaseDir(repoRoot, kind, id, phase)),
    fix_attempts: fixAttempts(state, phase)
  });
}
async function cmdEnd(args) {
  const id = requireFlag(args, "id");
  const kind = kindOf(args);
  const phase = ensurePhase(requireFlag(args, "phase"));
  const result = requireFlag(args, "result");
  if (result !== "done" && result !== "failed") {
    throw new Error(`--result must be 'done' or 'failed', got: ${result}`);
  }
  const notes = typeof args.flags.notes === "string" ? args.flags.notes : void 0;
  const repoRoot = repoRootOf(args);
  const state = await ensureState(repoRoot, kind, id);
  markEnded(state, phase, result, nowIso(), notes);
  await saveState(repoRoot, state);
  if (result === "done") {
    emit({
      ok: true,
      phase,
      result,
      next_phase: nextPhase(phase),
      allow_self_fix: false,
      fix_attempts: fixAttempts(state, phase)
    });
    return;
  }
  const used = fixAttempts(state, phase);
  emit({
    ok: true,
    phase,
    result,
    next_phase: null,
    allow_self_fix: used < 1,
    fix_attempts: used,
    hint: used < 1 ? `Phase ${phase} failed. One self-fix attempt is allowed. Run "flow record-fix --phase ${phase} --id ${id}" before re-running the phase.` : `Phase ${phase} failed after self-fix. STOP and hand off to a human.`
  });
}
async function cmdRecordFix(args) {
  const id = requireFlag(args, "id");
  const kind = kindOf(args);
  const phase = ensurePhase(requireFlag(args, "phase"));
  const repoRoot = repoRootOf(args);
  const state = await ensureState(repoRoot, kind, id);
  const attempts = recordFixAttempt(state, phase);
  await saveState(repoRoot, state);
  emit({ ok: true, phase, fix_attempts: attempts });
}
async function cmdReviewPrep(args) {
  const id = requireFlag(args, "id");
  const kind = kindOf(args);
  const repoRoot = repoRootOf(args);
  const state = await ensureState(repoRoot, kind, id);
  const dir = await ensurePhaseDir(repoRoot, state, "review");
  const transcriptPath = path2.join(dir, "transcript.md");
  const verdictPath = path2.join(dir, "verdict.json");
  emit({
    ok: true,
    agent: "ori-reviewer",
    capability: "reasoning",
    fresh_context: true,
    transcript_path: path2.relative(repoRoot, transcriptPath),
    verdict_path: path2.relative(repoRoot, verdictPath),
    prompt: [
      `You are spawned as the ori-reviewer agent for ${kind} "${id}".`,
      `Read manifest, spec.md, tests, and impl.`,
      `Apply the 7 review criteria from .apm/agents/ori-reviewer.agent.md.`,
      `Write your full markdown review to ${path2.relative(repoRoot, transcriptPath)}.`,
      `Write a machine-readable verdict JSON to ${path2.relative(repoRoot, verdictPath)} with the shape:`,
      `  { "verdict": "PASS" | "NEEDS_FIX" | "REJECT", "reasons": string[], "findings": [{"category": string, "file": string, "line": number?, "issue": string, "recommendation": string?}] }`,
      `Do not modify any source files. Review only.`
    ].join("\n")
  });
}
async function cmdReviewVerdict(args) {
  const id = requireFlag(args, "id");
  const kind = kindOf(args);
  const repoRoot = repoRootOf(args);
  const state = await ensureState(repoRoot, kind, id);
  const verdictPath = path2.join(phaseDir(repoRoot, kind, id, "review"), "verdict.json");
  if (!existsSync2(verdictPath)) {
    emit({
      ok: false,
      error: "verdict_missing",
      verdict_path: path2.relative(repoRoot, verdictPath),
      hint: "Reviewer agent must write verdict.json before this command. Re-spawn the reviewer."
    });
    process.exitCode = 2;
    return;
  }
  const text = await readFile2(verdictPath, "utf-8");
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    emit({
      ok: false,
      error: "verdict_parse_failed",
      verdict_path: path2.relative(repoRoot, verdictPath),
      reason: err instanceof Error ? err.message : String(err)
    });
    process.exitCode = 2;
    return;
  }
  const verdict = parsed.verdict;
  if (verdict !== "PASS" && verdict !== "NEEDS_FIX" && verdict !== "REJECT") {
    emit({
      ok: false,
      error: "verdict_invalid",
      verdict,
      verdict_path: path2.relative(repoRoot, verdictPath)
    });
    process.exitCode = 2;
    return;
  }
  const fixRoundsUsed = fixAttempts(state, "review");
  const allowFixRound = verdict === "NEEDS_FIX" && fixRoundsUsed < 1;
  emit({
    ok: true,
    verdict,
    reasons: parsed.reasons ?? [],
    findings: parsed.findings ?? [],
    next_action: verdict === "PASS" ? "end_review_done" : verdict === "REJECT" ? "stop_for_human" : allowFixRound ? "patch_and_re_review" : "stop_for_human",
    allow_fix_round: allowFixRound,
    fix_rounds_used: fixRoundsUsed
  });
}
async function cmdReport(args) {
  const id = requireFlag(args, "id");
  const kind = kindOf(args);
  const repoRoot = repoRootOf(args);
  const state = await loadState(repoRoot, kind, id);
  if (!state) {
    emit({ ok: false, error: "no_run_state" });
    process.exitCode = 2;
    return;
  }
  emit({ ok: true, state });
}
async function main() {
  const args = parseArgs(process.argv.slice(2));
  try {
    switch (args.subcommand) {
      case "init":
        await cmdInit(args);
        return;
      case "start":
        await cmdStart(args);
        return;
      case "end":
        await cmdEnd(args);
        return;
      case "record-fix":
        await cmdRecordFix(args);
        return;
      case "review-prep":
        await cmdReviewPrep(args);
        return;
      case "review-verdict":
        await cmdReviewVerdict(args);
        return;
      case "report":
        await cmdReport(args);
        return;
      case "":
      case "help":
      case "--help":
        process.stdout.write(usage());
        return;
      default:
        process.stderr.write(`Unknown subcommand: ${args.subcommand}

${usage()}`);
        process.exitCode = 2;
        return;
    }
  } catch (err) {
    emit({ ok: false, error: err instanceof Error ? err.message : String(err) });
    process.exitCode = 1;
  }
}
function usage() {
  return [
    "Usage: flow <subcommand> [--id <id>] [--kind slice|page] [--repo <root>]",
    "",
    "Subcommands:",
    "  init           Verify manifest exists, scaffold run dir + status.json",
    "  start          --phase <p>  Record phase start",
    "  end            --phase <p> --result done|failed [--notes <s>]",
    "  record-fix     --phase <p>  Increment self-fix counter",
    "  review-prep    Print Task spawn metadata for the review agent",
    "  review-verdict Parse review/verdict.json into a structured result",
    "  report         Dump current run state",
    ""
  ].join("\n");
}
await main();
