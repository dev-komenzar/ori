import { mkdir, writeFile, access, readFile, readdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { stringify as yamlStringify } from "yaml";
import { formatEpicId, SCENARIO_PHASES, type ScenarioPhase } from "@ori-ori/slice-runner";

async function exists(path: string): Promise<boolean> {
  try { await access(path); return true; } catch { return false; }
}

async function loadTemplate(name: string): Promise<string> {
  const templatesDir = join(dirname(fileURLToPath(import.meta.url)), "..", "templates");
  const tplPath = join(templatesDir, name);
  try {
    return await readFile(tplPath, "utf8");
  } catch {
    return "";
  }
}

function renderTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`);
}

/**
 * A validation.md scenario section (H2 with a `{#anchor}`).
 * scenario id is 1:1 with these anchors — see docs/20260911-report.md (R1)
 * and scenario.instructions.md §id-convention.
 */
interface ValidationSection {
  id: string;
  title: string;
}

/**
 * Parse `## Scenario ... {#anchor}` H2 headers from validation.md.
 * Accepts both `## Scenario: Title {#anchor}` and `## Scenario S1: Title {#anchor}`.
 */
function parseValidationSections(md: string): ValidationSection[] {
  const sections: ValidationSection[] = [];
  const re = /^## Scenario[^\n{]*\{#([a-z][a-z0-9-]*)\}[ \t]*$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(md)) !== null) {
    const id = m[1]!;
    if (sections.some((s) => s.id === id)) continue;
    const title = m[0]
      .replace(/^## Scenario[:\s]*/, "")
      .replace(/\{#[a-z0-9-]+\}[ \t]*$/, "")
      .trim();
    sections.push({ id, title });
  }
  return sections;
}

async function listScaffoldedScenarios(cwd: string): Promise<string[]> {
  const scenariosDir = join(cwd, ".ori", "scenarios");
  if (!(await exists(scenariosDir))) return [];
  const entries = await readdir(scenariosDir, { withFileTypes: true });
  const ids: string[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (await exists(join(scenariosDir, e.name, "manifest.yaml"))) ids.push(e.name);
  }
  return ids;
}

/**
 * `--list-validation`: enumerate validation.md scenario section anchors and
 * their scaffold coverage. The mechanical guard against AI-invented scenario
 * ids (docs/20260911-report.md R2).
 */
async function runListValidation(cwd: string): Promise<void> {
  const validationPath = join(cwd, ".ori", "domain", "validation.md");
  if (!(await exists(validationPath))) {
    console.error(
      ".ori/domain/validation.md not found — scenario ids are 1:1 with its section anchors.\n" +
      "Run /ori-distill (phase 7: validation) first, or add a `## Scenario: ... {#<id>}` section before scaffolding.",
    );
    process.exit(1);
  }
  const sections = parseValidationSections(await readFile(validationPath, "utf8"));
  if (sections.length === 0) {
    console.error("No `## Scenario ... {#anchor}` sections found in .ori/domain/validation.md");
    return;
  }

  const scaffolded = new Set(await listScaffoldedScenarios(cwd));
  console.log(`validation.md scenario sections (${sections.length}):`);
  for (const s of sections) {
    const mark = scaffolded.has(s.id) ? "scaffolded" : "candidate (not scaffolded)";
    console.log(`  ${s.id.padEnd(44)} ${mark}  — ${s.title}`);
  }

  const anchorIds = new Set(sections.map((s) => s.id));
  const orphans = [...scaffolded].filter((id) => !anchorIds.has(id)).sort();
  if (orphans.length > 0) {
    console.error(
      `scenarios without a matching validation.md anchor (1:1 violation): ${orphans.join(", ")}`,
    );
  }
  const covered = sections.filter((s) => scaffolded.has(s.id)).length;
  console.log(`coverage: ${covered}/${sections.length} scaffolded, ${sections.length - covered} candidate(s)`);
}

const args = process.argv.slice(2);
const listValidation = args.includes("--list-validation");
const id = args.find((a) => !a.startsWith("--")) ?? "";

const cwd = process.cwd();

if (listValidation) {
  await runListValidation(cwd);
} else if (id && /^[a-z][a-z0-9-]*$/.test(id)) {
  // scenario id must be 1:1 with a validation.md section anchor.
  const validationPath = join(cwd, ".ori", "domain", "validation.md");
  if (!(await exists(validationPath))) {
    console.error(
      ".ori/domain/validation.md not found — scenario ids are 1:1 with its section anchors.\n" +
      "Run /ori-distill (phase 7: validation) first, or add a `## Scenario: ... {#<id>}` section before scaffolding.",
    );
    process.exit(1);
  }
  const sections = parseValidationSections(await readFile(validationPath, "utf8"));
  const anchor = sections.find((s) => s.id === id);
  if (!anchor) {
    console.error(
      `scenario id "${id}" not found in .ori/domain/validation.md sections (scenario id = section anchor, 1:1).`,
    );
    console.log("Run `new-scenario.js --list-validation` to see the existing section anchors.");
    console.log(
      "For a brand-new workflow, add a `## Scenario: ... {#<id>}` section to .ori/domain/validation.md first.",
    );
    process.exit(1);
  }

  const dir = join(cwd, ".ori/scenarios", id);
  if (await exists(dir)) {
    console.error(`Scenario already exists: .ori/scenarios/${id}`);
    process.exit(1);
  }
  await mkdir(dir, { recursive: true });

  const tpl = await loadTemplate("scenario-manifest.yaml.tpl");
  let manifestContent: string;
  if (tpl) {
    manifestContent = renderTemplate(tpl, { id });
  } else {
    manifestContent = yamlStringify({
      scenario_id: id,
      type: "scenario",
      derives_from: [`domain/validation.md#${id}`],
    });
  }
  await writeFile(join(dir, "manifest.yaml"), manifestContent, "utf8");

  const specStub = `---
ori:
  schema:
    propagation_level: file
coherence:
  derives_from:
    - domain/validation.md#${id}
---

# ${id} — Scenario Specification

> This file is a derived document. Edit the source manifest + domain docs and re-run \`/ori-flow ${id} phase=derive\`. Use \`/ori-sync\` if you need to edit here directly; ori will create a proposal for the upstream review.

## 概要 {#overview}

TODO

## シナリオステップ {#scenario-steps}

TODO

## テスト観点 {#test-points}

TODO

## 実装ノート {#impl-notes}

TODO
`;
  await writeFile(join(dir, "spec.md"), specStub, "utf8");
  await writeFile(join(dir, "notes.md"), `# ${id} — Scenario implementation notes\n\n`, "utf8");

  const status = {
    scenario_id: id,
    derived_at: new Date().toISOString(),
    beads: { epic: formatEpicId("scenario", id), current_phase: null, completion: [] as ScenarioPhase[] },
    phases: {},
    dirty: [],
  };
  await writeFile(join(dir, "status.yaml"), yamlStringify(status), "utf8");

  console.log(`Created .ori/scenarios/${id}/ (manifest, spec, notes, status)`);
  console.log(`Anchored to validation section: "${anchor.title || anchor.id}"`);
  console.log("Next: review manifest.yaml (pages / contracts / infrastructure), then run the derive phase");
} else {
  console.error(
    "Usage: new-scenario.js <id> | --list-validation\n" +
    "scenario id must be lower-kebab-case and 1:1 with a .ori/domain/validation.md section anchor",
  );
  process.exit(1);
}
