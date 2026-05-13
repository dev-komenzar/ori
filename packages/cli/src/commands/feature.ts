import { defineCommand } from "citty";
import { consola } from "consola";
import { mkdir, writeFile, access } from "node:fs/promises";
import { join } from "node:path";
import { stringify as yamlStringify } from "yaml";
import { PHASES, type Phase } from "@ori-ori/feature-runner";

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

const newCmd = defineCommand({
  meta: { name: "new", description: "Scaffold a new feature directory" },
  args: {
    id: { type: "positional", required: true },
    type: {
      type: "string",
      description: "workflow | ui",
      default: "workflow",
    },
  },
  async run({ args }) {
    const id = String(args.id);
    if (!/^[a-z][a-z0-9-]*$/.test(id)) {
      consola.error("feature id must be lower-kebab-case");
      process.exit(1);
    }
    const dir = join(process.cwd(), ".ori/features", id);
    if (await exists(dir)) {
      consola.error(`Feature already exists: ${dir}`);
      process.exit(1);
    }
    await mkdir(join(dir, "tests"), { recursive: true });

    const manifest = {
      id,
      type: args.type,
      derives_from: [],
      relations: [],
      implementation: {
        language: "typescript",
        primary_bc: "TODO",
        generates: [],
      },
    };
    await writeFile(join(dir, "manifest.yaml"), yamlStringify(manifest), "utf8");

    const specStub = `---
ori:
  schema:
    propagation_level: file
coherence:
  derives_from: []
---

# ${id} — Specification

> This file is a derived document. Edit the source manifest + domain docs and re-run \`ori feature run ${id} --phase derive\`. Use \`ori sync --force\` if you need to edit here directly; ori will create a proposal for the upstream review.

## 概要 {#overview}

TODO

## 入出力 {#io}

TODO

## 不変条件 {#invariants}

TODO

## テスト観点 {#test-points}

TODO

## 実装ノート {#impl-notes}

TODO
`;
    await writeFile(join(dir, "spec.md"), specStub, "utf8");
    await writeFile(join(dir, "notes.md"), `# ${id} — Implementation notes\n\n`, "utf8");

    const status = {
      feature_id: id,
      derived_at: new Date().toISOString(),
      beads: { epic: `ori-feature-${id}`, current_phase: null, completion: [] as Phase[] },
      phases: {},
      dirty: [],
    };
    await writeFile(join(dir, "status.yaml"), yamlStringify(status), "utf8");

    consola.success(`Created .ori/features/${id}/ (manifest, spec, notes, status)`);
    consola.info("Next: edit manifest.yaml to add derives_from references, then run `ori feature run <id> --phase derive`");
  },
});

const runCmd = defineCommand({
  meta: { name: "run", description: "Run one or more phases of a feature workflow" },
  args: {
    id: { type: "positional", required: true },
    phase: {
      type: "string",
      description: `Specific phase: ${PHASES.join("|")} (default: next pending)`,
      required: false,
    },
  },
  async run({ args }) {
    consola.info(`ori feature run ${args.id} (MVP stub)`);
    consola.warn("Phase runner not wired yet. Coming in next milestone.");
  },
});

const listCmd = defineCommand({
  meta: { name: "list", description: "List all features and their phase status" },
  async run() {
    consola.info("ori feature list (MVP stub) — needs status.yaml aggregation");
  },
});

export const featureCommand = defineCommand({
  meta: {
    name: "feature",
    description: "Manage features (new / run / list)",
  },
  subCommands: { new: newCmd, run: runCmd, list: listCmd },
});
