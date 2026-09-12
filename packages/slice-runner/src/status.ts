import type { NodeRef } from "@ori-ori/coherence";
import type { Phase, PhaseRecord, ScenarioPhase } from "./phases.js";

export interface DirtyEntry {
  source: NodeRef;
  detected_at: string;
  affected_phase: Phase;
  reason?: string;
}

export interface SliceStatus {
  slice_id: string;
  derived_at: string;
  beads: {
    epic: string;
    current_phase: Phase | null;
    completion: Phase[];
  };
  phases: Partial<Record<Phase, PhaseRecord>>;
  dirty: DirtyEntry[];
}

export interface ScenarioDirtyEntry {
  source: NodeRef;
  detected_at: string;
  affected_phase: ScenarioPhase;
  reason?: string;
}

export interface ScenarioStatus {
  scenario_id: string;
  derived_at: string;
  beads: {
    epic: string;
    current_phase: ScenarioPhase | null;
    completion: ScenarioPhase[];
  };
  phases: Partial<Record<ScenarioPhase, PhaseRecord>>;
  dirty: ScenarioDirtyEntry[];
}
