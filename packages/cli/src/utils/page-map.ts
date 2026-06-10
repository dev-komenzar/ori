// Auto-derive the "## Page Map" section of .ori/architecture.md from the
// depended_by / depends_on frontmatter of .ori/domain/ui-fields/screen-*.md
// (output of /ori-ddd-11b-ui-grouping). The generated block lives between
// spec-fixed marker comments so manual prose elsewhere in architecture.md is
// preserved.
//
// Convention (see docs/design.md §"Page Map" and .apm/skills/ori-arch/architecture-md-schema.md):
//
//   coherence:
//     depended_by:                       # which group(s) this screen contributes to
//       - ui-widget: prompt-workspace    # or ui-page: home
//     depends_on:                        # union'd into the group's depends_on
//       - slice: prompt-list-slice
//       - ui-widget: prompt-workspace
//
// Render:
//
//   ## Page Map
//
//   <!-- BEGIN ori-distill phase-11b auto-generated; do not edit between markers -->
//   - ui-widget:
//     - prompt-workspace (depends_on: [prompt-list-slice, prompt-editor-slice])
//   - ui-page:
//     - home (depends_on: [prompt-workspace])
//   <!-- END ori-distill phase-11b auto-generated -->

import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { parseFrontmatter } from "@ori-ori/parser";

export const DEFAULT_PAGE_MAP_MARKER = "phase-11b";
const SCREEN_PREFIX = "screen-";
const SCREEN_SUFFIX = ".md";
const ARCHITECTURE_PATH = ".ori/architecture.md";
const UI_FIELDS_DIR = ".ori/domain/ui-fields";
const SECTION_HEADER = "## Page Map";

const GROUP_KINDS = ["ui-widget", "ui-page"] as const;
export type GroupKind = (typeof GROUP_KINDS)[number];

export interface GroupRef {
  readonly kind: GroupKind;
  readonly id: string;
}

export interface DependsOnRef {
  readonly kind: string;
  readonly id: string;
}

export interface ScreenBinding {
  readonly screenId: string;
  readonly file: string;
  readonly groups: readonly GroupRef[];
  readonly dependsOn: readonly DependsOnRef[];
}

export interface PageMapEntry {
  readonly kind: GroupKind;
  readonly id: string;
  readonly dependsOn: readonly string[];
  readonly screens: readonly string[];
  readonly sources: readonly string[];
}

interface CoherenceMap {
  depended_by?: unknown;
  depends_on?: unknown;
}

interface FrontmatterShape {
  coherence?: CoherenceMap;
}

interface KeyedRef {
  readonly key: string;
  readonly value: string;
}

function extractRefs(value: unknown): KeyedRef[] {
  if (!Array.isArray(value)) return [];
  const refs: KeyedRef[] = [];
  for (const entry of value) {
    if (typeof entry === "object" && entry !== null && !Array.isArray(entry)) {
      const rec = entry as Record<string, unknown>;
      for (const [key, raw] of Object.entries(rec)) {
        if (typeof raw === "string" && raw.length > 0) {
          refs.push({ key, value: raw });
        }
      }
    }
  }
  return refs;
}

function isGroupKind(s: string): s is GroupKind {
  return (GROUP_KINDS as readonly string[]).includes(s);
}

