import { access, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { parse as yamlParse, stringify as yamlStringify } from "yaml";

// page / widget の testid 契約 (.ori/pages/<id>/testids.yaml) の決定的 writer + 検査器 (ori-oan.7)。
// 規範: ddd-vsa-hex/pattern.md §UI selector / testid 規約。
// 本 script は複数 skill の scripts/ に複製配置される (build-skills.mjs の SHARED_ENTRIES)。

// ── types ────────────────────────────────────────────────────────────

type Kind = "page" | "widget";

interface DerivedRow {
  testid: string;
  field: string;
}

interface ExtraRow {
  testid: string;
  purpose: string;
  source: string;
  dynamic?: string;
}

interface Contract {
  derived: DerivedRow[];
  extra: ExtraRow[];
}

interface PageInfo {
  id: string;
  kind: Kind;
  screens: string[];
}

class InputError extends Error {}

// ── helpers ──────────────────────────────────────────────────────────

const ELEM_SEGMENT = "[a-z0-9]+(?:-[a-z0-9]+)*";
const TESTID_CHARSET = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\.[a-z0-9]+(?:-[a-z0-9]+)*)*$/;
const SOURCE_RE = /^(derive|scenario:[a-z0-9][a-z0-9-]*)$/;
const SRC_EXT = /\.(svelte|vue|tsx|jsx|ts|js|mjs|html|astro)$/;
const SKIP_DIRS = new Set(["node_modules", "target", "dist", "build", ".svelte-kit", ".git", "gen", "coverage"]);
// selector 文字列 (`[data-testid="x"]`) を実装の付与と誤認しないため、テストファイルは探索対象外
const TEST_FILE = /(^|\/)(tests?|__tests__|e2e)\/|\.(test|spec)\.[a-z]+$/;

async function exists(path: string): Promise<boolean> {
  try { await access(path); return true; } catch { return false; }
}

function usage(): never {
  console.error(
    "Usage: testids.js sync <page-id> | --all            [--root <dir>]\n" +
    "       testids.js check <page-id> | --all [--no-impl] [--root <dir>]\n" +
    "       testids.js check-collisions                   [--root <dir>]\n" +
    "       testids.js add-extra <page-id> --testid <id> --purpose <text> --source <derive|scenario:<id>> [--dynamic data-key] [--root <dir>]\n" +
    "  exit: 0 = ok / 1 = 違反・入力不整合 / 2 = usage・project root 不明",
  );
  process.exit(2);
}

function parseArgs(argv: string[]): { positional: string[]; flags: Map<string, string | true> } {
  const positional: string[] = [];
  const flags = new Map<string, string | true>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (!a.startsWith("--")) { positional.push(a); continue; }
    const key = a.slice(2);
    const next = argv[i + 1];
    if (["root", "testid", "purpose", "source", "dynamic"].includes(key) && next !== undefined) {
      flags.set(key, next);
      i++;
    } else {
      flags.set(key, true);
    }
  }
  return { positional, flags };
}

// cwd 依存にしない: skill dir から実行されても上方探索で .ori/ を持つ project root を解決する
async function resolveRoot(explicit: string | true | undefined): Promise<string> {
  if (typeof explicit === "string") {
    const r = resolve(explicit);
    if (!(await exists(join(r, ".ori")))) throw new InputError(`--root に .ori/ がありません: ${r}`);
    return r;
  }
  let d = process.cwd();
  for (;;) {
    if (await exists(join(d, ".ori"))) return d;
    const parent = dirname(d);
    if (parent === d) break;
    d = parent;
  }
  console.error("ERROR: project root (.ori/) が見つかりません。--root で指定してください");
  process.exit(2);
}

// ── inputs ───────────────────────────────────────────────────────────

