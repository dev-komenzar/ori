import type {
  ArchitectureSpec,
  LayerSet,
  OriArchAdapter,
  RootConfig,
} from "@ori-ori/parser";

interface Element {
  type: string;
  pattern: string;
  capture?: string[];
}

interface ElementTypeRule {
  from: string[];
  allow: (string | [string, Record<string, string>])[];
}

const PATTERN_EXT = "{ts,tsx,js,jsx,mts,cts,mjs,cjs}";

function ensureTrailingSlash(p: string): string {
  return p.endsWith("/") ? p : `${p}/`;
}

function rootBase(root: RootConfig): string {
  // e.g., root.path="src", root.feature_root="lib" → "src/lib/"
  // When feature_root is ".", just root.path.
  const base = root.feature_root === "." ? root.path : `${root.path}/${root.feature_root}`;
  return ensureTrailingSlash(base);
}

function buildElements(spec: ArchitectureSpec, root: RootConfig): Element[] {
  const set = spec.layer_sets[root.layer_set];
  if (!set) {
    throw new Error(`layer_set "${root.layer_set}" not found in layer_sets`);
  }
  const featBase = rootBase(root);
  const elements: Element[] = [];

  // Order matters: more-specific patterns first so eslint-plugin-boundaries
  // resolves overlaps the way we mean. We declare shared/ui-layers before
  // the wildcard feature pattern.
  for (const layer of set.layers) {
    if (layer.kind === "shared") {
      elements.push({
        type: layer.id,
        pattern: `${featBase}${layer.id}/**`,
      });
    } else if (layer.kind === "ui-layer") {
      // No path field in v1 schema — convention: <root.path>/<layer.id>/**
      elements.push({
        type: layer.id,
        pattern: `${root.path}/${layer.id}/**`,
      });
    }
  }
  for (const layer of set.layers) {
    if (layer.kind === "feature") {
      // Captures the feature folder name so cross-feature rules can compare it.
      elements.push({
        type: layer.id,
        pattern: `${featBase}*/**`,
        capture: ["featureName"],
      });
    }
  }
  return elements;
}

function buildElementTypeRules(set: LayerSet): ElementTypeRule[] {
  const featureLayerIds = new Set(
    set.layers.filter((l) => l.kind === "feature").map((l) => l.id),
  );
  const rules: ElementTypeRule[] = [];

  for (const cr of set.rules.cross_layer) {
    const isFeature = featureLayerIds.has(cr.from);
    const allow: ElementTypeRule["allow"] = cr.allow.map((target) => {
      if (target === cr.from && isFeature) {
        // Same-layer for "feature" layers means same feature only — enforce via capture.
        return [target, { featureName: "${from.featureName}" }];
      }
      return target;
    });

    if (isFeature && !cr.allow.includes(cr.from)) {
      // Cross-feature isolation: feature must be allowed to import from
      // itself, otherwise even feature-internal imports would be forbidden.
      allow.push([cr.from, { featureName: "${from.featureName}" }]);
    }

    rules.push({ from: [cr.from], allow });
  }

  return rules;
}

function layerFileGlob(
  spec: ArchitectureSpec,
  root: RootConfig,
  layerId: string,
): string | null {
  const set = spec.layer_sets[root.layer_set];
  if (!set) return null;
  const layer = set.layers.find((l) => l.id === layerId);
  if (!layer) return null;
  const featBase = rootBase(root);
  if (layer.kind === "shared") {
    return `${featBase}${layer.id}/**/*.${PATTERN_EXT}`;
  }
  if (layer.kind === "ui-layer") {
    return `${root.path}/${layer.id}/**/*.${PATTERN_EXT}`;
  }
  if (layer.kind === "feature") {
    return `${featBase}*/**/*.${PATTERN_EXT}`;
  }
  return null;
}

interface ForbiddenBlock {
  files: string;
  paths: { name: string; message: string }[];
}

function buildForbiddenBlocks(spec: ArchitectureSpec, root: RootConfig): ForbiddenBlock[] {
  const set = spec.layer_sets[root.layer_set];
  if (!set) return [];
  const blocks: ForbiddenBlock[] = [];
  for (const fi of set.rules.forbidden_imports ?? []) {
    const glob = layerFileGlob(spec, root, fi.from);
    if (!glob) continue;
    const paths = fi.modules.map((module) => ({
      name: module,
      message:
        fi.reason ?? `forbidden by .ori/architecture.md (from=${fi.from})`,
    }));
    blocks.push({ files: glob, paths });
  }
  return blocks;
}

function stringifyForbiddenBlock(block: ForbiddenBlock): string {
  const pathsJson = JSON.stringify(block.paths, null, 2)
    .split("\n")
    .map((line, i) => (i === 0 ? line : `          ${line}`))
    .join("\n");

  return `  {
    files: ["${block.files}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: ${pathsJson},
        },
      ],
    },
  }`;
}

function stringifyConfig(
  elements: Element[],
  rules: ElementTypeRule[],
  root: RootConfig,
  forbiddenBlocks: ForbiddenBlock[],
): string {
  const elementsJson = JSON.stringify(elements, null, 2)
    .split("\n")
    .map((line, i) => (i === 0 ? line : `    ${line}`))
    .join("\n");

  // ${from.featureName} must be emitted as a string literal — not interpolated
  // by JSON.stringify (it preserves the dollar sign fine, but we double-check).
  const rulesJson = JSON.stringify(rules, null, 2)
    .split("\n")
    .map((line, i) => (i === 0 ? line : `        ${line}`))
    .join("\n");

  const filePattern = `${root.path}/**/*.${PATTERN_EXT}`;

  const trailingBlocks =
    forbiddenBlocks.length > 0
      ? ",\n" + forbiddenBlocks.map(stringifyForbiddenBlock).join(",\n")
      : "";

  return `// AUTO-GENERATED by @ori-ori/arch-adapter-eslint — do not edit.
// Regenerate with: ori arch export --adapter=eslint
// Source: .ori/architecture.md
//
// Usage: extend your eslint.config.js by spreading this array:
//   import oriArch from "./eslint.config.ori.js";
//   export default [...oriArch, /* your rules */];

import boundaries from "eslint-plugin-boundaries";

export default [
  {
    files: ["${filePattern}"],
    plugins: { boundaries },
    settings: {
      "boundaries/elements": ${elementsJson},
    },
    rules: {
      "boundaries/element-types": [
        "error",
        {
          default: "disallow",
          rules: ${rulesJson},
        },
      ],
      "boundaries/no-private": ["error", { allowUncles: true }],
      "boundaries/no-unknown": "off",
    },
  }${trailingBlocks},
];
`;
}

const adapter: OriArchAdapter = {
  name: "eslint",
  language: ["typescript", "javascript"],
  async export(spec, root) {
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

    const elements = buildElements(spec, root);
    const rules = buildElementTypeRules(set);
    const forbiddenBlocks = buildForbiddenBlocks(spec, root);
    const content = stringifyConfig(elements, rules, root, forbiddenBlocks);

    const notes: string[] = [];
    if (spec.cross_feature.prohibited_direct) {
      notes.push(
        "Cross-feature direct imports are enforced via the boundaries 'featureName' capture; allowed bridges (shared/contracts, shared/events) live under the shared element.",
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
    notes.push(
      "Install peers: pnpm add -D eslint eslint-plugin-boundaries",
    );

    return {
      files: [{ path: "eslint.config.ori.js", content }],
      notes,
    };
  },
};

export default adapter;
