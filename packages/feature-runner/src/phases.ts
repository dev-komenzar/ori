/**
 * The seven phases of a per-feature workflow.
 *
 * 1. derive     — synthesize spec.md from manifest + domain docs
 * 2. plan       — elaborate downstream beads issue descriptions
 * 3. test-red   — write failing tests under tests/
 * 4. impl-green — implement source code until tests pass
 * 5. refactor   — tidy up
 * 6. review     — fresh-context adversarial review (default: reasoning / Opus)
 * 7. sync       — clear dirty marks + emit proposals as needed
 */
export const PHASES = [
  "derive",
  "plan",
  "test-red",
  "impl-green",
  "refactor",
  "review",
  "sync",
] as const;

export type Phase = (typeof PHASES)[number];

export type PhaseStatus = "pending" | "in_progress" | "done" | "failed";

export interface PhaseRecord {
  state: PhaseStatus;
  started_at?: string;
  completed_at?: string;
  notes?: string;
}
