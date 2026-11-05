/**
 * Coherence graph for ori.
 *
 * Edges encode the SSoT direction via `type`:
 * - `derives_from`: target depends on source as authoritative truth.
 *   The target is not edited directly; it is re-derived from the source.
 * - `references`: weak link, no SSoT enforcement.
 *
 * Propagation itself is symmetric (single algorithm); the edge type
 * does not change how a change fans out.
 */

export type EdgeType = "derives_from" | "references";

/** A node is identified by file path (relative to project root) and optional section id. */
export interface NodeRef {
  /** Relative file path, e.g. ".ori/domain/aggregates.md" */
  path: string;
  /** Section id from `{#id}` anchor, or null for whole-file node */
  sectionId: string | null;
}

export interface Edge {
  /** Subordinate side (the "child" / derived doc) */
  from: NodeRef;
  /** Authoritative side (the "parent" / SSoT) */
  to: NodeRef;
  type: EdgeType;
}

export interface Graph {
  edges: Edge[];
  /** Quick lookup index: key = nodeKey, value = adjacent edges */
  adjacency: Map<string, Edge[]>;
}

export function nodeKey(node: NodeRef): string {
  return node.sectionId ? `${node.path}#${node.sectionId}` : node.path;
}

export function buildGraph(edges: Edge[]): Graph {
  const adjacency = new Map<string, Edge[]>();
  for (const edge of edges) {
    const fromKey = nodeKey(edge.from);
    const toKey = nodeKey(edge.to);
    const fromList = adjacency.get(fromKey) ?? [];
    fromList.push(edge);
    adjacency.set(fromKey, fromList);
    const toList = adjacency.get(toKey) ?? [];
    toList.push(edge);
    adjacency.set(toKey, toList);
  }
  return { edges, adjacency };
}

export function neighbors(graph: Graph, node: NodeRef): Edge[] {
  return graph.adjacency.get(nodeKey(node)) ?? [];
}
