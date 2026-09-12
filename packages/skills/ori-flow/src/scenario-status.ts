import { access, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parse as yamlParse, stringify as yamlStringify } from "yaml";
import {
  formatEpicId,
  isValidScenarioPhase,
  nextScenarioPhase,
  SCENARIO_PHASES,
  type PhaseRecord,
  type ScenarioPhase,
  type ScenarioStatus,
} from "@ori-ori/slice-runner";

// ── helpers ──────────────────────────────────────────────────────────

async function exists(path: string): Promise<boolean> {
  try { await access(path); return true; } catch { return false; }
}

function usage(): never {
  console.error(
    "Usage: scenario-status.js set <id> <phase> <state>\n" +
    "       scenario-status.js show <id> [--json]\n" +
    "  phase: derive | generate | review | finalize\n" +
    "  state: started | done | failed (aliases: closed→done, in_progress→started, complete/completed→done)",
  );
  process.exit(1);
}

// ── state mapping ────────────────────────────────────────────────────

type InputState = "started" | "done" | "failed";

function mapState(raw: string): InputState | null {
  switch (raw) {
    case "started":
    case "in_progress":
      return "started";
    case "done":
    case "closed":
    case "complete":
    case "completed":
      return "done";
    case "failed":
      return "failed";
    default:
      return null;
  }
}

function mapStateToPhaseStatus(s: InputState): "in_progress" | "done" | "failed" {
  switch (s) {
    case "started": return "in_progress";
    case "done": return "done";
    case "failed": return "failed";
  }
}

// ── normalization ────────────────────────────────────────────────────

function normalizePhaseRecord(raw: unknown): PhaseRecord {
  if (typeof raw === "string") {
    // legacy: phases: { derive: "closed" }
    const mapped = mapState(raw);
    return mapped ? { state: mapStateToPhaseStatus(mapped) } : { state: "pending" };
  }
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const obj = raw as Record<string, unknown>;
    const state = typeof obj.state === "string" ? obj.state : "pending";
    const validState = (["pending", "in_progress", "done", "failed"] as const).includes(state as never)
      ? (state as PhaseRecord["state"])
      : "pending";
    return {
      state: validState,
      ...(typeof obj.started_at === "string" ? { started_at: obj.started_at } : {}),
      ...(typeof obj.completed_at === "string" ? { completed_at: obj.completed_at } : {}),
      ...(typeof obj.notes === "string" ? { notes: obj.notes } : {}),
    };
  }
  return { state: "pending" };
}

function normalize(raw: Record<string, unknown>, id: string): ScenarioStatus {
  const now = new Date().toISOString();

  // scenario_id
  const scenarioId = typeof raw.scenario_id === "string" ? raw.scenario_id : id;

  // derived_at
  const derivedAt = typeof raw.derived_at === "string" ? raw.derived_at : now;

  // beads
  const rawBeads = raw.beads && typeof raw.beads === "object" && !Array.isArray(raw.beads)
    ? raw.beads as Record<string, unknown>
    : {};
  const epic = typeof rawBeads.epic === "string" ? rawBeads.epic : formatEpicId("scenario", id);
  const currentPhase = typeof rawBeads.current_phase === "string" && isValidScenarioPhase(rawBeads.current_phase)
    ? rawBeads.current_phase
    : null;
  const rawCompletion: unknown[] = Array.isArray(rawBeads.completion) ? rawBeads.completion : [];
  const completion: ScenarioPhase[] = [];
  const seen = new Set<ScenarioPhase>();
  for (const p of SCENARIO_PHASES) {
    if (rawCompletion.includes(p) && !seen.has(p)) {
      completion.push(p);
      seen.add(p);
    }
  }

  // phases
  const rawPhases = raw.phases && typeof raw.phases === "object" && !Array.isArray(raw.phases)
    ? raw.phases as Record<string, unknown>
    : {};
  const phases: Partial<Record<ScenarioPhase, PhaseRecord>> = {};
  for (const p of SCENARIO_PHASES) {
    if (p in rawPhases) {
      phases[p] = normalizePhaseRecord(rawPhases[p]);
    }
  }

  // dirty
  const dirty = Array.isArray(raw.dirty) ? raw.dirty : [];

  return {
    scenario_id: scenarioId,
    derived_at: derivedAt,
    beads: { epic, current_phase: currentPhase, completion },
    phases,
    dirty,
  };
}

