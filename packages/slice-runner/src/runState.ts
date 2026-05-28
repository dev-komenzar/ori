import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { PHASES, type Phase, type PhaseRecord, type PhaseStatus, isValidPhase } from "./phases.js";

export type RunKind = "slice" | "page";

export interface RunState {
  id: string;
  kind: RunKind;
  started_at: string;
  current_phase: Phase | null;
  completion: Phase[];
  phases: Partial<Record<Phase, PhaseRecord>>;
  /** Set when test-red GREEN-on-first is detected — hard stop. */
  initial_green?: { phase: Phase; detected_at: string };
}

const STATE_FILE = "status.json";

export function runRoot(repoRoot: string, kind: RunKind, id: string): string {
  return path.join(repoRoot, ".ori", kind === "slice" ? "slices" : "pages", id, "run");
}

export function phaseDir(repoRoot: string, kind: RunKind, id: string, phase: Phase): string {
  return path.join(runRoot(repoRoot, kind, id), phase);
}

export function statePath(repoRoot: string, kind: RunKind, id: string): string {
  return path.join(runRoot(repoRoot, kind, id), STATE_FILE);
}

export function ensureKind(value: string): RunKind {
  if (value === "slice" || value === "page") return value;
  throw new Error(`Unknown kind: ${value} (expected slice|page)`);
}

export function ensurePhase(value: string): Phase {
  if (!isValidPhase(value)) {
    throw new Error(`Unknown phase: ${value} (expected one of: ${PHASES.join(", ")})`);
  }
  return value;
}

export async function loadState(repoRoot: string, kind: RunKind, id: string): Promise<RunState | null> {
  const p = statePath(repoRoot, kind, id);
  if (!existsSync(p)) return null;
  const text = await readFile(p, "utf-8");
  return JSON.parse(text) as RunState;
}

export async function saveState(repoRoot: string, state: RunState): Promise<void> {
  const dir = runRoot(repoRoot, state.kind, state.id);
  await mkdir(dir, { recursive: true });
  await writeFile(statePath(repoRoot, state.kind, state.id), JSON.stringify(state, null, 2) + "\n");
}

export async function ensurePhaseDir(repoRoot: string, state: RunState, phase: Phase): Promise<string> {
  const dir = phaseDir(repoRoot, state.kind, state.id, phase);
  await mkdir(dir, { recursive: true });
  return dir;
}

export function newRunState(kind: RunKind, id: string, now: string): RunState {
  return {
    id,
    kind,
    started_at: now,
    current_phase: null,
    completion: [],
    phases: {},
  };
}

export function setPhase(state: RunState, phase: Phase, patch: Partial<PhaseRecord>): void {
  const prev = state.phases[phase] ?? ({ state: "pending" } as PhaseRecord);
  state.phases[phase] = { ...prev, ...patch };
}

export function markStarted(state: RunState, phase: Phase, now: string): void {
  setPhase(state, phase, { state: "in_progress", started_at: now });
  state.current_phase = phase;
}

export function markEnded(state: RunState, phase: Phase, status: PhaseStatus, now: string, notes?: string): void {
  setPhase(state, phase, { state: status, completed_at: now, notes });
  if (status === "done" && !state.completion.includes(phase)) {
    state.completion.push(phase);
  }
}

export function fixAttempts(state: RunState, phase: Phase): number {
  return state.phases[phase]?.fix_attempts ?? 0;
}

export function recordFixAttempt(state: RunState, phase: Phase): number {
  const prev = fixAttempts(state, phase);
  const next = prev + 1;
  setPhase(state, phase, { fix_attempts: next });
  return next;
}
