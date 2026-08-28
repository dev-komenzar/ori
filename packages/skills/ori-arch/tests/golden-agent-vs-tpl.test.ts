import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  parseArchitectureSpec,
  parseFrontmatter,
  type ArchitectureSpec,
} from "@ori-ori/parser";
import { GOLDEN } from "./fixtures/golden-constants.js";

/**
 * golden test (ori-c79.4): architect-expert agent の生成結果 vs 既存固定
 * テンプレート (stacks/<stack>/architecture.md.tpl) の期待出力。
 *
 * LLM 出力は本文の散文が揺れるため、**依存グラフ IR** (frontmatter 由来の
 * roots / layer_sets / slice_internal / cross_slice / cross_bc / cross_root)
 * に正規化して diff する。"agent の安定期間" が終わるまでの safety net。
 *
 * - `fixtures/agent-generated/<stack>/architecture.md` … agent が生成すると
 *   想定される representative output (fixture)
 * - `fixtures/golden-constants.ts` … tpl を render した期待出力の IR (GOLDEN)
 *
 * stacks/<stack>/architecture.md.tpl を削除する ori-c79.6 では、下の「GOLDEN ≡
 * tpl render」describe block のみを除去し、fixture ≡ GOLDEN 検証を残す。
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..", "..", "..");
const PATTERN_ROOT = join(
  REPO_ROOT,
  ".apm",
  "skills",
  "ori-arch",
  "patterns",
  "ddd-vsa-hex",
);
const FIXTURES_ROOT = join(__dirname, "fixtures", "agent-generated");

const SUBSTITUTIONS = {
  APP_NAME: "myapp",
  BC_NAME: "task-management",
  BC_NAME_RS: "task_management",
} as const;

type Stack = "typescript" | "typescript-tauri";
type Golden = (typeof GOLDEN)["typescript"] | (typeof GOLDEN)["typescriptTauri"];

function render(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{(\w+)\}\}/g, (whole, key: string) => {
    const v = vars[key];
    if (v === undefined) throw new Error(`unresolved placeholder: ${whole}`);
    return v;
  });
}

interface Rendered {
  raw: string;
  spec: ArchitectureSpec;
  data: Record<string, unknown>;
}

async function renderTpl(stack: Stack): Promise<Rendered> {
  const tplPath = join(
    PATTERN_ROOT,
    "stacks",
    stack,
    "architecture.md.tpl",
  );
  const tpl = await readFile(tplPath, "utf8");
  const raw = render(tpl, SUBSTITUTIONS);
  return {
    raw,
    spec: parseArchitectureSpec(raw),
    data: parseFrontmatter(raw).data,
  };
}

async function loadFixture(stack: Stack): Promise<Rendered> {
  const raw = await readFile(
    join(FIXTURES_ROOT, stack, "architecture.md"),
    "utf8",
  );
  return {
    raw,
    spec: parseArchitectureSpec(raw),
    data: parseFrontmatter(raw).data,
  };
}

function assertMatchesGolden(
  doc: Rendered,
  golden: Golden,
  label: string,
): void {
  expect(doc.spec.version, `${label}: version`).toBe(golden.version);
  expect(doc.spec.default_root, `${label}: default_root`).toBe(
    golden.default_root,
  );
  expect(doc.spec.roots, `${label}: roots`).toEqual(golden.roots);
  expect(doc.spec.layer_sets, `${label}: layer_sets`).toEqual(
    golden.layer_sets,
  );
  expect(doc.spec.slice_internal, `${label}: slice_internal`).toEqual(
    golden.slice_internal,
  );
  expect(doc.spec.cross_slice, `${label}: cross_slice`).toEqual(
    golden.cross_slice,
  );
  expect(doc.spec.cross_root, `${label}: cross_root`).toEqual(
    golden.cross_root,
  );
  if (golden.cross_bc) {
    expect(doc.data.cross_bc, `${label}: cross_bc`).toEqual(golden.cross_bc);
  }
}

describe("golden test — GOLDEN constants が現行 tpl render と一致する", () => {
  it("typescript", async () => {
    assertMatchesGolden(await renderTpl("typescript"), GOLDEN.typescript, "tpl/typescript");
  });

  it("typescript-tauri", async () => {
    assertMatchesGolden(
      await renderTpl("typescript-tauri"),
      GOLDEN.typescriptTauri,
      "tpl/typescript-tauri",
    );
  });
});

describe("golden test — agent 生成結果 (fixture) が GOLDEN と一致する", () => {
  it("typescript: single-root IR が golden と等価", async () => {
    const fixture = await loadFixture("typescript");
    assertMatchesGolden(fixture, GOLDEN.typescript, "fixture/typescript");
    expect(fixture.spec.roots).toHaveLength(1);
  });

  it("typescript-tauri: two-root IR (cross_root 含む) が golden と等価", async () => {
    const fixture = await loadFixture("typescript-tauri");
    assertMatchesGolden(
      fixture,
      GOLDEN.typescriptTauri,
      "fixture/typescript-tauri",
    );
    expect(fixture.spec.roots).toHaveLength(2);
    // cross_root 契約 (tauri-specta) は golden と一致済み (assertMatchesGolden)
  });

  it("fixtures は guardrails g-8 を満たす (## Decisions に decision_points 記録)", async () => {
    for (const stack of ["typescript", "typescript-tauri"] as const) {
      const fixture = await loadFixture(stack);
      expect(
        fixture.raw,
        `${stack}: ## Decisions section required (guardrail g-8)`,
      ).toMatch(/^## Decisions$/m);
      const decisions = fixture.data.decisions as
        | Record<string, unknown>
        | undefined;
      expect(decisions, `${stack}: frontmatter decisions: 必須`).toBeDefined();
      for (const key of ["platforms", "os_integration", "ui_native"]) {
        expect(decisions, `${stack}: decisions.${key} 必須`).toHaveProperty(key);
      }
    }
  });

  it("fixtures は agent の invariant layer_graph / slice_internal に適合する", async () => {
    const agentRaw = await readFile(
      join(REPO_ROOT, ".apm", "agents", "architect-expert.agent.md"),
      "utf8",
    );
    const invSection = agentRaw.slice(agentRaw.indexOf("## invariants"));
    const yamlBlock = invSection.match(/```yaml\s*\n([\s\S]*?)```/);
    expect(yamlBlock, "agent に invariants YAML が必要").not.toBeNull();

    for (const stack of ["typescript", "typescript-tauri"] as const) {
      const fixture = await loadFixture(stack);
      for (const root of fixture.spec.roots) {
        // root が参照する layer_set は fixture 内に定義されているか
        expect(
          fixture.spec.layer_sets[root.layer_set],
          `${stack}/${root.id}: layer_set "${root.layer_set}" 未定義`,
        ).toBeDefined();
        // layer が参照する slice_internal も定義されているか
        for (const layer of fixture.spec.layer_sets[root.layer_set]!.layers) {
          if (layer.slice_internal) {
            expect(
              fixture.spec.slice_internal[layer.slice_internal],
              `${stack}/${root.id}: slice_internal "${layer.slice_internal}" 未定義`,
            ).toBeDefined();
          }
        }
      }
    }
  });
});