async function loadPage(root: string, id: string): Promise<PageInfo> {
  const manifestPath = join(root, ".ori/pages", id, "manifest.yaml");
  if (!(await exists(manifestPath))) {
    throw new InputError(`page 未 scaffold: .ori/pages/${id}/manifest.yaml がありません (new-page.js で scaffold してください)`);
  }
  const m = (yamlParse(await readFile(manifestPath, "utf8")) ?? {}) as Record<string, unknown>;
  const kind = m.type;
  if (kind !== "page" && kind !== "widget") {
    throw new InputError(`.ori/pages/${id}/manifest.yaml の type が page / widget ではありません: ${String(kind)}`);
  }
  const screens = new Set<string>();
  for (const d of Array.isArray(m.derives_from) ? m.derives_from : []) {
    const hit = /(?:^|\/)ui-fields\/(screen-\d+)\.md(?:#|$)/.exec(String(d));
    if (hit) screens.add(hit[1]!);
  }
  return { id, kind, screens: [...screens].sort() };
}

async function listPageIds(root: string): Promise<string[]> {
  const dir = join(root, ".ori/pages");
  if (!(await exists(dir))) return [];
  const ents = await readdir(dir, { withFileTypes: true });
  const ids: string[] = [];
  for (const e of ents) {
    if (e.isDirectory() && (await exists(join(dir, e.name, "manifest.yaml")))) ids.push(e.name);
  }
  return ids.sort();
}

// `## Fields {#fields}` 節 (次の H2 まで) の表行から `{#screen-N-xxx}` anchor を field id として取る
async function loadFields(root: string, screen: string): Promise<string[]> {
  const path = join(root, ".ori/domain/ui-fields", `${screen}.md`);
  if (!(await exists(path))) throw new InputError(`ui-fields が見つかりません: .ori/domain/ui-fields/${screen}.md`);
  const lines = (await readFile(path, "utf8")).split("\n");
  const fields: string[] = [];
  let inFields = false;
  for (const line of lines) {
    if (/^## /.test(line)) { inFields = /\{#fields\}/.test(line); continue; }
    if (!inFields || !line.trimStart().startsWith("|")) continue;
    const firstCell = line.split("|")[1] ?? "";
    const hit = new RegExp(`\\{#(${screen}-${ELEM_SEGMENT})\\}`).exec(firstCell);
    if (hit) fields.push(hit[1]!);
  }
  return fields;
}

// ── derive ───────────────────────────────────────────────────────────

function elemOf(field: string): string {
  return field.replace(/^screen-\d+-/, "");
}

function findCollisions(fields: string[]): Map<string, string[]> {
  const byElem = new Map<string, string[]>();
  for (const f of fields) {
    const e = elemOf(f);
    byElem.set(e, [...(byElem.get(e) ?? []), f]);
  }
  return new Map([...byElem].filter(([, fs]) => fs.length > 1));
}

async function deriveRows(root: string, page: PageInfo): Promise<{ rows: DerivedRow[]; warnings: string[] }> {
  const warnings: string[] = [];
  if (page.screens.length === 0) {
    warnings.push(`${page.id}: manifest derives_from に ui-fields screen がありません (derived は空)`);
  }
  const fields: string[] = [];
  for (const s of page.screens) {
    const fs = await loadFields(root, s);
    if (fs.length === 0) warnings.push(`${page.id}: ${s}.md の ## Fields {#fields} に field anchor がありません`);
    fields.push(...fs);
  }
  const collisions = findCollisions(fields);
  if (collisions.size > 0) {
    const detail = [...collisions].map(([e, fs]) => `  <elem> "${e}": ${fs.join(", ")}`).join("\n");
    throw new InputError(
      `${page.id}: page 内で <elem> が衝突しています。field id の改名か page grouping の見直しが必要です\n${detail}`,
    );
  }
  const rows = fields
    .map((f) => ({ testid: `${page.kind}.${page.id}.${elemOf(f)}`, field: f }))
    .sort((a, b) => (a.testid < b.testid ? -1 : a.testid > b.testid ? 1 : 0));
  return { rows, warnings };
}

// ── contract file ────────────────────────────────────────────────────

const HEADER =
  "# page testid 契約 (SSoT: ddd-vsa-hex/pattern.md §UI selector / testid 規約)\n" +
  "# derived: @ori-generated — testids.js sync が ui-fields から再生成する。手で編集しない\n" +
  "# extra:   ori-derive / ori-generate が testids.js add-extra で追記する (変更・削除は人間のみ)\n";

function contractPath(root: string, id: string): string {
  return join(root, ".ori/pages", id, "testids.yaml");
}

async function readContract(root: string, id: string): Promise<Contract | null> {
  const p = contractPath(root, id);
  if (!(await exists(p))) return null;
  const raw = (yamlParse(await readFile(p, "utf8")) ?? {}) as Record<string, unknown>;
  const derived = (Array.isArray(raw.derived) ? raw.derived : []) as DerivedRow[];
  const extra = (Array.isArray(raw.extra) ? raw.extra : []) as ExtraRow[];
  return { derived, extra };
}

function renderContract(c: Contract): string {
  return HEADER + yamlStringify({ derived: c.derived, extra: c.extra });
}

async function writeContract(root: string, id: string, c: Contract): Promise<boolean> {
  const p = contractPath(root, id);
  const body = renderContract(c);
  const prev = (await exists(p)) ? await readFile(p, "utf8") : null;
  if (prev === body) return false;
  await writeFile(p, body, "utf8");
  return true;
}

// ── commands ─────────────────────────────────────────────────────────

async function syncPage(root: string, id: string): Promise<Contract> {
  const page = await loadPage(root, id);
  const { rows, warnings } = await deriveRows(root, page);
  for (const w of warnings) console.error(`WARN: ${w}`);
  const prev = await readContract(root, id);
  const next: Contract = { derived: rows, extra: prev?.extra ?? [] };
  const changed = await writeContract(root, id, next);
  console.log(`${changed ? "synced" : "up-to-date"}: .ori/pages/${id}/testids.yaml (derived ${rows.length}, extra ${next.extra.length})`);
  return next;
}

function extraViolations(page: PageInfo, c: Contract): string[] {
  const v: string[] = [];
  const prefix = `${page.kind}.${page.id}`;
  const elemRe = new RegExp(`^${prefix.replace(/\./g, "\\.")}(?:\\.${ELEM_SEGMENT})*$`);
  for (const r of c.extra) {
    const t = String(r.testid ?? "");
    if (!elemRe.test(t)) v.push(`extra 形式違反: "${t}" は "${prefix}" または "${prefix}.<elem>" (kebab-case) であること`);
    if (!r.purpose) v.push(`extra purpose 欠落: "${t}"`);
    if (!SOURCE_RE.test(String(r.source ?? ""))) v.push(`extra source 不正: "${t}" (derive | scenario:<id>)`);
    if (r.dynamic !== undefined && r.dynamic !== "data-key") v.push(`extra dynamic 不正: "${t}" (data-key のみ)`);
  }
  const seen = new Map<string, number>();
  for (const t of [...c.derived.map((r) => r.testid), ...c.extra.map((r) => r.testid)]) {
    seen.set(t, (seen.get(t) ?? 0) + 1);
  }
  for (const [t, n] of seen) if (n > 1) v.push(`testid 重複: "${t}" (${n} 件)`);
  return v;
}

async function appSourceDirs(root: string): Promise<string[]> {
  const cfgPath = join(root, ".ori/config.yaml");
  let appsRoot = "apps";
  const paths: string[] = [];
  if (await exists(cfgPath)) {
    const cfg = (yamlParse(await readFile(cfgPath, "utf8")) ?? {}) as { ori?: { workspace?: { apps_root?: string; apps?: { path?: string }[] } } };
    const ws = cfg.ori?.workspace;
    if (ws?.apps_root) appsRoot = ws.apps_root;
    for (const a of ws?.apps ?? []) if (a.path) paths.push(a.path);
  }
  const dirs = paths.length > 0 ? paths : [appsRoot];
  const out: string[] = [];
  for (const d of dirs) if (await exists(join(root, d))) out.push(join(root, d));
  return out;
}

async function walk(dir: string, acc: string[]): Promise<string[]> {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name) && !e.name.startsWith(".")) await walk(join(dir, e.name), acc);
    } else if (SRC_EXT.test(e.name)) {
      acc.push(join(dir, e.name));
    }
  }
  return acc;
}

