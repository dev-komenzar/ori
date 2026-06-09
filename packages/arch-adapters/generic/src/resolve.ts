import { existsSync } from "node:fs";
import { dirname, join, normalize, resolve as pathResolve } from "node:path";
import { languageFileExtensions } from "./imports.js";

/**
 * Resolve an import target string to an in-project file path (relative to projectRoot),
 * or null if it cannot be resolved (e.g. bare specifier, external package).
 *
 * For v0.1 the generic adapter handles only:
 *   - relative paths (./foo, ../foo/bar)
 *   - Rust `use crate::x::y` (mapped to root.path/x/y/) — best-effort
 *   - Python relative `from .foo import x` (mapped to importer's dir)
 *
 * Bare specifiers (e.g. `react`, `serde`) are not project files and return null.
 */
export function resolveImport(
  target: string,
  importerAbsPath: string,
  projectRoot: string,
  language: string,
): string | null {
  if (language === "rust") {
    return resolveRust(target, importerAbsPath, projectRoot);
  }
  if (language === "python") {
    return resolvePython(target, importerAbsPath, projectRoot);
  }
  // TS / JS / Go / Java: only relative paths resolve to project files.
  if (!isRelative(target)) return null;

  const importerDir = dirname(importerAbsPath);
  const candidateBase = normalize(pathResolve(importerDir, target));
  const exts = languageFileExtensions(language);

  // Try direct file with each extension, then as directory/index.<ext>
  for (const ext of exts) {
    const direct = candidateBase + ext;
    if (existsSync(direct)) return direct;
  }
  for (const ext of exts) {
    const indexFile = join(candidateBase, `index${ext}`);
    if (existsSync(indexFile)) return indexFile;
  }
  // Even if no file exists on disk, return the speculative path so the
  // classifier can still bucket the import. Use the first extension as
  // a guess; downstream only cares about the directory prefix.
  if (exts.length > 0) {
    return candidateBase + exts[0];
  }
  return candidateBase;
}

function isRelative(t: string): boolean {
  return t.startsWith("./") || t.startsWith("../") || t === "." || t === "..";
}

function resolveRust(target: string, importerAbsPath: string, projectRoot: string): string | null {
  // `use crate::a::b` → <projectRoot>/<root.path is implied>/a/b
  // We don't have root.path here; resolveRust returns relative to projectRoot
  // assuming the caller has already pointed projectRoot at the right place.
  if (target.startsWith("crate::")) {
    const segments = target.slice("crate::".length).split("::").filter(Boolean);
    if (segments.length === 0) return null;
    return pathResolve(projectRoot, ...segments) + ".rs";
  }
  if (target.startsWith("super::") || target.startsWith("self::")) {
    const drop = target.startsWith("super::") ? "super::" : "self::";
    const segments = target.slice(drop.length).split("::").filter(Boolean);
    const baseDir = drop === "super::" ? dirname(dirname(importerAbsPath)) : dirname(importerAbsPath);
    return pathResolve(baseDir, ...segments) + ".rs";
  }
  return null;
}

function resolvePython(target: string, importerAbsPath: string, projectRoot: string): string | null {
  if (target.startsWith(".")) {
    // Count leading dots: one dot = current package, two = parent, etc.
    const dotMatch = target.match(/^(\.+)(.*)$/);
    if (!dotMatch) return null;
    const dots = dotMatch[1]!.length;
    const rest = dotMatch[2]!.replace(/^\./, "").split(".").filter(Boolean);
    let baseDir = dirname(importerAbsPath);
    for (let i = 1; i < dots; i++) baseDir = dirname(baseDir);
    return pathResolve(baseDir, ...rest) + ".py";
  }
  // Absolute python imports — best-effort: treat as <projectRoot>/<segments>.py
  const segs = target.split(".").filter(Boolean);
  if (segs.length === 0) return null;
  return pathResolve(projectRoot, ...segs) + ".py";
}
