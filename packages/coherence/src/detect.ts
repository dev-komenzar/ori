import { extractSections, hashSection, parseFrontmatter } from "@ori/parser";
import type { NodeRef } from "./graph.js";

export type ChangedKind = "file" | "section" | "section-removed";

export interface ChangedNode {
  kind: ChangedKind;
  node: NodeRef;
}

export interface DetectOptions {
  /** "file": treat whole file as a single node. "section": use {#id} anchors. */
  level: "file" | "section";
}

/**
 * Compare previous and current content of a single document and return
 * the set of changed nodes.
 *
 * For section-level detection, frontmatter is normalised out before hashing.
 */
export function detectChangesInFile(
  filePath: string,
  prev: string | null,
  curr: string,
  opts: DetectOptions,
): ChangedNode[] {
  if (opts.level === "file") {
    if (prev === curr) return [];
    return [{ kind: "file", node: { path: filePath, sectionId: null } }];
  }

  // section level
  const prevSections = prev ? sectionHashes(prev) : new Map<string, string>();
  const currSections = sectionHashes(curr);

  const changed: ChangedNode[] = [];
  for (const [id, currHash] of currSections) {
    const prevHash = prevSections.get(id);
    if (prevHash !== currHash) {
      changed.push({ kind: "section", node: { path: filePath, sectionId: id } });
    }
  }
  for (const id of prevSections.keys()) {
    if (!currSections.has(id)) {
      changed.push({ kind: "section-removed", node: { path: filePath, sectionId: id } });
    }
  }
  return changed;
}

function sectionHashes(content: string): Map<string, string> {
  const { content: body } = parseFrontmatter(content);
  const sections = extractSections(body);
  const out = new Map<string, string>();
  for (const [id, section] of sections.byId) {
    if (section.id === null) continue; // skip anchorless sections
    out.set(id, hashSection(section.body));
  }
  return out;
}
