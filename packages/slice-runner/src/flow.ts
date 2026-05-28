/**
 * Bundle entry for .apm/skills/ori-flow/scripts/flow.js
 *
 * Decision boundary: this CLI handles ONLY deterministic work — state
 * transitions, log directory layout, self-fix accounting, verdict parsing.
 * LLM invocation lives in the SKILL.md orchestrator (one tool-call per phase),
 * never in this script. The orchestrator calls subcommands here to learn
 * "what's next" / "did I pass review" between phases.
 *
 * Subcommands:
 *   init           — verify slice/page exists, scaffold run dir, write status.json
 *   start          — record phase start (writes status.json + phase dir)
 *   end            — record phase end, compute next phase + self-fix allowance
 *   record-fix     — increment fix_attempts for a phase
 *   review-prep    — print Task spawn metadata for the review agent
 *   review-verdict — parse .ori/slices/<id>/run/review/verdict.json
 *   report         — dump full run state
 *
 * All subcommands print a single JSON object to stdout. Non-zero exit on error.
 */
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PHASES, type Phase, nextPhase } from "./phases.js";
import {
  ensureKind,
  ensurePhase,
  ensurePhaseDir,
  fixAttempts,
  loadState,
  markEnded,
  markStarted,
  newRunState,
  phaseDir,
  recordFixAttempt,
  runRoot,
  saveState,
  type RunKind,
  type RunState,
} from "./runState.js";

interface ParsedArgs {
  subcommand: string;
  flags: Record<string, string | boolean>;
  positional: string[];
}

