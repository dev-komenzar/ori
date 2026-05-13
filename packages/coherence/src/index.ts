export { type NodeRef, type Edge, type EdgeType, type Graph } from "./graph.js";
export { buildGraph, neighbors } from "./graph.js";
export { propagate, type DirtyMark } from "./propagate.js";
export { detectChangesInFile, type ChangedNode } from "./detect.js";
export { type ManifestSchema, parseManifest } from "./manifest.js";
