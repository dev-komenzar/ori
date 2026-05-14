import type { ArchitectureSpec, LayerSet, RootConfig } from "@ori-ori/parser";

export interface LayerMatcher {
  layerId: string;
  kind: "shared" | "feature" | "ui-layer";
  /** Path prefix (POSIX-normalized, no leading slash, ends with /). */
  prefix: string;
  /** For feature layers: which path segment after the prefix is the feature name. 0 = first */
  featureSegment?: number;
}

export interface LayerHit {
  layerId: string;
  kind: "shared" | "feature" | "ui-layer";
  featureName?: string;
}

function toPosix(p: string): string {
  return p.replace(/\\/g, "/");
}

function ensureTrailingSlash(p: string): string {
  return p.endsWith("/") ? p : `${p}/`;
}

function featureBase(root: RootConfig): string {
  return root.feature_root === "."
    ? ensureTrailingSlash(root.path)
    : ensureTrailingSlash(`${root.path}/${root.feature_root}`);
}

/**
 * Build the ordered list of layer matchers for a given root.
 * Order is important: more-specific (longer) prefixes are checked first so
 * that e.g. `src/lib/shared/` wins over `src/lib/<feature>/` for a path
 * under `src/lib/shared/contracts/`.
 */
export function buildMatchers(spec: ArchitectureSpec, root: RootConfig): LayerMatcher[] {
  const set: LayerSet | undefined = spec.layer_sets[root.layer_set];
  if (!set) {
    throw new Error(`layer_set "${root.layer_set}" not found`);
  }
  const featBase = featureBase(root);
  const matchers: LayerMatcher[] = [];

  for (const layer of set.layers) {
    if (layer.kind === "shared") {
      matchers.push({
        layerId: layer.id,
        kind: "shared",
        prefix: `${featBase}${layer.id}/`,
      });
    } else if (layer.kind === "ui-layer") {
      matchers.push({
        layerId: layer.id,
        kind: "ui-layer",
        prefix: `${root.path}/${layer.id}/`,
      });
    }
  }
  for (const layer of set.layers) {
    if (layer.kind === "feature") {
      // The feature pattern is the broadest; place it last so shared/ui win.
      matchers.push({
        layerId: layer.id,
        kind: "feature",
        prefix: featBase,
        featureSegment: 0,
      });
    }
  }

  return matchers;
}

export function classify(relPath: string, matchers: LayerMatcher[]): LayerHit | null {
  const p = toPosix(relPath);
  for (const m of matchers) {
    if (!p.startsWith(m.prefix)) continue;
    const tail = p.slice(m.prefix.length);
    if (m.kind === "feature") {
      const segments = tail.split("/").filter(Boolean);
      // A feature folder must have at least one file inside it; a file
      // directly under feature_root is not a feature.
      if (segments.length < 2) continue;
      const featureName = segments[m.featureSegment ?? 0];
      if (!featureName) continue;
      return { layerId: m.layerId, kind: m.kind, featureName };
    }
    return { layerId: m.layerId, kind: m.kind };
  }
  return null;
}
