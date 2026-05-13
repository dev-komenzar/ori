import { fromMarkdown } from "mdast-util-from-markdown";
import { toString as mdToString } from "mdast-util-to-string";
import type { Heading, Root } from "mdast";
import { visit } from "unist-util-visit";

export interface Section {
  /** Section id from `{#kebab-case-id}` anchor, or null if missing */
  id: string | null;
  /** Heading depth (2 for H2, 3 for H3) */
  depth: number;
  /** Heading text with anchor markup stripped */
  heading: string;
  /** Line number where the heading starts (1-indexed) */
  startLine: number;
  /** Line number of next heading at same-or-shallower depth (exclusive), or EOF */
  endLine: number;
  /** Body content between heading and endLine (excluding the heading line itself) */
  body: string;
}

export interface SectionMap {
  /** Map from section id (or auto-generated `_h{depth}_{n}` when missing) to Section */
  byId: Map<string, Section>;
  /** Sequential list for ordered traversal */
  ordered: Section[];
}

const ID_RE = /\{#([a-z0-9][a-z0-9-]*)\}\s*$/;

export function extractSections(markdown: string): SectionMap {
  const lines = markdown.split(/\r?\n/);
  const tree = fromMarkdown(markdown) as Root;

  const headings: Array<{ node: Heading; line: number }> = [];
  visit(tree, "heading", (node: Heading) => {
    const line = node.position?.start.line;
    if (line) headings.push({ node, line });
  });

  const ordered: Section[] = [];
  for (let i = 0; i < headings.length; i++) {
    const entry = headings[i];
    if (!entry) continue;
    const { node, line: startLine } = entry;
    const depth = node.depth;
    if (depth < 2 || depth > 3) continue; // ori tracks H2/H3 only

    const fullHeading = mdToString(node);
    const idMatch = ID_RE.exec(fullHeading);
    const id = idMatch?.[1] ?? null;
    const heading = idMatch ? fullHeading.replace(ID_RE, "").trim() : fullHeading;

    // Find end: next heading with depth <= current depth
    let endLine = lines.length + 1;
    for (let j = i + 1; j < headings.length; j++) {
      const next = headings[j];
      if (!next) continue;
      if (next.node.depth <= depth) {
        endLine = next.line;
        break;
      }
    }

    const bodyLines = lines.slice(startLine, endLine - 1);
    ordered.push({
      id,
      depth,
      heading,
      startLine,
      endLine,
      body: bodyLines.join("\n"),
    });
  }

  const byId = new Map<string, Section>();
  let autoIdx = 0;
  for (const section of ordered) {
    const key = section.id ?? `_h${section.depth}_${autoIdx++}`;
    byId.set(key, section);
  }

  return { byId, ordered };
}
