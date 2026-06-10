import { readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import {
  buildMatchers,
  buildRules,
  type AdapterCheckResult,
  type AdapterOpts,
  type ArchitectureSpec,
  type OriArchAdapter,
  type RootConfig,
  type Rule,
} from "@ori-ori/parser";
import { classify, type LayerHit } from "./classify.js";
import { extractImports, languageFileExtensions } from "./imports.js";
import { resolveImport } from "./resolve.js";
import { walkSourceFiles } from "./walk.js";

interface CrossLayerRule {
  from: string;
  allow: Set<string>;
}

function toCrossLayerRules(rules: Rule[]): CrossLayerRule[] {
  return rules.map((r) => ({ from: r.from, allow: new Set(r.allow) }));
}

function isAllowed(
  importer: LayerHit,
  target: LayerHit,
  rules: CrossLayerRule[],
): { ok: boolean; reason?: string } {
  if (
    importer.kind === "slice" &&
    target.kind === "slice" &&
    importer.layerId === target.layerId &&
    importer.sliceName != null &&
    importer.sliceName === target.sliceName
  ) {
    return { ok: true };
  }
  if (
    importer.kind === "slice" &&
    target.kind === "slice" &&
    importer.layerId === target.layerId &&
    importer.sliceName !== target.sliceName
  ) {
    return {
      ok: false,
      reason: `cross-slice direct import: ${importer.sliceName} → ${target.sliceName} (use shared/contracts or shared/events)`,
    };
  }
  const rule = rules.find((r) => r.from === importer.layerId);
  if (!rule) {
    return { ok: false, reason: `no cross_layer rule for from="${importer.layerId}"` };
  }
  if (!rule.allow.has(target.layerId)) {
    return {
      ok: false,
      reason: `${importer.layerId} → ${target.layerId} not in allow-list [${[...rule.allow].join(", ") || "<empty>"}]`,
    };
  }
  return { ok: true };
}

const adapter: OriArchAdapter = {
  name: "generic",
  language: ["typescript", "javascript", "python", "rust", "go", "java"],

  async export(spec: ArchitectureSpec, root: RootConfig, _opts: AdapterOpts = {}) {
    const matchers = buildMatchers(spec, root);
    const rules = buildRules(spec, root);

    const exported = {
      version: 1,
      root: {
        id: root.id,
        path: root.path,
        language: root.language,
        slice_root: root.slice_root,
        public_entry: root.public_entry,
      },
      layer_matchers: matchers,
      cross_layer_rules: rules,
      cross_slice: spec.cross_slice,
    };

    return {
      files: [
        {
          path: ".ori/arch-rules.json",
          content: JSON.stringify(exported, null, 2) + "\n",
        },
      ],
      notes: [
        "Generic adapter ships its own checker — invoke /ori-arch check to scan the project (uses the .apm/skills/ori-arch/adapters/generic bundle).",
        "Precision is per-file regex, not AST. Use a native adapter (eslint, rust) when available.",
      ],
    };
  },

  async check(spec, root, _opts: AdapterOpts = {}): Promise<AdapterCheckResult> {
    const cwd = process.cwd();
    const matchers = buildMatchers(spec, root);
    const rules = toCrossLayerRules(buildRules(spec, root));
    const extensions = languageFileExtensions(root.language);
    if (extensions.length === 0) {
      return {
        violations: [
          {
            file: ".ori/architecture.md",
            rule: "generic-language",
            message: `Generic adapter does not handle language "${root.language}" (supported: typescript, javascript, python, rust, go, java).`,
          },
        ],
      };
    }

    const scanRoot = resolve(cwd, root.path);
    const violations: AdapterCheckResult["violations"] = [];

    for await (const abs of walkSourceFiles(scanRoot, extensions)) {
      const rel = relative(cwd, abs);
      const importerHit = classify(rel, matchers);
      if (!importerHit) continue;

      const content = await readFile(abs, "utf8");
      const imports = extractImports(content, root.language);

      for (const imp of imports) {
        const resolved = resolveImport(imp.target, abs, cwd, root.language);
        if (!resolved) continue;
        const relTarget = relative(cwd, resolved);
        const targetHit = classify(relTarget, matchers);
        if (!targetHit) continue;

        const verdict = isAllowed(importerHit, targetHit, rules);
        if (!verdict.ok) {
          violations.push({
            file: rel,
            line: imp.line,
            rule: "cross-layer",
            message: `import "${imp.target}" (→ ${targetHit.layerId}${targetHit.sliceName ? `:${targetHit.sliceName}` : ""}): ${verdict.reason}`,
          });
        }
      }
    }

    return { violations };
  },
};

export default adapter;
