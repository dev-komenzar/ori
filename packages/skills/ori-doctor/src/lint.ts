import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import {
  extractSections,
  parseArchitectureSpec,
  parseFrontmatter,
  type ArchitectureSpec,
} from "@ori-ori/parser";
import { consola } from "consola";

interface LintIssue {
  file: string;
  line: number;
  message: string;
}

async function* walkMarkdown(dir: string): AsyncGenerator<string> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkMarkdown(full);
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      yield full;
    }
  }
}

async function lintFile(path: string): Promise<LintIssue[]> {
  const raw = await readFile(path, "utf8");
  const { content } = parseFrontmatter(raw);
  const sections = extractSections(content);
  const issues: LintIssue[] = [];

  for (const section of sections.ordered) {
    if (section.id === null && (section.depth === 2 || section.depth === 3)) {
      issues.push({
        file: path,
        line: section.startLine,
        message: `H${section.depth} "${section.heading}" missing {#kebab-id} anchor`,
      });
    }
    if (section.id && !/^[a-z][a-z0-9-]*$/.test(section.id)) {
      issues.push({
        file: path,
        line: section.startLine,
        message: `Section id "${section.id}" should be lower-kebab-case starting with a letter`,
      });
    }
  }

  const seen = new Set<string>();
  for (const section of sections.ordered) {
    if (!section.id) continue;
    if (seen.has(section.id)) {
      issues.push({
        file: path,
        line: section.startLine,
        message: `Duplicate section id "${section.id}" in file`,
      });
    }
    seen.add(section.id);
  }

  return issues;
}

// ──────────────────────────────────────────────────────────────────────────
// guardrails 検証 (ori-c79.3)
//
// architect-expert.agent.md の構造セクション (invariants / guardrails) を YAML
// fenced block から machine parse し、生成された <target>/architecture.md が
// guardrails に適合するか検証する。agent bundle (.apm/agents/) が見つからなけ
// れば検証はスキップ (従来の doctor 挙動を維持)。
// ──────────────────────────────────────────────────────────────────────────

interface InvariantLayerSet {
  layers: Array<{
    id: string;
    kind: string;
    order?: number;
    slice_internal?: string;
  }>;
  rules: {
    cross_layer: Array<{ from: string; allow: string[] }>;
    same_layer: string;
    public_entry_required: boolean;
  };
}

interface InvariantSliceInternal {
  sub_layers: string[];
  rules: Array<{ from: string; allow: string[] }>;
}

interface InvariantData {
  layer_graph: Record<string, InvariantLayerSet>;
  slice_internal: Record<string, InvariantSliceInternal>;
  boundaries: {
    cross_slice: { prohibited_direct: boolean; via: string[] };
    cross_bc: { via_pattern: string; same_event_bus: boolean };
  };
}

interface Guardrail {
  id: string;
  target: string;
  check: string;
  failure?: string;
}

interface AgentStructuredSections {
  invariants: InvariantData | null;
  guardrails: Guardrail[] | null;
}

/** Agent body の H2 セクション本文から ```yaml fenced block を取り出し、top-level key で merge する */
function parseAgentSection(body: string): Record<string, unknown> {
  const merged: Record<string, unknown> = {};
  for (const match of body.matchAll(/```yaml\s*\n([\s\S]*?)```/g)) {
    const doc = YAML.parse(match[1]!) as Record<string, unknown>;
    for (const [k, v] of Object.entries(doc)) merged[k] = v;
  }
  return merged;
}

function extractStructuredSections(raw: string): AgentStructuredSections {
  const { content } = parseFrontmatter(raw);
  const sections = extractSections(content);
  const out: AgentStructuredSections = { invariants: null, guardrails: null };
  for (const section of sections.ordered) {
    if (section.depth !== 2) continue;
    if (section.heading === "invariants") {
      const parsed = parseAgentSection(section.body);
      out.invariants = (parsed.invariants as InvariantData) ?? null;
    } else if (section.heading === "guardrails") {
      const parsed = parseAgentSection(section.body);
      out.guardrails = (parsed.guardrails as Guardrail[]) ?? null;
    }
  }
  return out;
}

