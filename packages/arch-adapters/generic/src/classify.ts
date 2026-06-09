import type { Matcher } from "@ori-ori/parser";

export interface LayerHit {
  layerId: string;
  kind: "shared" | "slice" | "ui-layer";
  sliceName?: string;
}

function toPosix(p: string): string {
  return p.replace(/\\/g, "/");
}

/**
 * Match a (POSIX-normalized) project-relative path against the IR matchers
 * produced by `buildMatchers()`. Slice matchers require at least two segments
 * after the prefix (slice name + 1 file) so a bare file under slice_root is
 * not treated as a slice.
 */
export function classify(relPath: string, matchers: Matcher[]): LayerHit | null {
  const p = toPosix(relPath);
  for (const m of matchers) {
    if (!p.startsWith(m.prefix)) continue;
    const tail = p.slice(m.prefix.length);
    if (m.slice) {
      const segments = tail.split("/").filter(Boolean);
      if (segments.length < 2) continue;
      const sliceName = segments[0];
      if (!sliceName) continue;
      return { layerId: m.layerId, kind: m.kind, sliceName };
    }
    return { layerId: m.layerId, kind: m.kind };
  }
  return null;
}
