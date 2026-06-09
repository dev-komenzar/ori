import { readdir } from "node:fs/promises";
import { extname, join } from "node:path";

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "out",
  "target",
  ".next",
  ".turbo",
  ".cache",
  "__pycache__",
  ".venv",
  "venv",
]);

export async function* walkSourceFiles(
  rootDir: string,
  extensions: string[],
): AsyncGenerator<string> {
  let entries;
  try {
    entries = await readdir(rootDir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".")) {
      // Skip hidden dirs/files (e.g. .git) but allow .ori (it has no source files anyway)
      if (entry.name !== ".ori") continue;
    }
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(rootDir, entry.name);
    if (entry.isDirectory()) {
      yield* walkSourceFiles(full, extensions);
    } else if (entry.isFile() && extensions.includes(extname(entry.name))) {
      yield full;
    }
  }
}