function push(
  issues: LintIssue[],
  file: string,
  guardrailId: string,
  message: string,
): void {
  issues.push({
    file,
    line: 1,
    message: `[${guardrailId}] guardrails: ${message}`,
  });
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** guardrails g-2: 各 root の layer_set が invariants.layer_graph と一致 */
function checkLayerSets(
  spec: ArchitectureSpec,
  inv: InvariantData,
  issues: LintIssue[],
  file: string,
): void {
  for (const root of spec.roots) {
    const expected = inv.layer_graph[root.layer_set];
    if (!expected) {
      push(
        issues,
        file,
        "g-2",
        `root "${root.id}" が未知の layer_set "${root.layer_set}" を使用 (invariants.layer_graph に存在しない)`,
      );
      continue;
    }
    const actual = spec.layer_sets[root.layer_set];
    if (!actual) {
      push(
        issues,
        file,
        "g-2",
        `layer_set "${root.layer_set}" が layer_sets に未定義 (root "${root.id}")`,
      );
      continue;
    }
    if (!deepEqual(actual.layers, expected.layers)) {
      push(
        issues,
        file,
        "g-2",
        `layer_set "${root.layer_set}" の layers が invariants と不一致`,
      );
    }
    if (!deepEqual(actual.rules.cross_layer, expected.rules.cross_layer)) {
      push(
        issues,
        file,
        "g-2",
        `layer_set "${root.layer_set}" の cross_layer rules が invariants と不一致`,
      );
    }
    if (actual.rules.same_layer !== expected.rules.same_layer) {
      push(
        issues,
        file,
        "g-2",
        `layer_set "${root.layer_set}" の same_layer が invariants と不一致 (期待: ${expected.rules.same_layer})`,
      );
    }
    if (actual.rules.public_entry_required !== expected.rules.public_entry_required) {
      push(
        issues,
        file,
        "g-2",
        `layer_set "${root.layer_set}" の public_entry_required が invariants と不一致`,
      );
    }
  }
}

/** guardrails g-3: 使用中の slice_internal が invariants.slice_internal と一致 */
function checkSliceInternal(
  spec: ArchitectureSpec,
  inv: InvariantData,
  issues: LintIssue[],
  file: string,
): void {
  for (const root of spec.roots) {
    const invSet = inv.layer_graph[root.layer_set];
    const actualSet = spec.layer_sets[root.layer_set];
    if (!invSet || !actualSet) continue; // g-2 側で報告
    for (const layer of actualSet.layers) {
      const siId = layer.slice_internal;
      if (!siId) continue;
      const expected = inv.slice_internal[siId];
      if (!expected) continue; // agent 側の整合性は agent の責務
      const actual = spec.slice_internal[siId];
      if (!actual) {
        push(
          issues,
          file,
          "g-3",
          `slice_internal "${siId}" (layer_set "${root.layer_set}" の ${layer.id}) が architecture.md に未宣言`,
        );
        continue;
      }
      if (!deepEqual(actual.sub_layers, expected.sub_layers)) {
        push(
          issues,
          file,
          "g-3",
          `slice_internal "${siId}" の sub_layers が invariants と不一致`,
        );
      }
      if (!deepEqual(actual.rules, expected.rules)) {
        push(
          issues,
          file,
          "g-3",
          `slice_internal "${siId}" の dependency rules が invariants と不一致`,
        );
      }
    }
  }
}

/** guardrails g-4 / g-5: cross_slice / cross_bc の境界設定 */
function checkBoundaries(
  spec: ArchitectureSpec,
  raw: string,
  inv: InvariantData,
  issues: LintIssue[],
  file: string,
): void {
  const expectedSlice = inv.boundaries.cross_slice;
  if (spec.cross_slice.prohibited_direct !== expectedSlice.prohibited_direct) {
    push(
      issues,
      file,
      "g-4",
      `cross_slice.prohibited_direct が ${expectedSlice.prohibited_direct} ではない (slice 直 import が reject されない)`,
    );
  }
  for (const via of expectedSlice.via) {
    if (!spec.cross_slice.via.includes(via)) {
      push(
        issues,
        file,
        "g-4",
        `cross_slice.via に "${via}" が無い (slice 間協調は contracts / events 経由が必須)`,
      );
    }
  }

  const { data } = parseFrontmatter(raw);
  const crossBc = data.cross_bc as
    | { same_event_bus?: boolean; via?: unknown }
    | undefined;
  if (!crossBc) {
    push(
      issues,
      file,
      "g-5",
      `cross_bc が未宣言 (BC 間は app-level shared/contracts + shared/events 経由が必須)`,
    );
  } else if (crossBc.same_event_bus !== inv.boundaries.cross_bc.same_event_bus) {
    push(
      issues,
      file,
      "g-5",
      `cross_bc.same_event_bus が ${inv.boundaries.cross_bc.same_event_bus} ではない`,
    );
  }
}

/** guardrails g-6: public_entry が全 root で 1 ファイルに解決される */
function checkPublicEntry(
  spec: ArchitectureSpec,
  issues: LintIssue[],
  file: string,
): void {
  for (const root of spec.roots) {
    const ls = spec.layer_sets[root.layer_set];
    if (ls && ls.rules.public_entry_required !== true) {
      push(
        issues,
        file,
        "g-6",
        `layer_set "${root.layer_set}" の public_entry_required が true ではない`,
      );
    }
    if (!root.public_entry || root.public_entry.trim() === "") {
      push(
        issues,
        file,
        "g-6",
        `root "${root.id}" の public_entry が未設定 (slice 内部への直 import が可能になる)`,
      );
    }
  }
}

/** guardrails g-7: cross_root の生成物は generator 明示 + auto_generated */
function checkCrossRoot(
  spec: ArchitectureSpec,
  issues: LintIssue[],
  file: string,
): void {
  for (const contract of spec.cross_root) {
    if (!contract.generator || contract.generator.trim() === "") {
      push(
        issues,
        file,
        "g-7",
        `cross_root (${contract.from.root} → ${contract.to.root}) の generator が未指定`,
      );
    }
    if (contract.auto_generated !== true) {
      push(
        issues,
        file,
        "g-7",
        `cross_root (${contract.from.root} → ${contract.to.root}) は auto_generated: true にすべき (生成物は手書き禁止)`,
      );
    }
  }
}

/** guardrails g-8: decision_points (platforms / os_integration / ui_native) の回答記録 */
function checkDecisionPoints(
  spec: ArchitectureSpec,
  raw: string,
  issues: LintIssue[],
  file: string,
): void {
  const { data } = parseFrontmatter(raw);
  const decisions = data.decisions as Record<string, unknown> | undefined;
  const hasDecisionsSection = /^## Decisions$/m.test(spec.body);
  if (hasDecisionsSection) return;
  if (decisions) {
    const required = ["platforms", "os_integration", "ui_native"];
    const missing = required.filter((k) => !(k in decisions));
    if (missing.length === 0) return;
    push(
      issues,
      file,
      "g-8",
      `decision_points の回答が不足: ${missing.join(", ")} (## Decisions 節 か frontmatter decisions: に記録)`,
    );
    return;
  }
  push(
    issues,
    file,
    "g-8",
    `decision_points の回答記録がない (## Decisions 節 か frontmatter decisions: が必要)`,
  );
}

/** <target>/architecture.md を architect-expert.agent.md の guardrails で検証する */
async function runGuardrailsCheck(archPath: string): Promise<LintIssue[]> {
  const issues: LintIssue[] = [];
  const here = dirname(fileURLToPath(import.meta.url));
  const agentPath = resolve(here, "..", "..", "..", "agents", "architect-expert.agent.md");

  let agentRaw: string;
  try {
    agentRaw = await readFile(agentPath, "utf8");
  } catch {
    consola.verbose(
      `guardrails: agent bundle 不在 (${agentPath}) — 検証スキップ`,
    );
    return issues;
  }

  const agent = extractStructuredSections(agentRaw);
  if (!agent.invariants || !agent.guardrails) {
    push(
      issues,
      archPath,
      "g-1",
      "architect-expert.agent.md に invariants / guardrails 構造セクションが無い (agent 更新が必要)",
    );
    return issues;
  }

  let raw: string;
  let spec: ArchitectureSpec;
  try {
    raw = await readFile(archPath, "utf8");
    spec = parseArchitectureSpec(raw);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    push(issues, archPath, "g-1", `architecture.md が ArchitectureSpec として parse できない: ${detail}`);
    return issues;
  }

  const validators = new Map<string, () => void>([
    ["g-1", () => {}], // parse 成功で pass (上で検証済み)
    ["g-2", () => checkLayerSets(spec, agent.invariants!, issues, archPath)],
    ["g-3", () => checkSliceInternal(spec, agent.invariants!, issues, archPath)],
    ["g-4", () => checkBoundaries(spec, raw, agent.invariants!, issues, archPath)],
    ["g-5", () => {}], // checkBoundaries 内で cross_bc まで処理
    ["g-6", () => checkPublicEntry(spec, issues, archPath)],
    ["g-7", () => checkCrossRoot(spec, issues, archPath)],
    ["g-8", () => checkDecisionPoints(spec, raw, issues, archPath)],
  ]);

  for (const guardrail of agent.guardrails) {
    const fn = validators.get(guardrail.id);
    if (fn) fn();
  }
  return issues;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

const args = process.argv.slice(2);
const targetArg = args.find((a) => !a.startsWith("--"));
const strict = args.includes("--strict");

const target = targetArg ?? ".ori";
const cwd = process.cwd();
const absTarget = join(cwd, target);

let issues: LintIssue[] = [];
let st;
try {
  st = await stat(absTarget);
} catch {
  consola.error(`Path not found: ${target}`);
  process.exit(2);
}

if (st.isFile()) {
  issues = await lintFile(absTarget);
} else {
  for await (const file of walkMarkdown(absTarget)) {
    issues.push(...(await lintFile(file)));
  }
  const archPath = join(absTarget, "architecture.md");
  if (await fileExists(archPath)) {
    issues.push(...(await runGuardrailsCheck(archPath)));
  }
}

if (issues.length === 0) {
  consola.success(`No lint issues in ${target}`);
  process.exit(0);
}

for (const issue of issues) {
  consola.warn(`${relative(cwd, issue.file)}:${issue.line}  ${issue.message}`);
}
consola.error(`${issues.length} issue(s) found`);
if (strict) process.exit(1);