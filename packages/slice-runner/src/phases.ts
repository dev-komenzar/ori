/**
 * The seven phases of a per-feature workflow.
 *
 * 1. derive     — synthesize spec.md from manifest + domain docs
 * 2. plan       — elaborate downstream beads issue descriptions
 * 3. test-red   — write failing tests under tests/
 * 4. impl-green — implement source code until tests pass
 * 5. refactor   — tidy up
 * 6. review     — fresh-context adversarial review (default: reasoning / Opus)
 * 7. finalize   — clear dirty marks, update status hash, emit proposals as needed
 */
export const PHASES = [
  "derive",
  "plan",
  "test-red",
  "impl-green",
  "refactor",
  "review",
  "finalize",
] as const;

export type Phase = (typeof PHASES)[number];

export type PhaseStatus = "pending" | "in_progress" | "done" | "failed";

export interface PhaseRecord {
  state: PhaseStatus;
  started_at?: string;
  completed_at?: string;
  fix_attempts?: number;
  notes?: string;
}

export function nextPhase(current: Phase): Phase | null {
  const idx = PHASES.indexOf(current);
  if (idx < 0 || idx === PHASES.length - 1) return null;
  return PHASES[idx + 1] ?? null;
}

export function isValidPhase(value: string): value is Phase {
  return (PHASES as readonly string[]).includes(value);
}
