import type { Phase } from "./phases.js";

/**
 * beads (bd) integration. The runner shells out to `bd` and does not own
 * issue state — it only orchestrates which issues to open/close.
 *
 * Naming convention:
 *   ori-slice-<id>            — slice epic
 *   ori-page-<id>             — page epic
 *   ori-<phase>-<id>          — phase issue (depends on previous phase)
 */

export type EpicKind = "slice" | "page";

export function formatEpicId(kind: EpicKind, id: string): string {
  return `ori-${kind}-${id}`;
}

export function formatIssueId(phase: Phase, id: string): string {
  return `ori-${phase}-${id}`;
}

export interface BeadsBridge {
  /** Create the epic + 7 phase issues with proper dependencies. */
  createSliceIssues(sliceId: string): Promise<void>;
  /** Reopen the named phase issue and any downstream issues. */
  reopenPhase(sliceId: string, phase: Phase): Promise<void>;
  /** Append a comment to the named issue. */
  comment(issueId: string, body: string): Promise<void>;
  /** Update the description of an issue (used by phase 2 to elaborate downstream tasks). */
  setDescription(issueId: string, body: string): Promise<void>;
}