interface ImplIndex {
  literals: Set<string>;
  violations: string[];
}

// 実装側の data-testid を収集する。literal 以外 (式・テンプレート埋め込み) は形式違反
async function indexImpl(root: string, pageIds: Set<string>): Promise<ImplIndex> {
  const literals = new Set<string>();
  const violations: string[] = [];
  const files: string[] = [];
  for (const d of await appSourceDirs(root)) await walk(d, files);
  const attrRe = /(:?)data-testid\s*=\s*(?:"([^"]*)"|'([^']*)'|\{\s*(?:"([^"]*)"|'([^']*)'|`([^`$]*)`)\s*\}|(\{[^}]*\}))/g;
  for (const f of files) {
    const rel = relative(root, f);
    if (TEST_FILE.test(rel)) continue;
    if ((await stat(f)).size > 2_000_000) continue;
    const lines = (await readFile(f, "utf8")).split("\n");
    lines.forEach((line, i) => {
      for (const m of line.matchAll(attrRe)) {
        // `[data-testid="x"]` は selector であって付与ではない
        if (m.index !== undefined && line[m.index - 1] === "[") continue;
        const loc = `${rel}:${i + 1}`;
        const value = m[2] ?? m[3] ?? m[4] ?? m[5] ?? m[6];
        if (m[1] === ":" || m[7] !== undefined || value === undefined) {
          violations.push(`${loc}: 動的 testid は禁止 (固定 testid + data-key を使う): ${m[0]}`);
          continue;
        }
        if (/[${}]/.test(value)) {
          violations.push(`${loc}: 動的 testid は禁止 (固定 testid + data-key を使う): ${m[0]}`);
          continue;
        }
        literals.add(value);
        if (!TESTID_CHARSET.test(value)) {
          violations.push(`${loc}: testid 形式違反 (kebab-case を . で連結): "${value}"`);
          continue;
        }
        const ns = /^(page|widget)\.([^.]+)/.exec(value);
        if (ns && !pageIds.has(ns[2]!)) {
          violations.push(`${loc}: testid が存在しない page / widget を指しています: "${value}"`);
        }
      }
    });
  }
  return { literals, violations };
}

