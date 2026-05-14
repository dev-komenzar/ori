import { createRequire } from "node:module";
import { readdir, readFile, mkdir, writeFile, access } from "node:fs/promises";
import { dirname, join, relative } from "node:path";

export const AVAILABLE_TEMPLATES = ["ddd-typescript", "ddd-typescript-tauri"] as const;
export type TemplateName = (typeof AVAILABLE_TEMPLATES)[number];

export function isKnownTemplate(name: string): name is TemplateName {
  return (AVAILABLE_TEMPLATES as readonly string[]).includes(name);
}

export function resolveTemplateRoot(name: TemplateName): string {
  const require = createRequire(import.meta.url);
  const inner = require.resolve(`@ori-ori/templates/${name}/package.json`);
  return dirname(inner);
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function walk(root: string): Promise<string[]> {
  const out: string[] = [];
  async function visit(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === "dist") continue;
        await visit(full);
      } else if (entry.isFile()) {
        out.push(full);
      }
    }
  }
  await visit(root);
  return out;
}

export interface CopyTemplateOptions {
  readonly src: string;
  readonly dest: string;
  readonly force: boolean;
}

export interface CopyTemplateResult {
  readonly written: string[];
  readonly skipped: string[];
}

export async function copyTemplate(opts: CopyTemplateOptions): Promise<CopyTemplateResult> {
  const files = await walk(opts.src);
  const written: string[] = [];
  const skipped: string[] = [];
  for (const file of files) {
    const rel = relative(opts.src, file);
    const target = join(opts.dest, rel);
    if (!opts.force && (await exists(target))) {
      skipped.push(rel);
      continue;
    }
    await mkdir(dirname(target), { recursive: true });
    const contents = await readFile(file);
    await writeFile(target, contents);
    written.push(rel);
  }
  return { written, skipped };
}
