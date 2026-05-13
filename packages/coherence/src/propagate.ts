import { type Edge, type Graph, type NodeRef, neighbors, nodeKey } from "./graph.js";

export interface DirtyMark {
  node: NodeRef;
  via: Edge;
  source: NodeRef;
  reason: "edit" | "force";
}

/**
 * Single propagation algorithm.
 *
 * When a node changes, every adjacent node is marked dirty.
 * The action a receiver takes is decided elsewhere (edit-time guardrail,
 * proposal generator, AI re-derive prompt, etc.).
 */
export function propagate(graph: Graph, changedNode: NodeRef, reason: "edit" | "force" = "edit"): DirtyMark[] {
  const result: DirtyMark[] = [];
  const sourceKey = nodeKey(changedNode);
  for (const edge of neighbors(graph, changedNode)) {
    const other = nodeKey(edge.from) === sourceKey ? edge.to : edge.from;
    result.push({ node: other, via: edge, source: changedNode, reason });
  }
  return result;
}
