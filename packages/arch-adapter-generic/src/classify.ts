import type { ArchitectureSpec, LayerSet, RootConfig } from "@ori-ori/parser";

export interface LayerMatcher {
  layerId: string;
  kind: "shared" | "slice" | "ui-layer";
  /** Path prefix (POSIX-normalized, no leading slash, ends with /). */
  prefix: string;
  /** For slice layers: which path segment after the prefix is the slice name. 0 = first */
  sliceSegment?: number;
}

export interface LayerHit {
  layerId: string;
  kind: "shared" | "slice" | "ui-layer";
  sliceName?: string;
}

function toPosix(p: string): string {
  return p.replace(/\\/g, "/");
}

function ensureTrailingSlash(p: string): string {
  return p.endsWith("/") ? p : `${p}/`;
}

function sliceBase(root: RootConfig): string {
  return root.slice_root === "."
    ? ensureTrailingSlash(root.path)
    : ensureTrailingSlash(`${root.path}/${root.slice_root}`);
}

/**
 * Build the ordered list of layer matchers for a given root.
 * Order is important: more-specific (longer) prefixes are checked first so
 * that e.g. `src/lib/shared/` wins over `src/lib/<slice>/` for a path
 * under `src/lib/shared/contracts/`.
 */
export function buildMatchers(spec: ArchitectureSpec, root: RootConfig): LayerMatcher[] {
  const set: LayerSet | undefined = spec.layer_sets[root.layer_set];
  if (!set) {
    throw new Error(`layer_set "${root.layer_set}" not found`);
  }
  const base = sliceBase(root);
  const matchers: LayerMatcher[] = [];

  for (const layer of set.layers) {
    if (layer.kind === "shared") {
      matchers.push({
        layerId: layer.id,
        kind: "shared",
        prefix: `${base}${layer.id}/`,
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
    if (layer.kind === "slice") {
      // The slice pattern is the broadest; place it last so shared/ui win.
      matchers.push({
        layerId: layer.id,
        kind: "slice",
        prefix: base,
        sliceSegment: 0,
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
    if (m.kind === "slice") {
      const segments = tail.split("/").filter(Boolean);
      // A slice folder must have at least one file inside it; a file
      // directly under slice_root is not a slice.
      if (segments.length < 2) continue;
      const sliceName = segments[m.sliceSegment ?? 0];
      if (!sliceName) continue;
      return { layerId: m.layerId, kind: m.kind, sliceName };
    }
    return { layerId: m.layerId, kind: m.kind };
  }
  return null;
}