function parseArgs(argv: string[]): ParsedArgs {
  const [subcommand = "", ...rest] = argv;
  const flags: Record<string, string | boolean> = {};
  const positional: string[] = [];
  for (let i = 0; i < rest.length; i++) {
    const token = rest[i];
    if (token === undefined) continue;
    if (token.startsWith("--")) {
      const key = token.slice(2);
      const next = rest[i + 1];
      if (next === undefined || next.startsWith("--")) {
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

function requireFlag(args: ParsedArgs, name: string): string {
  const v = args.flags[name];
  if (typeof v !== "string" || v.length === 0) {
    throw new Error(`--${name} <value> is required`);
  }
  return v;
}

function flag(args: ParsedArgs, name: string, fallback: string): string {
  const v = args.flags[name];
  if (typeof v !== "string" || v.length === 0) return fallback;
  return v;
}

function repoRootOf(args: ParsedArgs): string {
  return path.resolve(flag(args, "repo", process.cwd()));
}

function kindOf(args: ParsedArgs): RunKind {
  return ensureKind(flag(args, "kind", "slice"));
}

function manifestPath(repoRoot: string, kind: RunKind, id: string): string {
  return path.join(repoRoot, ".ori", kind === "slice" ? "slices" : "pages", id, "manifest.yaml");
}

function nowIso(): string {
  return new Date().toISOString();
}

async function ensureState(repoRoot: string, kind: RunKind, id: string): Promise<RunState> {
  const existing = await loadState(repoRoot, kind, id);
  if (existing) return existing;
  throw new Error(
    `No run state for ${kind} "${id}". Run "flow init --kind ${kind} --id ${id}" first.`,
  );
}

function emit(payload: unknown): void {
  process.stdout.write(JSON.stringify(payload, null, 2) + "\n");
}

async function cmdInit(args: ParsedArgs): Promise<void> {
  const id = requireFlag(args, "id");
  const kind = kindOf(args);
  const repoRoot = repoRootOf(args);
  const mPath = manifestPath(repoRoot, kind, id);
  if (!existsSync(mPath)) {
    emit({
      ok: false,
      error: "manifest_missing",
      manifest_path: path.relative(repoRoot, mPath),
      hint: `Expected ${kind} manifest at ${mPath}. ori does not auto-scaffold; create the ${kind} first or pick a different id.`,
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
      manifest_path: path.relative(repoRoot, mPath),
      run_dir: path.relative(repoRoot, runRoot(repoRoot, kind, id)),
      completion: existing.completion,
      current_phase: existing.current_phase,
      next_phase: resume,
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
    manifest_path: path.relative(repoRoot, mPath),
    run_dir: path.relative(repoRoot, runRoot(repoRoot, kind, id)),
    completion: [],
    current_phase: null,
    next_phase: PHASES[0],
  });
}

async function cmdStart(args: ParsedArgs): Promise<void> {
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
    log_dir: path.relative(repoRoot, phaseDir(repoRoot, kind, id, phase)),
    fix_attempts: fixAttempts(state, phase),
  });
}

async function cmdEnd(args: ParsedArgs): Promise<void> {
  const id = requireFlag(args, "id");
  const kind = kindOf(args);
  const phase = ensurePhase(requireFlag(args, "phase"));
  const result = requireFlag(args, "result");
  if (result !== "done" && result !== "failed") {
    throw new Error(`--result must be 'done' or 'failed', got: ${result}`);
  }
  const notes = typeof args.flags.notes === "string" ? args.flags.notes : undefined;
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
      fix_attempts: fixAttempts(state, phase),
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
    hint: used < 1
      ? `Phase ${phase} failed. One self-fix attempt is allowed. Run "flow record-fix --phase ${phase} --id ${id}" before re-running the phase.`
      : `Phase ${phase} failed after self-fix. STOP and hand off to a human.`,
  });
}

async function cmdRecordFix(args: ParsedArgs): Promise<void> {
  const id = requireFlag(args, "id");
  const kind = kindOf(args);
  const phase = ensurePhase(requireFlag(args, "phase"));
  const repoRoot = repoRootOf(args);
  const state = await ensureState(repoRoot, kind, id);
  const attempts = recordFixAttempt(state, phase);
  await saveState(repoRoot, state);
  emit({ ok: true, phase, fix_attempts: attempts });
}

async function cmdReviewPrep(args: ParsedArgs): Promise<void> {
  const id = requireFlag(args, "id");
  const kind = kindOf(args);
  const repoRoot = repoRootOf(args);
  const state = await ensureState(repoRoot, kind, id);
  const dir = await ensurePhaseDir(repoRoot, state, "review");
  const transcriptPath = path.join(dir, "transcript.md");
  const verdictPath = path.join(dir, "verdict.json");
  emit({
    ok: true,
    agent: "ori-reviewer",
    capability: "reasoning",
    fresh_context: true,
    transcript_path: path.relative(repoRoot, transcriptPath),
    verdict_path: path.relative(repoRoot, verdictPath),
    prompt: [
      `You are spawned as the ori-reviewer agent for ${kind} "${id}".`,
      `Read manifest, spec.md, tests, and impl.`,
      `Apply the 7 review criteria from .apm/agents/ori-reviewer.agent.md.`,
      `Write your full markdown review to ${path.relative(repoRoot, transcriptPath)}.`,
      `Write a machine-readable verdict JSON to ${path.relative(repoRoot, verdictPath)} with the shape:`,
      `  { "verdict": "PASS" | "NEEDS_FIX" | "REJECT", "reasons": string[], "findings": [{"category": string, "file": string, "line": number?, "issue": string, "recommendation": string?}] }`,
      `Do not modify any source files. Review only.`,
    ].join("\n"),
  });
}

interface VerdictFile {
  verdict: "PASS" | "NEEDS_FIX" | "REJECT";
  reasons?: string[];
  findings?: Array<{
    category: string;
    file?: string;
    line?: number;
    issue: string;
    recommendation?: string;
  }>;
}

async function cmdReviewVerdict(args: ParsedArgs): Promise<void> {
  const id = requireFlag(args, "id");
  const kind = kindOf(args);
  const repoRoot = repoRootOf(args);
  const state = await ensureState(repoRoot, kind, id);
  const verdictPath = path.join(phaseDir(repoRoot, kind, id, "review"), "verdict.json");
  if (!existsSync(verdictPath)) {
    emit({
      ok: false,
      error: "verdict_missing",
      verdict_path: path.relative(repoRoot, verdictPath),
      hint: "Reviewer agent must write verdict.json before this command. Re-spawn the reviewer.",
    });
    process.exitCode = 2;
    return;
  }
  const text = await readFile(verdictPath, "utf-8");
  let parsed: VerdictFile;
  try {
    parsed = JSON.parse(text) as VerdictFile;
  } catch (err) {
    emit({
      ok: false,
      error: "verdict_parse_failed",
      verdict_path: path.relative(repoRoot, verdictPath),
      reason: err instanceof Error ? err.message : String(err),
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
      verdict_path: path.relative(repoRoot, verdictPath),
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
    next_action:
      verdict === "PASS"
        ? "end_review_done"
        : verdict === "REJECT"
          ? "stop_for_human"
          : allowFixRound
            ? "patch_and_re_review"
            : "stop_for_human",
    allow_fix_round: allowFixRound,
    fix_rounds_used: fixRoundsUsed,
  });
}

async function cmdReport(args: ParsedArgs): Promise<void> {
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

async function main(): Promise<void> {
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
        process.stderr.write(`Unknown subcommand: ${args.subcommand}\n\n${usage()}`);
        process.exitCode = 2;
        return;
    }
  } catch (err) {
    emit({ ok: false, error: err instanceof Error ? err.message : String(err) });
    process.exitCode = 1;
  }
}

function usage(): string {
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
    "",
  ].join("\n");
}

// Allow `await` in module scope of bundled output.
await main();
