export { type NodeRef, type Edge, type EdgeType, type Graph } from "./graph.js";
export { buildGraph, neighbors } from "./graph.js";
export { propagate, type DirtyMark } from "./propagate.js";
export { detectChangesInFile, type ChangedNode } from "./detect.js";
export {
  type Manifest,
  type SliceManifest,
  type PageManifest,
  type ScenarioManifest,
  ManifestSchema,
  SliceManifestSchema,
  PageManifestSchema,
  ScenarioManifestSchema,
  ScenarioRunnerSchema,
  parseManifest,
} from "./manifest.js";
export {
  HASH_LENGTH,
  SPEC_KINDS,
  type SpecKind,
  type UpstreamRef,
  type SpecCoherence,
  type SpecCoherenceUpdate,
  type HashKeyConflict,
  type ExpectedCoherence,
  type SpecTarget,
  normalizeHashKey,
  resolveUpstreamPath,
  parseDerivesFrom,
  computeFileHash,
  computeExpectedCoherence,
  findSpecTarget,
  readSpecCoherence,
  writeSpecCoherence,
} from "./spec-hash.js";
