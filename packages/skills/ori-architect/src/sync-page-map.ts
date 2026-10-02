import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, join, relative } from "node:path";
import { parseFrontmatter } from "@ori-ori/parser";
import { consola } from "consola";

const DEFAULT_PAGE_MAP_MARKER = "phase-11b";
const SCREEN_PREFIX = "screen-";
const SCREEN_SUFFIX = ".md";
const ARCHITECTURE_PATH = ".ori/architecture.md";
const UI_FIELDS_DIR = ".ori/domain/ui-fields";
const SECTION_HEADER = "## Page Map";
const GROUP_KINDS = ["ui-widget", "ui-page"] as const;
type GroupKind = (typeof GROUP_KINDS)[number];
interface GroupRef { readonly kind: GroupKind; readonly id: string; }
interface DependsOnRef { readonly kind: string; readonly id: string; }
interface ScreenBinding { readonly screenId: string; readonly file: string; readonly groups: readonly GroupRef[]; readonly dependsOn: readonly DependsOnRef[]; }
interface PageMapEntry { readonly kind: GroupKind; readonly id: string; readonly dependsOn: readonly string[]; readonly screens: readonly string[]; readonly sources: readonly string[]; }

function extractRefs(value: unknown): { key: string; value: string }[] {
  if (!Array.isArray(value)) return [];
  const refs: { key: string; value: string }[] = [];
  for (const entry of value) {
    if (typeof entry === "object" && entry !== null && !Array.isArray(entry)) {
      for (const [key, raw] of Object.entries(entry as Record<string, unknown>)) {
        if (typeof raw === "string" && raw.length > 0) refs.push({ key, value: raw });
      }
    }
  }
  return refs;
}

function isGroupKind(s: string): s is GroupKind { return (GROUP_KINDS as readonly string[]).includes(s); }

function parseScreen(file: string, raw: string): ScreenBinding | null {
  const screenId = basename(file, SCREEN_SUFFIX);
  if (!screenId.startsWith(SCREEN_PREFIX)) return null;
  const { data } = parseFrontmatter(raw);
  const fm = data as { coherence?: { depended_by?: unknown; depends_on?: unknown } };
  const coherence = fm.coherence ?? {};
  const groups: GroupRef[] = [];
  for (const r of extractRefs(coherence.depended_by)) {
    if (isGroupKind(r.key)) groups.push({ kind: r.key, id: r.value });
  }
  const dependsOn: DependsOnRef[] = [];
  for (const r of extractRefs(coherence.depends_on)) {
    if (r.key === "screen") continue;
    dependsOn.push({ kind: r.key, id: r.value });
  }
  return { screenId, file, groups, dependsOn };
}

function compareScreenIds(a: string, b: string): number {
  const an = Number(a.slice(SCREEN_PREFIX.length));
  const bn = Number(b.slice(SCREEN_PREFIX.length));
  if (Number.isFinite(an) && Number.isFinite(bn)) return an - bn;
  return a.localeCompare(b);
}

const KIND_ORDER: readonly GroupKind[] = ["ui-widget", "ui-page"];

function collectPageMap(screens: readonly ScreenBinding[]): PageMapEntry[] {
  const byGroup = new Map<string, { kind: GroupKind; id: string; screens: Set<string>; sources: Set<string>; dependsOn: Set<string> }>();
  for (const s of screens) {
    for (const g of s.groups) {
      const key = `${g.kind}:${g.id}`;
      let agg = byGroup.get(key);
      if (!agg) {
        agg = { kind: g.kind, id: g.id, screens: new Set(), sources: new Set(), dependsOn: new Set() };
        byGroup.set(key, agg);
      }
      agg.screens.add(s.screenId);
      agg.sources.add(s.file);
      for (const d of s.dependsOn) agg.dependsOn.add(d.id);
    }
  }
  const entries: PageMapEntry[] = [];
  for (const v of byGroup.values()) {
    entries.push({ kind: v.kind, id: v.id, dependsOn: [...v.dependsOn].sort(), screens: [...v.screens].sort(compareScreenIds), sources: [...v.sources].sort() });
  }
  entries.sort((a, b) => {
    const ka = KIND_ORDER.indexOf(a.kind);
    const kb = KIND_ORDER.indexOf(b.kind);
    if (ka !== kb) return ka - kb;
    return a.id.localeCompare(b.id);
  });
  return entries;
}