async function checkPages(root: string, ids: string[], withImpl: boolean): Promise<number> {
  let count = 0;
  const report = (msg: string): void => { console.log(`VIOLATION ${msg}`); count++; };
  const allIds = new Set(await listPageIds(root));
  const impl = withImpl ? await indexImpl(root, allIds) : null;
  for (const id of ids) {
    let page: PageInfo;
    let expected: DerivedRow[];
    try {
      page = await loadPage(root, id);
      expected = (await deriveRows(root, page)).rows;
    } catch (e) {
      if (!(e instanceof InputError)) throw e;
      report(`${id}: ${e.message}`);
      continue;
    }
    const c = await readContract(root, id);
    if (!c) { report(`${id}: testids.yaml がありません (testids.js sync ${id})`); continue; }
    if (JSON.stringify(c.derived) !== JSON.stringify(expected)) {
      report(`${id}: derived が ui-fields と不一致 (stale)。testids.js sync ${id} で再生成してください`);
    }
    for (const v of extraViolations(page, c)) report(`${id}: ${v}`);
    if (impl) {
      for (const t of [...expected.map((r) => r.testid), ...c.extra.map((r) => r.testid)]) {
        if (!impl.literals.has(t)) report(`${id}: 契約 testid が実装に存在しません: "${t}"`);
      }
    }
  }
  if (impl) for (const v of impl.violations) report(`impl: ${v}`);
  console.log(count === 0 ? "OK: testid 契約違反なし" : `testid 契約違反: ${count} 件`);
  return count;
}