// ── set ──────────────────────────────────────────────────────────────

function applySet(
  status: ScenarioStatus,
  phase: ScenarioPhase,
  state: InputState,
  now: string,
): ScenarioStatus {
  const existing = status.phases[phase];
  const phases = { ...status.phases };
  const beads = { ...status.beads, completion: [...status.beads.completion] };

  switch (state) {
    case "started": {
      phases[phase] = {
        ...existing,
        state: "in_progress",
        started_at: existing?.started_at ?? now,
      };
      beads.current_phase = phase;
      break;
    }
    case "done": {
      if (existing?.state === "done") {
        // idempotent: preserve timestamps
        phases[phase] = { ...existing };
      } else {
        phases[phase] = {
          ...existing,
          state: "done",
          started_at: existing?.started_at ?? now,
          completed_at: existing?.completed_at ?? now,
        };
      }
      // add to completion (dedupe, ordered)
      if (!beads.completion.includes(phase)) {
        beads.completion.push(phase);
        beads.completion.sort((a, b) => SCENARIO_PHASES.indexOf(a) - SCENARIO_PHASES.indexOf(b));
      }
      // advance current_phase
      const next = nextScenarioPhase(phase);
      beads.current_phase = next && !beads.completion.includes(next) ? next : null;
      break;
    }
    case "failed": {
      phases[phase] = {
        ...existing,
        state: "failed",
        started_at: existing?.started_at ?? now,
      };
      // leave current_phase as-is
      break;
    }
  }

  return { ...status, phases, beads };
}

// ── main ─────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length < 2) usage();

  const [cmd, id, ...rest] = args;

  if (cmd !== "set" && cmd !== "show") usage();

  if (!id || !/^[a-z][a-z0-9-]*$/.test(id)) {
    console.error(`Invalid scenario id: "${id}" (must be lower-kebab-case)`);
    process.exit(1);
  }

  const cwd = process.cwd();
  const statusPath = join(cwd, ".ori", "scenarios", id, "status.yaml");

  if (!(await exists(statusPath))) {
    console.error(`status.yaml not found: .ori/scenarios/${id}/status.yaml`);
    process.exit(1);
  }

  const raw = await readFile(statusPath, "utf8");
  const parsed = yamlParse(raw) ?? {};
  const status = normalize(
    (parsed && typeof parsed === "object" && !Array.isArray(parsed)) ? parsed as Record<string, unknown> : {},
    id,
  );

  if (cmd === "show") {
    const jsonFlag = rest.includes("--json");
    if (jsonFlag) {
      console.log(JSON.stringify(status, null, 2));
    } else {
      console.log(yamlStringify(status));
    }
    return;
  }

  // cmd === "set"
  const [phaseRaw, stateRaw] = rest;
  if (!phaseRaw || !stateRaw) usage();

  if (!isValidScenarioPhase(phaseRaw)) {
    console.error(`Invalid phase: "${phaseRaw}". Must be one of: ${SCENARIO_PHASES.join(", ")}`);
    process.exit(1);
  }

  const mappedState = mapState(stateRaw);
  if (mappedState === null) {
    console.error(`Invalid state: "${stateRaw}". Must be one of: started, done, failed`);
    process.exit(1);
  }

  const now = new Date().toISOString();
  const updated = applySet(status, phaseRaw, mappedState, now);

  await writeFile(statusPath, yamlStringify(updated), "utf8");

  const phaseStatus = updated.phases[phaseRaw];
  const summary = phaseStatus
    ? `${phaseRaw} → ${phaseStatus.state}${phaseStatus.completed_at ? ` (completed: ${phaseStatus.completed_at})` : ""}`
    : `${phaseRaw} → ${mappedState}`;
  console.log(`scenario-status: ${id}: ${summary}`);
}

await main();