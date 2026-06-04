import { mkdir, writeFile, access, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { stringify as yamlStringify } from "yaml";
import { formatEpicId, PHASES, type Phase } from "@ori-ori/slice-runner";
import { consola } from "consola";

async function exists(path: string): Promise<boolean> {
  try { await access(path); return true; } catch { return false; }
}

async function loadTemplate(name: string): Promise<string> {
  const skillRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", ".apm", "contexts", "templates");
  const tplPath = join(skillRoot, name);
  try {
    return await readFile(tplPath, "utf8");
  } catch {
    return "";
  }
}

function renderTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`);
}

const args = process.argv.slice(2);
const id = args.find((a) => !a.startsWith("--")) ?? "";
const typeArg = (() => { const idx = args.findIndex((a) => a === "--type" || a.startsWith("--type=")); if (idx === -1) return "command"; const a = args[idx]!; return a.includes("=") ? a.split("=")[1]! : (args[idx + 1] ?? "command"); })();

if (!id || !/^[a-z][a-z0-9-]*$/.test(id)) {
  consola.error("Usage: new-slice.js <id> [--type=command|query]\nslice id must be lower-kebab-case");
  process.exit(1);
}
if (typeArg !== "command" && typeArg !== "query") {
  consola.error(`slice type must be "command" or "query" (got "${typeArg}")`);
  process.exit(1);
}

const cwd = process.cwd();
const dir = join(cwd, ".ori/slices", id);
if (await exists(dir)) {
  consola.error(`Slice already exists: .ori/slices/${id}`);
  process.exit(1);
}
await mkdir(dir, { recursive: true });

const tpl = await loadTemplate("slice-manifest.yaml.tpl");
let manifestContent: string;
if (tpl) {
  manifestContent = renderTemplate(tpl, { id, type: typeArg });
} else {
  manifestContent = yamlStringify({
    slice_id: id,
    type: typeArg,
    derives_from: [],
    relations: [],
    implementation: { language: "typescript", primary_bc: "TODO", generates: [] },
  });
}
await writeFile(join(dir, "manifest.yaml"), manifestContent, "utf8");

const specStub = `---
ori:
  schema:
    propagation_level: file
coherence:
  derives_from: []
---

# ${id} — Specification

> This file is a derived document. Edit the source manifest + domain docs and re-run \`ori slice run ${id} --phase derive\`. Use \`ori sync --force\` if you need to edit here directly; ori will create a proposal for the upstream review.

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
  slice_id: id,
  derived_at: new Date().toISOString(),
  beads: { epic: formatEpicId("slice", id), current_phase: null, completion: [] as Phase[] },
  phases: {},
  dirty: [],
};
await writeFile(join(dir, "status.yaml"), yamlStringify(status), "utf8");

consola.success(`Created .ori/slices/${id}/ (manifest, spec, notes, status)`);
consola.info("Next: edit manifest.yaml to add derives_from references, then run the derive phase");