export function parseScreen(file: string, raw: string): ScreenBinding | null {
  const screenId = basename(file, SCREEN_SUFFIX);
  if (!screenId.startsWith(SCREEN_PREFIX)) return null;
  const { data } = parseFrontmatter(raw);
  const fm = data as FrontmatterShape;
  const coherence = fm.coherence ?? {};
  const groups: GroupRef[] = [];
  for (const r of extractRefs(coherence.depended_by)) {
    if (isGroupKind(r.key)) groups.push({ kind: r.key, id: r.value });
  }
  // screen-to-screen navigation (key "screen") is not a page-level dependency.
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

export function collectPageMap(screens: readonly ScreenBinding[]): PageMapEntry[] {
  const byGroup = new Map<
    string,
    {
      kind: GroupKind;
      id: string;
      screens: Set<string>;
      sources: Set<string>;
      dependsOn: Set<string>;
    }
  >();
  for (const s of screens) {
    for (const g of s.groups) {
      const key = `${g.kind}:${g.id}`;
      let agg = byGroup.get(key);
      if (!agg) {
        agg = {
          kind: g.kind,
          id: g.id,
          screens: new Set(),
          sources: new Set(),
          dependsOn: new Set(),
        };
        byGroup.set(key, agg);
      }
      agg.screens.add(s.screenId);
      agg.sources.add(s.file);
      for (const d of s.dependsOn) agg.dependsOn.add(d.id);
    }
  }
  const entries: PageMapEntry[] = [];
  for (const v of byGroup.values()) {
    entries.push({
      kind: v.kind,
      id: v.id,
      dependsOn: [...v.dependsOn].sort(),
      screens: [...v.screens].sort(compareScreenIds),
      sources: [...v.sources].sort(),
    });
  }
  entries.sort((a, b) => {
    const ka = KIND_ORDER.indexOf(a.kind);
    const kb = KIND_ORDER.indexOf(b.kind);
    if (ka !== kb) return ka - kb;
    return a.id.localeCompare(b.id);
  });
  return entries;
}

export function renderPageMapBody(entries: readonly PageMapEntry[]): string {
  if (entries.length === 0) {
    return "_No `ui-widget` / `ui-page` bindings found in `screen-*.md` frontmatter yet. Run `/ori-ddd-11b-ui-grouping` to assign each screen to a page or widget._\n";
  }
  const lines: string[] = [];
  let currentKind: GroupKind | null = null;
  for (const entry of entries) {
    if (entry.kind !== currentKind) {
      lines.push(`- ${entry.kind}:`);
      currentKind = entry.kind;
    }
    const deps = entry.dependsOn.join(", ");
    lines.push(`  - ${entry.id} (depends_on: [${deps}])`);
  }
  return `${lines.join("\n")}\n`;
}

function buildDelimiters(marker: string): { begin: string; end: string } {
  return {
    begin: `<!-- BEGIN ori-distill ${marker} auto-generated; do not edit between markers -->`,
    end: `<!-- END ori-distill ${marker} auto-generated -->`,
  };
}

export function applyPageMapSection(
  archMd: string,
  body: string,
  marker: string = DEFAULT_PAGE_MAP_MARKER,
): string {
  const { begin, end } = buildDelimiters(marker);
  const block = `${begin}\n${body.trimEnd()}\n${end}`;
  const beginIdx = archMd.indexOf(begin);
  const endIdx = archMd.indexOf(end);
  if (beginIdx !== -1 && endIdx !== -1 && endIdx > beginIdx) {
    const before = archMd.slice(0, beginIdx);
    const after = archMd.slice(endIdx + end.length);
    return `${before}${block}${after}`;
  }
  // No markers yet — append a new section. If a "## Page Map" heading already
  // exists in the file, insert the markers right under it instead of creating
  // a second heading.
  const trimmed = archMd.replace(/\s+$/u, "");
  const headerRegex = /^## Page Map\s*$/m;
  if (headerRegex.test(trimmed)) {
    return `${trimmed.replace(headerRegex, `${SECTION_HEADER}\n\n${block}`)}\n`;
  }
  return `${trimmed}\n\n${SECTION_HEADER}\n\n${block}\n`;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function listScreenFiles(uiFieldsDir: string): Promise<string[]> {
  const entries = await readdir(uiFieldsDir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.startsWith(SCREEN_PREFIX)) continue;
    if (!entry.name.endsWith(SCREEN_SUFFIX)) continue;
    files.push(entry.name);
  }
  files.sort(compareScreenIds);
  return files;
}

async function readMarkerFromSpec(specPath: string): Promise<string | null> {
  const raw = await readFile(specPath, "utf8");
  const { data } = parseFrontmatter(raw);
  const fm = data as { page_map_marker?: unknown };
  return typeof fm.page_map_marker === "string" && fm.page_map_marker.length > 0
    ? fm.page_map_marker
    : null;
}

export interface SyncPageMapOptions {
  readonly cwd: string;
  readonly specPath?: string;
  readonly uiFieldsDir?: string;
  readonly marker?: string;
  readonly dryRun?: boolean;
}

export interface SyncPageMapResult {
  readonly screensRead: number;
  readonly entries: readonly PageMapEntry[];
  readonly specPath: string;
  readonly changed: boolean;
  readonly nextContent: string;
}

export class SyncPageMapError extends Error {
  override readonly name = "SyncPageMapError";
}

export async function syncPageMap(opts: SyncPageMapOptions): Promise<SyncPageMapResult> {
  const specPath = opts.specPath ?? join(opts.cwd, ARCHITECTURE_PATH);
  const uiFieldsDir = opts.uiFieldsDir ?? join(opts.cwd, UI_FIELDS_DIR);

  if (!(await fileExists(specPath))) {
    throw new SyncPageMapError(`architecture spec not found: ${specPath}`);
  }
  if (!(await fileExists(uiFieldsDir))) {
    throw new SyncPageMapError(`ui-fields directory not found: ${uiFieldsDir}`);
  }

  const marker =
    opts.marker ?? (await readMarkerFromSpec(specPath)) ?? DEFAULT_PAGE_MAP_MARKER;

  const files = await listScreenFiles(uiFieldsDir);
  const screens: ScreenBinding[] = [];
  for (const name of files) {
    const raw = await readFile(join(uiFieldsDir, name), "utf8");
    const parsed = parseScreen(name, raw);
    if (parsed) screens.push(parsed);
  }
  const entries = collectPageMap(screens);
  const body = renderPageMapBody(entries);

  const current = await readFile(specPath, "utf8");
  const next = applyPageMapSection(current, body, marker);
  const changed = next !== current;
  if (changed && !opts.dryRun) {
    await writeFile(specPath, next, "utf8");
  }

  return {
    screensRead: screens.length,
    entries,
    specPath,
    changed,
    nextContent: next,
  };
}