function renderPageMapBody(entries: readonly PageMapEntry[]): string {
  if (entries.length === 0) {
    return "_No `ui-widget` / `ui-page` bindings found in `screen-*.md` frontmatter yet. Run `/ori-ddd-11b-ui-grouping` to assign each screen to a page or widget._\n";
  }
  const lines: string[] = [];
  let currentKind: GroupKind | null = null;
  for (const entry of entries) {
    if (entry.kind !== currentKind) { lines.push(`- ${entry.kind}:`); currentKind = entry.kind; }
    lines.push(`  - ${entry.id} (depends_on: [${entry.dependsOn.join(", ")}])`);
  }
  return `${lines.join("\n")}\n`;
}

function buildDelimiters(marker: string) {
  return {
    begin: `<!-- BEGIN ori-distill ${marker} auto-generated; do not edit between markers -->`,
    end: `<!-- END ori-distill ${marker} auto-generated -->`,
  };
}

function applyPageMapSection(archMd: string, body: string, marker: string): string {
  const { begin, end } = buildDelimiters(marker);
  const block = `${begin}\n${body.trimEnd()}\n${end}`;
  const beginIdx = archMd.indexOf(begin);
  const endIdx = archMd.indexOf(end);
  if (beginIdx !== -1 && endIdx !== -1 && endIdx > beginIdx) {
    return `${archMd.slice(0, beginIdx)}${block}${archMd.slice(endIdx + end.length)}`;
  }
  const trimmed = archMd.replace(/\s+$/u, "");
  const headerRegex = /^## Page Map\s*$/m;
  if (headerRegex.test(trimmed)) {
    return `${trimmed.replace(headerRegex, `${SECTION_HEADER}\n\n${block}`)}\n`;
  }
  return `${trimmed}\n\n${SECTION_HEADER}\n\n${block}\n`;
}

async function fileExists(p: string): Promise<boolean> {
  try { await stat(p); return true; } catch { return false; }
}

const args = process.argv.slice(2);
function flag(name: string): string | undefined {
  const idx = args.findIndex((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (idx === -1) return undefined;
  const a = args[idx]!;
  if (a.includes("=")) return a.split("=").slice(1).join("=");
  return args[idx + 1];
}
function boolFlag(name: string): boolean { return args.includes(`--${name}`); }

const cwd = process.cwd();
const specPath = flag("spec") ? join(cwd, flag("spec")!) : join(cwd, ARCHITECTURE_PATH);
const uiFieldsDir = flag("ui-fields-dir") ? join(cwd, flag("ui-fields-dir")!) : join(cwd, UI_FIELDS_DIR);
const markerArg = flag("marker");
const dryRun = boolFlag("dry-run");

if (!(await fileExists(specPath))) {
  consola.error(`architecture spec not found: ${relative(cwd, specPath)}`);
  process.exit(2);
}
if (!(await fileExists(uiFieldsDir))) {
  consola.error(`ui-fields directory not found: ${relative(cwd, uiFieldsDir)}`);
  process.exit(2);
}

async function readMarker(): Promise<string> {
  if (markerArg) return markerArg;
  const raw = await readFile(specPath, "utf8");
  const { data } = parseFrontmatter(raw);
  const fm = data as { page_map_marker?: unknown };
  if (typeof fm.page_map_marker === "string" && fm.page_map_marker.length > 0) return fm.page_map_marker;
  return DEFAULT_PAGE_MAP_MARKER;
}

const marker = await readMarker();
const fileNames = await (async () => {
  const entries = await readdir(uiFieldsDir, { withFileTypes: true });
  return entries.filter((e) => e.isFile() && e.name.startsWith(SCREEN_PREFIX) && e.name.endsWith(SCREEN_SUFFIX)).map((e) => e.name).sort(compareScreenIds);
})();

const screens: ScreenBinding[] = [];
for (const name of fileNames) {
  const raw = await readFile(join(uiFieldsDir, name), "utf8");
  const parsed = parseScreen(name, raw);
  if (parsed) screens.push(parsed);
}

const entries = collectPageMap(screens);
const body = renderPageMapBody(entries);
const current = await readFile(specPath, "utf8");
const next = applyPageMapSection(current, body, marker);
const changed = next !== current;

if (dryRun) {
  process.stdout.write(next);
  if (!next.endsWith("\n")) process.stdout.write("\n");
  consola.info(`Parsed ${screens.length} screen(s), derived ${entries.length} Page Map entry/entries; no files written (dry-run).`);
} else if (changed) {
  await writeFile(specPath, next, "utf8");
  consola.success(`Updated ${relative(cwd, specPath)} with ${entries.length} Page Map entry/entries from ${screens.length} screen(s).`);
} else {
  consola.info(`${relative(cwd, specPath)} already up to date (${entries.length} Page Map entry/entries).`);
}
