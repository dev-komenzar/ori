import type { ArchitectureSpec, RootConfig } from "./architecture.js";

export interface Matcher {
  layerId: string;
  kind: "shared" | "slice" | "ui-layer";
  /** Trailing-slash path prefix for matching files. e.g. "src/lib/shared/", "src/lib/". */
  prefix: string;
  /** True for slice matchers (captures slice-name segment for cross-slice isolation). */
  slice: boolean;
}

export interface Rule {
  from: string;
  allow: string[];
}

export interface Bridge {
  /** Slice layer id this bridge originates from. */
  from: string;
  /** Bridge path (e.g. "shared/contracts", "shared/events") that allows cross-slice traversal. */
  via: string;
}

function ensureTrailingSlash(p: string): string {
  return p.endsWith("/") ? p : `${p}/`;
}

function sliceBase(root: RootConfig): string {
  return root.slice_root === "."
    ? ensureTrailingSlash(root.path)
    : ensureTrailingSlash(`${root.path}/${root.slice_root}`);
}

function slicePrefix(root: RootConfig): string {
  const base = sliceBase(root);
  const sub = root.slice_subdir;
  if (!sub || sub === "" || sub === ".") return base;
  return ensureTrailingSlash(`${base.replace(/\/$/, "")}/${sub}`);
}

/**
 * Compute the path-prefix matchers for one root, ordered shared/ui-layer first
 * (more specific) and slice last (wildcard). Order matters for adapters that
 * resolve overlapping globs (e.g. eslint-plugin-boundaries).
 */
export function buildMatchers(spec: ArchitectureSpec, root: RootConfig): Matcher[] {
  const set = spec.layer_sets[root.layer_set];
  if (!set) {
    throw new Error(`layer_set "${root.layer_set}" not found in layer_sets`);
  }
  const base = sliceBase(root);
  const slicePref = slicePrefix(root);
  const matchers: Matcher[] = [];
  for (const layer of set.layers) {
    if (layer.kind === "shared") {
      matchers.push({
        layerId: layer.id,
        kind: "shared",
        prefix: `${base}${layer.id}/`,
        slice: false,
      });
    } else if (layer.kind === "ui-layer") {
      matchers.push({
        layerId: layer.id,
        kind: "ui-layer",
        prefix: `${root.path}/${layer.id}/`,
        slice: false,
      });
    }
  }
  for (const layer of set.layers) {
    if (layer.kind === "slice") {
      matchers.push({
        layerId: layer.id,
        kind: "slice",
        prefix: slicePref,
        slice: true,
      });
    }
  }
  return matchers;
}

/**
 * Returns the cross-layer rules as a flat list (one per `from` layer).
 * Adapters lower this to language-specific allow-lists.
 */
export function buildRules(spec: ArchitectureSpec, root: RootConfig): Rule[] {
  const set = spec.layer_sets[root.layer_set];
  if (!set) {
    throw new Error(`layer_set "${root.layer_set}" not found in layer_sets`);
  }
  return set.rules.cross_layer.map((cr) => ({
    from: cr.from,
    allow: [...cr.allow],
  }));
}

/**
 * Returns the bridges (cross-slice allowed paths) — one entry per
 * (slice-layer, via-path) pair derived from `cross_slice.via`.
 */
export function buildBridges(spec: ArchitectureSpec, root: RootConfig): Bridge[] {
  const set = spec.layer_sets[root.layer_set];
  if (!set) return [];
  const sliceLayerIds = set.layers.filter((l) => l.kind === "slice").map((l) => l.id);
  const bridges: Bridge[] = [];
  for (const via of spec.cross_slice.via ?? []) {
    for (const fromLayer of sliceLayerIds) {
      bridges.push({ from: fromLayer, via });
    }
  }
  return bridges;
}
