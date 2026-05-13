import type { Phase } from "./phases.js";

/**
 * beads (bd) integration. The runner shells out to `bd` and does not own
 * issue state — it only orchestrates which issues to open/close.
 *
 * Naming convention:
 *   ori-feature-<id>          — epic
 *   ori-<phase>-<id>          — phase issue (depends on previous phase)
 */

export function formatEpicId(featureId: string): string {
  return `ori-feature-${featureId}`;
}

export function formatIssueId(phase: Phase, featureId: string): string {
  return `ori-${phase}-${featureId}`;
}

export interface BeadsBridge {
  /** Create the epic + 7 phase issues with proper dependencies. */
  createFeatureIssues(featureId: string): Promise<void>;
  /** Reopen the named phase issue and any downstream issues. */
  reopenPhase(featureId: string, phase: Phase): Promise<void>;
  /** Append a comment to the named issue. */
  comment(issueId: string, body: string): Promise<void>;
  /** Update the description of an issue (used by phase 2 to elaborate downstream tasks). */
  setDescription(issueId: string, body: string): Promise<void>;
}
