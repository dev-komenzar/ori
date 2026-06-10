import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildMatchers,
  buildRules,
  type AdapterOpts,
  type ArchitectureSpec,
  type Matcher,
  type OriArchAdapter,
  type Rule,
  type RootConfig,
  type SliceInternal,
} from "@ori-ori/parser";

interface ElementEntry {
  type: string;
  pattern: string;
  capture?: string[];
}

interface DependencyAllowEntry {
  to: {
    type: string;
    captured?: Record<string, string>;
  };
}

interface DependencyRuleEntry {
  from: { type: string; captured?: Record<string, string> };
  allow: DependencyAllowEntry[];
}

interface RestrictedPath {
  name: string;
  message: string;
}

interface ForbiddenBlock {
  files: string[];
  rules: {
    "no-restricted-imports": [
      "error",
      { paths: RestrictedPath[] },
    ];
  };
}

const PATTERN_EXT = "{ts,tsx,js,jsx,mts,cts,mjs,cjs}";

function defaultTemplatesDir(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "templates");
}

function appPrefix(root: RootConfig): string {
  return root.app ? `apps/${root.app}/` : "";
}

function stripPrefix(value: string, prefix: string): string {
  if (!prefix) return value;
  return value.startsWith(prefix) ? value.slice(prefix.length) : value;
}

function sliceInternalFor(
  spec: ArchitectureSpec,
  root: RootConfig,
  layerId: string,
): SliceInternal | undefined {
  const set = spec.layer_sets[root.layer_set];
  if (!set) return undefined;
  const layer = set.layers.find((l) => l.id === layerId);
  if (!layer || layer.kind !== "slice" || !layer.slice_internal) return undefined;
  return spec.slice_internal[layer.slice_internal];
}

function buildElements(
  spec: ArchitectureSpec,
  root: RootConfig,
  matchers: Matcher[],
  prefix: string,
): ElementEntry[] {
  return matchers.map((m) => {
    const pattern = stripPrefix(m.prefix, prefix);
    if (m.slice) {
      const si = sliceInternalFor(spec, root, m.layerId);
      if (si) {
        return {
          type: m.layerId,
          pattern: `${pattern}*/*/**`,
          capture: ["sliceName", "subLayer"],
        };
      }
      return {
        type: m.layerId,
        pattern: `${pattern}*/**`,
        capture: ["sliceName"],
      };
    }
    return { type: m.layerId, pattern: `${pattern}**` };
  });
}

function buildDependencyRules(
  spec: ArchitectureSpec,
  root: RootConfig,
  rules: Rule[],
): DependencyRuleEntry[] {
  const set = spec.layer_sets[root.layer_set]!;
  const sliceLayerIds = new Set(
    set.layers.filter((l) => l.kind === "slice").map((l) => l.id),
  );
  const expanded: DependencyRuleEntry[] = [];
  for (const rule of rules) {
    const isSlice = sliceLayerIds.has(rule.from);
    const sliceInternal = isSlice
      ? sliceInternalFor(spec, root, rule.from)
      : undefined;

    if (isSlice && sliceInternal) {
      for (const subLayer of sliceInternal.sub_layers) {
        const allow: DependencyAllowEntry[] = [];
        for (const target of rule.allow) {
          if (target === rule.from) continue;
          allow.push({ to: { type: target } });
        }
        const siRule = sliceInternal.rules.find((r) => r.from === subLayer);
        if (siRule) {
          for (const targetSub of siRule.allow) {
            allow.push({
              to: {
                type: rule.from,
                captured: {
                  sliceName: "{{from.sliceName}}",
                  subLayer: targetSub,
                },
              },
            });
          }
        }
        expanded.push({
          from: { type: rule.from, captured: { subLayer } },
          allow,
        });
      }
      continue;
    }

    const allow: DependencyAllowEntry[] = rule.allow.map((target) => {
      if (target === rule.from && isSlice) {
        return {
          to: {
            type: target,
            captured: { sliceName: "{{from.sliceName}}" },
          },
        };
      }
      return { to: { type: target } };
    });
    if (isSlice && !rule.allow.includes(rule.from)) {
      allow.push({
        to: {
          type: rule.from,
          captured: { sliceName: "{{from.sliceName}}" },
        },
      });
    }
    expanded.push({ from: { type: rule.from }, allow });
  }
  return expanded;
}

function layerFileGlob(
  spec: ArchitectureSpec,
  root: RootConfig,
  matchers: Matcher[],
  layerId: string,
  prefix: string,
): string | null {
  const set = spec.layer_sets[root.layer_set];
  if (!set) return null;
  const matcher = matchers.find((m) => m.layerId === layerId);
  if (!matcher) return null;
  const stripped = stripPrefix(matcher.prefix, prefix);
  if (matcher.slice) {
    return `${stripped}*/**/*.${PATTERN_EXT}`;
  }
  return `${stripped}**/*.${PATTERN_EXT}`;
}

