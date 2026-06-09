export interface ExtractedImport {
  /** The literal import target (string between quotes / after `use` etc.) */
  target: string;
  /** 1-indexed source line */
  line: number;
  /** True if relative (./ or ../) — only relative imports can resolve to project files */
  relative: boolean;
}

const TS_PATTERNS: RegExp[] = [
  // import x from "..."; import "..."; import { x } from "...";
  /import\s+(?:[^;'"]*?\s+from\s+)?["']([^"']+)["']/g,
  // export { x } from "...";
  /export\s+(?:\*|\{[^}]*\})\s+from\s+["']([^"']+)["']/g,
  // dynamic import("...") and require("...")
  /import\s*\(\s*["']([^"']+)["']\s*\)/g,
  /require\s*\(\s*["']([^"']+)["']\s*\)/g,
];

const PY_PATTERNS: RegExp[] = [
  /^\s*from\s+([.\w]+)\s+import/gm,
  /^\s*import\s+([.\w]+)(?:\s+as\s+\w+)?/gm,
];

const RS_PATTERNS: RegExp[] = [
  /^\s*use\s+([\w:]+)/gm,
  /^\s*pub\s+use\s+([\w:]+)/gm,
];

const GO_PATTERNS: RegExp[] = [
  /^\s*import\s+"([^"]+)"/gm,
  // import (...) group — each line inside is `"path"`
  /^\s*"([^"]+)"\s*$/gm,
];

const JAVA_PATTERNS: RegExp[] = [
  /^\s*import\s+(?:static\s+)?([\w.]+)\s*;/gm,
];

const PATTERNS_BY_LANGUAGE: Record<string, RegExp[] | undefined> = {
  typescript: TS_PATTERNS,
  javascript: TS_PATTERNS,
  python: PY_PATTERNS,
  rust: RS_PATTERNS,
  go: GO_PATTERNS,
  java: JAVA_PATTERNS,
};

export function languageFileExtensions(language: string): string[] {
  switch (language) {
    case "typescript":
      return [".ts", ".tsx", ".cts", ".mts"];
    case "javascript":
      return [".js", ".jsx", ".cjs", ".mjs"];
    case "python":
      return [".py"];
    case "rust":
      return [".rs"];
    case "go":
      return [".go"];
    case "java":
      return [".java"];
    default:
      return [];
  }
}

export function extractImports(source: string, language: string): ExtractedImport[] {
  const patterns = PATTERNS_BY_LANGUAGE[language];
  if (!patterns) return [];

  const lineOffsets = computeLineOffsets(source);
  const seen = new Set<string>();
  const results: ExtractedImport[] = [];

  for (const re of patterns) {
    // Need to reset lastIndex for global regexes.
    re.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(source)) !== null) {
      const target = match[1];
      if (!target) continue;
      const line = locateLine(lineOffsets, match.index);
      const key = `${line}:${target}`;
      if (seen.has(key)) continue;
      seen.add(key);
      results.push({
        target,
        line,
        relative: target.startsWith("./") || target.startsWith("../") || target === "." || target === "..",
      });
    }
  }

  return results;
}

function computeLineOffsets(source: string): number[] {
  const offsets = [0];
  for (let i = 0; i < source.length; i++) {
    if (source[i] === "\n") offsets.push(i + 1);
  }
  return offsets;
}

function locateLine(offsets: number[], pos: number): number {
  let lo = 0;
  let hi = offsets.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1;
    const offset = offsets[mid];
    if (offset === undefined || offset > pos) {
      hi = mid - 1;
    } else {
      lo = mid;
    }
  }
  return lo + 1;
}