// page-groups.md の grouping 節ごとに screen 集合を取り、<elem> 衝突を検出する (11b 用、.ori/pages/ 不要)
async function checkCollisions(root: string): Promise<number> {
  const path = join(root, ".ori/domain/ui-fields/page-groups.md");
  if (!(await exists(path))) throw new InputError(".ori/domain/ui-fields/page-groups.md がありません");
  const groups = new Map<string, Set<string>>();
  let current: string | null = null;
  for (const line of (await readFile(path, "utf8")).split("\n")) {
    const h = /^#{2,3}\s.*\{#([a-z0-9-]+)\}\s*$/.exec(line);
    if (h) { current = h[1]!; continue; }
    if (!current) continue;
    // grouping を定義する行だけを拾う: `ui-field:screen-N` (11b テンプレートの depends_on) か、
    // `screens:` 行の `screen-N.md` link。本文中の言及 (`screen-1.md#fields-toast` 等) は grouping ではない
    const refs = [...line.matchAll(/ui-field:(screen-\d+)(?![\w-])/g)].map((m) => m[1]!);
    if (/screens\**\s*:/.test(line)) refs.push(...[...line.matchAll(/\b(screen-\d+)\.md/g)].map((m) => m[1]!));
    for (const s of refs) groups.set(current, (groups.get(current) ?? new Set()).add(s));
  }
  if (groups.size === 0) {
    console.error("WARN: page-groups.md から grouping ⇔ screen の対応を 1 件も解析できませんでした (ui-field:screen-N か screen-N.md で参照してください)");
    return 0;
  }
  let count = 0;
  for (const [g, screens] of groups) {
    const fields: string[] = [];
    for (const s of [...screens].sort()) fields.push(...(await loadFields(root, s)));
    for (const [e, fs] of findCollisions(fields)) {
      console.log(`VIOLATION ${g}: <elem> "${e}" が衝突: ${fs.join(", ")}`);
      count++;
    }
  }
  console.log(count === 0 ? `OK: ${groups.size} grouping で <elem> 衝突なし` : `<elem> 衝突: ${count} 件`);
  return count;
}

async function addExtra(root: string, id: string, flags: Map<string, string | true>): Promise<number> {
  const testid = flags.get("testid");
  const purpose = flags.get("purpose");
  const source = flags.get("source");
  const dynamic = flags.get("dynamic");
  if (typeof testid !== "string" || typeof purpose !== "string" || typeof source !== "string") usage();
  const c = await syncPage(root, id);
  if ([...c.derived, ...c.extra].some((r) => r.testid === testid)) {
    console.log(`exists: "${testid}" は契約に登録済み (変更しません)`);
    return 0;
  }
  const row: ExtraRow = { testid, purpose, source };
  if (typeof dynamic === "string") row.dynamic = dynamic;
  const next: Contract = { derived: c.derived, extra: [...c.extra, row] };
  const page = await loadPage(root, id);
  const v = extraViolations(page, next);
  if (v.length > 0) {
    for (const m of v) console.log(`VIOLATION ${id}: ${m}`);
    return 1;
  }
  await writeContract(root, id, next);
  console.log(`added: "${testid}" → .ori/pages/${id}/testids.yaml extra`);
  return 0;
}

// ── main ─────────────────────────────────────────────────────────────

async function main(): Promise<number> {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const [cmd, target] = positional;
  if (!cmd) usage();
  const root = await resolveRoot(flags.get("root"));
  const all = flags.get("all") === true;
  const ids = async (): Promise<string[]> => {
    if (all) return listPageIds(root);
    if (!target) usage();
    return [target];
  };
  switch (cmd) {
    case "sync": {
      for (const id of await ids()) await syncPage(root, id);
      return 0;
    }
    case "check":
      return (await checkPages(root, await ids(), flags.get("no-impl") !== true)) > 0 ? 1 : 0;
    case "check-collisions":
      return (await checkCollisions(root)) > 0 ? 1 : 0;
    case "add-extra":
      if (!target) usage();
      return addExtra(root, target, flags);
    default:
      return usage();
  }
}

main().then(
  (code) => process.exit(code),
  (e: unknown) => {
    if (e instanceof InputError) {
      console.error(`ERROR: ${e.message}`);
      process.exit(1);
    }
    throw e;
  },
);