function buildForbiddenBlocks(
  spec: ArchitectureSpec,
  root: RootConfig,
  matchers: Matcher[],
  prefix: string,
): ForbiddenBlock[] {
  const set = spec.layer_sets[root.layer_set];
  if (!set) return [];
  const blocks: ForbiddenBlock[] = [];
  for (const fi of set.rules.forbidden_imports ?? []) {
    const glob = layerFileGlob(spec, root, matchers, fi.from, prefix);
    if (!glob) continue;
    const paths: RestrictedPath[] = fi.modules.map((module) => ({
      name: module,
      message:
        fi.reason ?? `forbidden by .ori/architecture.md (from=${fi.from})`,
    }));
    blocks.push({
      files: [glob],
      rules: {
        "no-restricted-imports": ["error", { paths }],
      },
    });
  }
  return blocks;
}

function renderJsonExpr(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function applyPlaceholders(template: string, subs: Record<string, string>): string {
  let out = template;
  for (const [key, value] of Object.entries(subs)) {
    out = out.replaceAll(`__ORI_${key}__`, value);
  }
  return out;
}

const adapter: OriArchAdapter = {
  name: "eslint",
  language: ["typescript", "javascript"],

  async export(spec, root, opts: AdapterOpts = {}) {
    if (root.language !== "typescript" && root.language !== "javascript") {
      return {
        files: [],
        notes: [
          `eslint adapter skipped: root "${root.id}" is language=${root.language}, not typescript/javascript.`,
        ],
      };
    }
    const set = spec.layer_sets[root.layer_set];
    if (!set) {
      throw new Error(`layer_set "${root.layer_set}" not found in layer_sets`);
    }

    const prefix = appPrefix(root);
    const matchers = buildMatchers(spec, root);
    const irRules = buildRules(spec, root);
    const elements = buildElements(spec, root, matchers, prefix);
    const dependencyRules = buildDependencyRules(spec, root, irRules);
    const forbiddenBlocks = buildForbiddenBlocks(spec, root, matchers, prefix);
    const relRootPath = stripPrefix(root.path, prefix);
    const filePattern = `${relRootPath}/**/*.${PATTERN_EXT}`;

    const templatesDir = opts.templatesDir ?? defaultTemplatesDir();
    const template = await readFile(join(templatesDir, "flat-config.js.tpl"), "utf8");

    const content = applyPlaceholders(template, {
      FILE_PATTERN: filePattern,
      ELEMENTS: renderJsonExpr(elements),
      RULES: renderJsonExpr(dependencyRules),
      EXTRA_BLOCKS: renderJsonExpr(forbiddenBlocks),
    });

    const notes: string[] = [];
    if (spec.cross_slice.prohibited_direct) {
      notes.push(
        "Cross-slice direct imports are enforced via the boundaries 'sliceName' capture; allowed bridges (shared/contracts, shared/events) live under the shared element.",
      );
    }
    if (set.rules.public_entry_required && root.public_entry !== "index.ts") {
      notes.push(
        `boundaries/no-private assumes the public entry is index.ts; root declares "${root.public_entry}". Adjust your eslint resolver if needed.`,
      );
    }
    if (forbiddenBlocks.length > 0) {
      notes.push(
        `Emitted ${forbiddenBlocks.length} no-restricted-imports override(s) from forbidden_imports entries.`,
      );
    }
    const sliceLayersWithInternal = set.layers
      .filter((l) => l.kind === "slice" && l.slice_internal)
      .map((l) => l.id);
    const sliceInternalActive = sliceLayersWithInternal.filter(
      (id) => sliceInternalFor(spec, root, id) !== undefined,
    );
    const sliceInternalMissing = sliceLayersWithInternal.filter(
      (id) => sliceInternalFor(spec, root, id) === undefined,
    );
    if (sliceInternalActive.length > 0) {
      notes.push(
        `Slice-internal sub-layer enforcement is active for [${sliceInternalActive.join(", ")}]; the boundaries 'subLayer' capture pins presentation→application→domain (etc.) inside each slice.`,
      );
    }
    if (sliceInternalMissing.length > 0) {
      notes.push(
        `Layer(s) [${sliceInternalMissing.join(", ")}] declare 'slice_internal:' but no matching top-level 'slice_internal' block was found; slice-internal sub-layer rules are NOT enforced for those layers.`,
      );
    }
    if (prefix) {
      notes.push(
        `Emitted at ${prefix}eslint.config.ori.js with app-relative file globs; run \`pnpm exec eslint .\` from ${prefix.replace(/\/$/, "")} or \`pnpm exec eslint ${prefix}\` from the repo root.`,
      );
    }
    notes.push("Install peers: pnpm add -D eslint eslint-plugin-boundaries");

    return {
      files: [{ path: `${prefix}eslint.config.ori.js`, content }],
      notes,
    };
  },
};

export default adapter;
