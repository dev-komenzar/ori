import { execSync } from "node:child_process";
import { access, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { parse as parseYaml, stringify as yamlStringify } from "yaml";
import { consola } from "consola";
import type { NodeRef } from "@ori-ori/coherence";
import type { DirtyEntry } from "@ori-ori/slice-runner";

const args = process.argv.slice(2);
function flag(name: string): string | undefined {
  const idx = args.findIndex((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (idx === -1) return undefined;
  const a = args[idx]!;
  if (a.includes("=")) return a.split("=").slice(1).join("=");
  return args[idx + 1];
}
function boolFlag(name: string): boolean {
  return args.some((a) => a === `--${name}` || a.startsWith(`--${name}=`));
}

const fileArg = flag("file");
const since = flag("since") ?? "HEAD";
const check = boolFlag("check");
const force = boolFlag("force");
function resolveForceTarget(): string | undefined {
  const eq = flag("force");
  if (eq !== undefined && !eq.startsWith("-")) return eq;
  const idx = args.indexOf("--force");
  if (idx !== -1) {
    const next = args[idx + 1];
    if (next && !next.startsWith("-")) return next;
  }
  return undefined;
}
const forceTarget = resolveForceTarget();

async function exists(p: string): Promise<boolean> {
  try { await access(p); return true; } catch { return false; }
}

async function findProjectRoot(start: string): Promise<string> {
  let d = resolve(start);
  while (d !== "/") {
    if (await exists(join(d, ".ori"))) return d;
    d = dirname(d);
  }
  throw new Error("project root not found (.ori/ missing)");
}

const root = await findProjectRoot(process.cwd());
process.chdir(root);

function gitDiffNames(sinceRef: string): string[] {
  try {
    const out = execSync(`git diff --name-only ${sinceRef} -- .ori/domain/`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return out.split("\n").map((s) => s.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function normalizeRef(s: string): { path: string; sectionId: string | null } {
  const [p, sec] = s.split("#");
  const path = (p ?? "").replace(/^\.\//, "");
  return { path, sectionId: sec ? sec.trim() : null };
}

function pathMatches(derivesValue: string, changedFile: string): boolean {
  const ref = normalizeRef(derivesValue);
  const changed = changedFile.replace(/^\.\//, "");
  if (ref.path === changed) return true;
  // derives_from may be written without the leading ".ori/" prefix
  if (`.ori/${ref.path}` === changed) return true;
  if (ref.path === changed.replace(/^\.ori\//, "")) return true;
  return false;
}

interface ManifestEntry {
  id: string;
  kind: "slice" | "page";
  dir: string;
  manifest: any;
}

async function listManifests(): Promise<ManifestEntry[]> {
  const out: ManifestEntry[] = [];
  for (const kind of ["slices", "pages"] as const) {
    const baseDir = join(root, ".ori", kind);
    if (!(await exists(baseDir))) continue;
    const entries = await readdir(baseDir, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const dir = join(baseDir, e.name);
      const manifestPath = join(dir, "manifest.yaml");
      if (!(await exists(manifestPath))) continue;
      try {
        const yaml = await readFile(manifestPath, "utf8");
        const manifest = parseYaml(yaml);
        out.push({ id: e.name, kind: kind === "slices" ? "slice" : "page", dir, manifest });
      } catch (err) {
        consola.warn(`failed to parse ${relative(root, manifestPath)}: ${(err as Error).message}`);
      }
    }
  }
  return out;
}

function collectDerivedRefs(manifest: any): string[] {
  const refs: string[] = [];
  if (Array.isArray(manifest?.derives_from)) {
    for (const r of manifest.derives_from) if (typeof r === "string") refs.push(r);
  }
  if (Array.isArray(manifest?.relations)) {
    for (const rel of manifest.relations) {
      if (rel && rel.type === "derives_from" && typeof rel.target === "string") {
        refs.push(rel.target);
      }
    }
  }
  return refs;
}

async function appendDirty(
  statusPath: string,
  newEntries: DirtyEntry[],
): Promise<number> {
  let status: any = {};
  if (await exists(statusPath)) {
    const raw = await readFile(statusPath, "utf8");
    status = parseYaml(raw) ?? {};
  }
  const existing: DirtyEntry[] = Array.isArray(status.dirty) ? status.dirty : [];
  const key = (e: DirtyEntry) =>
    `${e.source.path}#${e.source.sectionId ?? ""}|${e.affected_phase}|${e.reason ?? ""}`;
  const seen = new Set(existing.map(key));
  let added = 0;
  for (const e of newEntries) {
    if (seen.has(key(e))) continue;
    existing.push(e);
    seen.add(key(e));
    added++;
  }
  status.dirty = existing;
  await writeFile(statusPath, yamlStringify(status), "utf8");
  return added;
}

async function generateProposal(forcedPath: string): Promise<string> {
  const proposalsDir = join(root, ".ori/proposals");
  await mkdir(proposalsDir, { recursive: true });

  const rel = relative(root, resolve(root, forcedPath));
  // identify owning slice/page (path is .ori/<kind>/<id>/...)
  const segs = rel.split("/");
  let owner = "unknown";
  if (segs[0] === ".ori" && (segs[1] === "slices" || segs[1] === "pages") && segs[2]) {
    owner = segs[2];
  }

  const manifests = await listManifests();
  const ownerEntry = manifests.find((m) => m.id === owner);
  const upstream = ownerEntry ? collectDerivedRefs(ownerEntry.manifest) : [];
  const targetSlug = upstream[0]
    ? upstream[0].replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase()
    : "target";

  const date = new Date().toISOString().slice(0, 10);
  const file = join(proposalsDir, `${date}-${owner}-${targetSlug}.md`);

  const body = `---
date: ${date}
slice: ${owner}
edited_file: ${rel}
upstream:
${upstream.length ? upstream.map((u) => `  - ${u}`).join("\n") : "  - <unknown>"}
status: pending
---

# Proposal: propagate edits from \`${rel}\` upstream

This proposal was auto-generated by \`/ori-sync --force\` because a derived
document was edited directly. Human review is required before the change
can be merged into the source of truth.

## Edited file
- \`${rel}\`

## Suggested upstream targets
${upstream.length ? upstream.map((u) => `- \`${u}\``).join("\n") : "- _(no derives_from declared; please specify manually)_"}

## Next steps
1. Inspect the diff in \`${rel}\` (e.g. \`git diff -- ${rel}\`).
2. Decide how to reflect those edits in the upstream targets above.
3. Run \`/ori-review-proposals\` to accept / reject / merge this proposal.
`;
  await writeFile(file, body, "utf8");
  return file;
}

async function run(): Promise<void> {
  // 1. determine changed files
  let changedFiles: string[];
  if (fileArg) {
    changedFiles = [relative(root, resolve(process.cwd(), fileArg)) || fileArg];
  } else {
    changedFiles = gitDiffNames(since);
  }

  // 2. proposal generation for --force
  let proposalPath: string | undefined;
  if (force) {
    const target = forceTarget ?? fileArg;
    if (!target) {
      consola.error("--force requires a target path (e.g. --force <path> or --file=<path> --force)");
      process.exit(2);
    }
    proposalPath = await generateProposal(target);
    consola.success(`generated proposal: ${relative(root, proposalPath)}`);
    if (!changedFiles.length) changedFiles = [relative(root, resolve(root, target))];
  }

  if (!changedFiles.length) {
    consola.success(`/ori-sync: no domain changes since ${since}`);
    if (check) {
      // also check existing dirty marks
      const dirtyRemaining = await countRemainingDirty();
      if (dirtyRemaining > 0) {
        consola.error(`${dirtyRemaining} dirty mark(s) still pending across slices/pages`);
        process.exit(1);
      }
    }
    process.exit(0);
  }

  consola.info(`/ori-sync: ${changedFiles.length} changed file(s) (since=${since})`);
  for (const f of changedFiles) consola.log(`  - ${f}`);

  // 3. find affected slices/pages
  const manifests = await listManifests();
  const now = new Date().toISOString();
  let totalDirty = 0;
  const affectedIds: string[] = [];

  for (const m of manifests) {
    const refs = collectDerivedRefs(m.manifest);
    if (!refs.length) continue;
    const hits: NodeRef[] = [];
    for (const ref of refs) {
      for (const cf of changedFiles) {
        if (pathMatches(ref, cf)) {
          const norm = normalizeRef(ref);
          hits.push({
            path: norm.path.startsWith(".ori/") ? norm.path : `.ori/${norm.path}`,
            sectionId: norm.sectionId,
          });
        }
      }
    }
    if (!hits.length) continue;

    const entries: DirtyEntry[] = hits.map((h) => ({
      source: h,
      detected_at: now,
      affected_phase: "derive",
      reason: force ? "force" : "edit",
    }));
    const statusPath = join(m.dir, "status.yaml");
    const added = await appendDirty(statusPath, entries);
    if (added > 0) {
      totalDirty += added;
      affectedIds.push(m.id);
      consola.log(`  dirty +${added} → ${m.kind}/${m.id}`);
    }
  }

  if (totalDirty === 0) {
    consola.success("/ori-sync: no slices/pages affected by these changes");
  } else {
    consola.success(`/ori-sync: marked ${totalDirty} dirty entr${totalDirty === 1 ? "y" : "ies"} across ${affectedIds.length} ${affectedIds.length === 1 ? "doc" : "docs"}`);
    consola.info(`affected: ${affectedIds.join(", ")}`);
  }

  if (check) {
    const dirtyRemaining = await countRemainingDirty();
    if (dirtyRemaining > 0) {
      consola.error(`${dirtyRemaining} dirty mark(s) still pending across slices/pages`);
      process.exit(1);
    }
  }
}

async function countRemainingDirty(): Promise<number> {
  const manifests = await listManifests();
  let n = 0;
  for (const m of manifests) {
    const statusPath = join(m.dir, "status.yaml");
    if (!(await exists(statusPath))) continue;
    try {
      const data = parseYaml(await readFile(statusPath, "utf8")) ?? {};
      if (Array.isArray(data.dirty)) n += data.dirty.length;
    } catch {}
  }
  return n;
}

await run();
