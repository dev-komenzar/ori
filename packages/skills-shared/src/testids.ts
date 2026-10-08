import { access, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { isMap, isSeq, parse as yamlParse, parseDocument, stringify as yamlStringify } from "yaml";

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
// build 成果物は実装 testid の「存在」を誤判定させるため探索しない
const SKIP_DIRS = new Set(["node_modules", "target", "dist", "build", ".svelte-kit", ".git", "gen", "coverage"]);
// selector 文字列 (`[data-testid="x"]`) を含むテストコードは実装の付与と誤認しないよう探索対象外。
// `test/` は SvelteKit の route 名等で本番コードになりうるため除外しない
const TEST_FILE = /(^|\/)(tests|__tests__|e2e)\/|\.(test|spec)\.[a-z]+$/;
const VALUE_FLAGS = ["root", "testid", "purpose", "source", "dynamic"];
// page に帰属できない実装 testid 違反の出力キー (doctor は page:_impl として起票する)
const UNOWNED = "impl";

async function exists(path: string): Promise<boolean> {
  try { await access(path); return true; } catch { return false; }
}

function usage(): never {
  console.error(
    "Usage: testids.js sync <page-id>... | --all            [--root <dir>]\n" +
    "       testids.js check <page-id>... | --all [--no-impl] [--implemented-only] [--root <dir>]\n" +
    "       testids.js migrate-map <page-id>                 [--root <dir>]\n" +
    "       testids.js check-collisions                      [--root <dir>]\n" +
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
    if (VALUE_FLAGS.includes(key)) {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) usage();
      flags.set(key, next);
      i++;
    } else {
      flags.set(key, true);
    }
  }
  return { positional, flags };
}

async function readYaml(path: string): Promise<unknown> {
  try {
    return yamlParse(await readFile(path, "utf8"));
  } catch (e) {
    throw new InputError(`YAML を parse できません: ${path} (${(e as Error).message.split("\n")[0]})`);
  }
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

// page-groups.md から grouping ⇔ screen 集合を取る。grouping を定義する記述だけを拾う:
//   - `depends_on:` 直後の `- ui-field:screen-N` だけの list 項目 (11b テンプレート) / inline `depends_on: [ui-field:screen-N]`
//   - `screens:` 行の `screen-N.md` link (promptnotes 形式)
// 本文・Open Questions 中の言及は拾わない。見出しが来たら anchor の有無に関係なく節を切り替える
async function parsePageGroups(root: string): Promise<Map<string, Set<string>> | null> {
  const path = join(root, ".ori/domain/ui-fields/page-groups.md");
  if (!(await exists(path))) return null;
  const groups = new Map<string, Set<string>>();
  let current: string | null = null;
  let inDependsOn = false;
  const add = (s: string): void => {
    if (current) groups.set(current, (groups.get(current) ?? new Set()).add(s));
  };
  for (const line of (await readFile(path, "utf8")).split("\n")) {
    if (/^#{1,6}\s/.test(line)) {
      current = /\{#([a-z0-9-]+)\}\s*$/.exec(line)?.[1] ?? null;
      inDependsOn = false;
      continue;
    }
    if (!current) continue;
    const dep = /^\s*(?:-\s*)?(?:\*\*)?depends_on(?:\*\*)?\s*:(.*)$/.exec(line);
    if (dep) {
      inDependsOn = true;
      for (const m of dep[1]!.matchAll(/ui-field:(screen-\d+)(?![\w-])/g)) add(m[1]!);
      continue;
    }
    if (inDependsOn) {
      const item = /^\s+-\s*ui-field:(screen-\d+)\s*$/.exec(line);
      if (item) { add(item[1]!); continue; }
      if (/^\s+-\s/.test(line)) continue; // depends_on 配下の他種 node (workflow:* 等)
      inDependsOn = false;
    }
    if (/^\s*(?:-\s*)?(?:\*\*)?screens(?:\*\*)?\s*:/.test(line)) {
      for (const m of line.matchAll(/\b(screen-\d+)\.md/g)) add(m[1]!);
    }
  }
  return groups;
}

async function loadPage(root: string, id: string): Promise<PageInfo> {
  const manifestPath = join(root, ".ori/pages", id, "manifest.yaml");
  if (!(await exists(manifestPath))) {
    throw new InputError(`page 未 scaffold: .ori/pages/${id}/manifest.yaml がありません (new-page.js で scaffold してください)`);
  }
  const m = ((await readYaml(manifestPath)) ?? {}) as Record<string, unknown>;
  const kind = m.type;
  if (kind !== "page" && kind !== "widget") {
    throw new InputError(`.ori/pages/${id}/manifest.yaml の type が page / widget ではありません: ${String(kind)}`);
  }
  // derives_from の screen 参照: `ui-fields/screen-N.md[#..]` / `ui-field:screen-N` / `page-groups.md#<grouping>` (grouping の screen に展開)
  const screens = new Set<string>();
  let groups: Map<string, Set<string>> | null | undefined;
  for (const raw of Array.isArray(m.derives_from) ? m.derives_from : []) {
    const d = String(raw);
    const file = /(?:^|\/)ui-fields\/(screen-\d+)\.md(?:#|$)/.exec(d) ?? /^ui-field:(screen-\d+)$/.exec(d);
    if (file) { screens.add(file[1]!); continue; }
    const grp = /(?:^|\/)ui-fields\/page-groups\.md#([a-z0-9-]+)$/.exec(d) ?? /^page-grouping:([a-z0-9-]+)$/.exec(d);
    if (grp) {
      if (groups === undefined) groups = await parsePageGroups(root);
      for (const s of groups?.get(grp[1]!) ?? []) screens.add(s);
    }
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

const NO_SCREEN = "manifest derives_from から ui-fields screen を解決できません (ui-fields/screen-N.md / ui-field:screen-N / page-groups.md#<grouping> で参照してください)";

async function deriveRows(root: string, page: PageInfo): Promise<{ rows: DerivedRow[]; warnings: string[] }> {
  const warnings: string[] = [];
  if (page.screens.length === 0) warnings.push(NO_SCREEN);
  const fields: string[] = [];
  for (const s of page.screens) {
    const fs = await loadFields(root, s);
    if (fs.length === 0) warnings.push(`${s}.md の ## Fields {#fields} に field anchor がありません`);
    fields.push(...fs);
  }
  const collisions = findCollisions(fields);
  if (collisions.size > 0) {
    const detail = [...collisions].map(([e, fs]) => `<elem> "${e}": ${fs.join(", ")}`).join("; ");
    throw new InputError(`page 内で <elem> が衝突しています (${detail})。field id の改名か page grouping の見直しが必要です`);
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

// 構造が壊れた契約は黙って [] に置き換えず停止する (人間の extra を消さないため)
async function readContract(root: string, id: string): Promise<Contract | null> {
  const p = contractPath(root, id);
  if (!(await exists(p))) return null;
  const raw = (await readYaml(p)) ?? {};
  const where = `.ori/pages/${id}/testids.yaml`;
  if (typeof raw !== "object" || Array.isArray(raw)) throw new InputError(`${where} が mapping ではありません`);
  const rows = (key: "derived" | "extra"): Record<string, unknown>[] => {
    const v = (raw as Record<string, unknown>)[key];
    if (v === undefined || v === null) return [];
    if (!Array.isArray(v)) throw new InputError(`${where} の ${key} が配列ではありません (- testid: ... の list で書く)`);
    v.forEach((r, i) => {
      if (!r || typeof r !== "object" || Array.isArray(r) || typeof (r as Record<string, unknown>).testid !== "string") {
        throw new InputError(`${where} の ${key}[${i}] が testid を持つ mapping ではありません`);
      }
    });
    return v as Record<string, unknown>[];
  };
  return { derived: rows("derived") as unknown as DerivedRow[], extra: rows("extra") as unknown as ExtraRow[] };
}

// 既存ファイルは Document として読み derived / extra ノードだけ差し替える (コメント・extra の記述を保持)
// extra は追記のみなので、既存 item ノード (コメント付き) は残し c.extra の末尾の新規分だけを足す
async function writeContract(root: string, id: string, c: Contract): Promise<boolean> {
  const p = contractPath(root, id);
  const prev = (await exists(p)) ? await readFile(p, "utf8") : null;
  let body: string;
  if (prev === null) {
    body = HEADER + yamlStringify({ derived: c.derived, extra: c.extra });
  } else {
    const doc = parseDocument(prev);
    if (!isMap(doc.contents)) throw new InputError(`.ori/pages/${id}/testids.yaml が mapping ではありません`);
    doc.set("derived", doc.createNode(c.derived));
    const extra = doc.get("extra", true);
    if (isSeq(extra)) {
      const added = c.extra.slice(extra.items.length);
      // 初回 sync は `extra: []` (flow) を書く。flow のまま push すると崩れた flow style になるため、
      // 人間が編集する section として block style に直す (ori-oan.14)。
      // 旧版 add-extra が書いた flow style の extra も、item があれば sync で block に正規化する (ori-oan.15)。
      // 空の `extra: []` はそのまま (正規化は block 済みでは no-op なので冪等)
      for (const r of added) extra.items.push(doc.createNode(r));
      if (extra.items.length > 0) {
        extra.flow = false;
        for (const item of extra.items) if (isMap(item)) item.flow = false;
      }
    } else {
      doc.set("extra", doc.createNode(c.extra));
    }
    body = doc.toString();
  }
  if (prev === body) return false;
  await writeFile(p, body, "utf8");
  return true;
}

// ── commands ─────────────────────────────────────────────────────────

async function syncPage(root: string, id: string): Promise<Contract> {
  const page = await loadPage(root, id);
  const { rows, warnings } = await deriveRows(root, page);
  for (const w of warnings) console.error(`WARN: ${id}: ${w}`);
  const prev = await readContract(root, id);
  const next: Contract = { derived: rows, extra: prev?.extra ?? [] };
  const changed = await writeContract(root, id, next);
  console.log(`${changed ? "synced" : "up-to-date"}: .ori/pages/${id}/testids.yaml (derived ${rows.length}, extra ${next.extra.length})`);
  return next;
}

function rowViolations(page: PageInfo, r: ExtraRow): string[] {
  const v: string[] = [];
  const prefix = `${page.kind}.${page.id}`;
  const elemRe = new RegExp(`^${prefix.replace(/\./g, "\\.")}(?:\\.${ELEM_SEGMENT})*$`);
  const t = String(r.testid ?? "");
  if (!elemRe.test(t)) v.push(`extra 形式違反: "${t}" は "${prefix}" または "${prefix}.<elem>" (kebab-case) であること`);
  if (!r.purpose) v.push(`extra purpose 欠落: "${t}"`);
  if (!SOURCE_RE.test(String(r.source ?? ""))) v.push(`extra source 不正: "${t}" (derive | scenario:<id>)`);
  if (r.dynamic !== undefined && r.dynamic !== "data-key") v.push(`extra dynamic 不正: "${t}" (data-key のみ)`);
  return v;
}

function extraViolations(page: PageInfo, c: Contract): string[] {
  const v = c.extra.flatMap((r) => rowViolations(page, r));
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
    const cfg = ((await readYaml(cfgPath)) ?? {}) as { ori?: { workspace?: { apps_root?: string; apps?: { path?: string }[] } } };
    const ws = cfg.ori?.workspace;
    if (ws?.apps_root) appsRoot = ws.apps_root;
    for (const a of Array.isArray(ws?.apps) ? ws.apps : []) if (a?.path) paths.push(a.path);
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

interface ImplViolation {
  owner: string | null; // 帰属 page id (推定できなければ null)
  message: string;
}

// 形式違反でない literal の付与位置。owner は ImplViolation と同じ規則に page id 完全一致を足して推定する
interface ImplOccurrence {
  owner: string | null;
  value: string;
  loc: string;
}

interface ImplIndex {
  literals: Set<string>;
  violations: ImplViolation[];
  occurrences: ImplOccurrence[];
}

// 帰属判定用の page 情報。keys = その page の契約 testid と derived の field id (移行前の旧 testid)
interface PageRef {
  info: PageInfo;
  keys: Set<string>;
}

// 実装 testid 違反を page に寄せる (ori-oan.13): page.<id> / widget.<id> はその page、
// ui-field id 由来の screen-N-* はその screen を持つ page。一意に決まらなければ null
function ownerOf(raw: string, pages: PageRef[]): string | null {
  const ns = /(?:^|[^\w-])(?:page|widget)\.([^.\s"'`$]+)/.exec(raw);
  if (ns && pages.some((p) => p.info.id === ns[1])) return ns[1]!;
  const sc = /(?:^|[^\w-])(screen-\d+)-/.exec(raw);
  if (!sc) return null;
  const owners = pages.filter((p) => p.info.screens.includes(sc[1]!));
  return owners.length === 1 ? owners[0]!.info.id : null;
}

async function sourceFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  for (const d of await appSourceDirs(root)) await walk(d, files);
  const out: string[] = [];
  for (const f of files) if ((await stat(f)).size <= 2_000_000) out.push(f);
  return out;
}

// 実装側の data-testid を収集する。literal 以外 (式・テンプレート埋め込み) は形式違反。
// 改行をまたぐ属性 (`data-testid={\n "x"\n}`) を拾うためファイル全体に正規表現をかける
const ATTR_RE =
  /(v-bind:|:)?data-testid\s*=\s*(?:"([^"]*)"|'([^']*)'|\{\s*(?:"([^"]*)"|'([^']*)'|`([^`$]*)`)\s*\}|(\{[^}]*\}))/g;

async function indexImpl(root: string, pageIds: Set<string>, pages: PageRef[]): Promise<ImplIndex> {
  const literals = new Set<string>();
  const violations: ImplViolation[] = [];
  const occurrences: ImplOccurrence[] = [];
  for (const f of await sourceFiles(root)) {
    const rel = relative(root, f);
    if (TEST_FILE.test(rel)) continue;
    const text = await readFile(f, "utf8");
    const fileLiterals = new Set<string>();
    const fileViolations: ImplViolation[] = [];
    const fileOccurrences: ImplOccurrence[] = [];
    for (const m of text.matchAll(ATTR_RE)) {
      const at = m.index ?? 0;
      // `[data-testid="x"]` は selector であって付与ではない
      if (text[at - 1] === "[") continue;
      const loc = `${rel}:${text.slice(0, at).split("\n").length}`;
      const shown = m[0].replace(/\s+/g, " ");
      const push = (raw: string, msg: string): void => {
        fileViolations.push({ owner: ownerOf(raw, pages), message: `${loc}: ${msg}` });
      };
      let value = m[2] ?? m[3] ?? m[4] ?? m[5] ?? m[6];
      if (m[1] !== undefined) {
        // Vue の bind は中身が静的な文字列 literal (`:data-testid="'x'"`) のときだけ受け入れる
        const lit = value === undefined ? null : /^\s*'([^']*)'\s*$/.exec(value);
        value = lit ? lit[1] : undefined;
      }
      if (m[7] !== undefined || value === undefined || /[${}]/.test(value)) {
        push(shown, `動的 testid は禁止 (literal で書き、動的要素は固定 testid + data-key を使う): ${shown}`);
        continue;
      }
      literals.add(value);
      fileLiterals.add(value);
      if (!TESTID_CHARSET.test(value)) {
        push(value, `testid 形式違反 (kebab-case を . で連結): "${value}"`);
        continue;
      }
      const ns = /^(page|widget)\.([^.]+)/.exec(value);
      if (ns && !pageIds.has(ns[2]!)) {
        push(value, `testid が存在しない page / widget を指しています: "${value}"`);
        continue;
      }
      fileOccurrences.push({ owner: null, value, loc });
    }
    // 値から決まらない違反 (`{name}` / `row-${id}` 等) は、同じファイルが付けている testid から
    // page が 1 つに決まればその page に寄せる (page 指定の check が素通ししないように)
    const fileOwners = pages.filter((p) => [...fileLiterals].some((l) => p.keys.has(l)));
    for (const v of fileViolations) {
      if (v.owner === null && fileOwners.length === 1) v.owner = fileOwners[0]!.info.id;
      violations.push(v);
    }
    // 未契約 testid の帰属: 名前空間 / screen-N → page id との完全一致 (旧 root) → 同ファイルのフォールバック
    for (const o of fileOccurrences) {
      o.owner = ownerOf(o.value, pages) ?? pages.find((p) => p.info.id === o.value)?.info.id ?? (fileOwners.length === 1 ? fileOwners[0]!.info.id : null);
      occurrences.push(o);
    }
  }
  return { literals, violations, occurrences };
}

// manifest が壊れた page は帰属先候補から外すだけ (違反としては check 本体が報告する)
async function loadPagesLenient(root: string, ids: string[]): Promise<PageRef[]> {
  const pages: PageRef[] = [];
  for (const id of ids) {
    let info: PageInfo;
    try { info = await loadPage(root, id); } catch (e) { if (!(e instanceof InputError)) throw e; continue; }
    const keys = new Set<string>();
    try {
      for (const r of (await deriveRows(root, info)).rows) keys.add(r.testid).add(r.field);
      for (const r of (await readContract(root, id))?.extra ?? []) keys.add(r.testid);
    } catch (e) {
      if (!(e instanceof InputError)) throw e;
    }
    pages.push({ info, keys });
  }
  return pages;
}

// 「実装あり」= 契約 testid・derived の field id (移行前の旧 testid)・その page に寄せた違反のどれかが実装にある
function isImplemented(id: string, expected: DerivedRow[], c: Contract | null, impl: ImplIndex): boolean {
  return (
    [...expected.map((r) => r.testid), ...(c?.extra ?? []).map((r) => r.testid)].some((t) => impl.literals.has(t)) ||
    expected.some((r) => impl.literals.has(r.field)) ||
    impl.violations.some((v) => v.owner === id)
  );
}

interface CheckOptions {
  withImpl: boolean;
  implementedOnly: boolean;
  all: boolean; // page に寄せられない実装違反 (impl) は --all のときだけ数える (page 指定時は NOTE で表示のみ)
}

async function checkPages(root: string, ids: string[], opts: CheckOptions): Promise<number> {
  let count = 0;
  const report = (msg: string): void => { console.log(`VIOLATION ${msg}`); count++; };
  const allIds = await listPageIds(root);
  const impl = opts.withImpl ? await indexImpl(root, new Set(allIds), await loadPagesLenient(root, allIds)) : null;
  const reportOwned = (id: string): void => {
    for (const v of impl?.violations ?? []) if (v.owner === id) report(`${id}: impl: ${v.message}`);
  };
  for (const id of ids) {
    let page: PageInfo;
    let expected: DerivedRow[];
    let c: Contract | null;
    try {
      page = await loadPage(root, id);
      expected = (await deriveRows(root, page)).rows;
      c = await readContract(root, id);
    } catch (e) {
      if (!(e instanceof InputError)) throw e;
      // --implemented-only (generate) では入力不整合を移行 issue にしない。上流の未完了として扱う
      if (opts.implementedOnly) {
        console.log(`skip: ${id} (契約を導出できません: ${e.message})`);
        continue;
      }
      report(`${id}: ${e.message}`);
      reportOwned(id);
      continue;
    }
    if (opts.implementedOnly && impl && !isImplemented(id, expected, c, impl)) {
      console.log(`skip: ${id} (実装なし)`);
      continue;
    }
    // screen を解決できない page は契約が空のまま全検査を素通りするため違反にする
    if (page.screens.length === 0) report(`${id}: ${NO_SCREEN}`);
    if (!c) {
      report(`${id}: testids.yaml がありません (testids.js sync ${id})`);
      reportOwned(id);
      continue;
    }
    if (JSON.stringify(c.derived) !== JSON.stringify(expected)) {
      report(`${id}: derived が ui-fields と不一致 (stale)。testids.js sync ${id} で再生成してください`);
    }
    for (const v of extraViolations(page, c)) report(`${id}: ${v}`);
    if (impl) {
      for (const t of [...expected.map((r) => r.testid), ...c.extra.map((r) => r.testid)]) {
        if (!impl.literals.has(t)) report(`${id}: 契約 testid が実装に存在しません: "${t}"`);
      }
    }
    reportOwned(id);
  }
  for (const v of impl?.violations ?? []) {
    if (v.owner !== null) continue;
    if (opts.all) report(`${UNOWNED}: ${v.message}`);
    else console.log(`NOTE ${UNOWNED}: ${v.message} (どの page にも帰属できない。件数に含めない — check --all で数える)`);
  }
  console.log(count === 0 ? "OK: testid 契約違反なし" : `testid 契約違反: ${count} 件`);
  return count;
}

// match 直前が testid の値の位置か: data-testid="x" / data-testid={"x"} / :data-testid="'x'" /
// [data-testid="x"] / getByTestId('x') 等。同じ行の id= / for= は数えない
const TESTID_CONTEXT = /test-?id\s*(?:=|\()\s*\{?\s*["'`]{0,2}$/i;

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// 既存実装を契約へ移行するための置換対応表 (読み取り専用、ori-oan.13)。
// 旧 testid = derived 行の ui-field id (field id を testid に直写しした実装)。実装とテストの使用箇所を出す。
// 数えるのは testid の値の位置 (data-testid="…" / getByTestId('…') 等) だけ。id= / for= / name= など
// それ以外の field id は置換してはいけないので「参考」として件数に含めない。
// extra 行と動的 testid は旧値を推定できないので「手動」として並べる。exit 1 = 旧 testid の使用が残っている
async function migrateMap(root: string, id: string): Promise<number> {
  const page = await loadPage(root, id);
  const { rows } = await deriveRows(root, page);
  const c = await readContract(root, id);
  const allIds = await listPageIds(root);
  const impl = await indexImpl(root, new Set(allIds), await loadPagesLenient(root, allIds));
  const texts: [string, string][] = [];
  for (const f of await sourceFiles(root)) texts.push([relative(root, f), await readFile(f, "utf8")]);
  let remaining = 0;
  console.log(`# ${id}: 旧 testid (ui-field id) → 契約 testid`);
  for (const r of rows) {
    const re = new RegExp(`(?<![\\w-])${escapeRe(r.field)}(?![\\w-])`, "g");
    const hits: string[] = [];
    const refs: string[] = [];
    for (const [rel, text] of texts) {
      for (const m of text.matchAll(re)) {
        const before = text.slice(0, m.index ?? 0);
        const where = `${TEST_FILE.test(rel) ? "test" : "impl"} ${rel}:${before.split("\n").length}`;
        // 直前 120 文字を見る (Prettier が改行した getByTestId(\n  "x") も拾う)
        (TESTID_CONTEXT.test(before.slice(-120)) ? hits : refs).push(where);
      }
    }
    console.log(`${r.field} → ${r.testid}${hits.length === 0 ? " (使用箇所なし)" : ""}`);
    for (const h of hits) console.log(`  ${h}`);
    for (const h of refs) console.log(`  参考 (testid 以外の文脈の可能性が高い。要確認): ${h}`);
    remaining += hits.length;
  }
  for (const r of c?.extra ?? []) {
    if (!impl.literals.has(r.testid)) console.log(`手動: ${r.testid} (${r.purpose}) — extra 行は旧 testid を推定できません`);
  }
  for (const v of impl.violations) if (v.owner === id) console.log(`手動: ${v.message}`);
  // 契約にも旧 field id にも無い、この page に帰属する実装 testid。契約に足すか消すかは人間判断なので件数・exit code に含めない
  const known = new Set<string>([...rows.flatMap((r) => [r.testid, r.field]), ...(c?.extra ?? []).map((r) => r.testid)]);
  const uncontracted = new Map<string, string[]>();
  for (const o of impl.occurrences) {
    if (o.owner !== id || known.has(o.value)) continue;
    uncontracted.set(o.value, [...(uncontracted.get(o.value) ?? []), o.loc]);
  }
  if (uncontracted.size > 0) {
    console.log(`\n# ${id}: 未契約の testid (契約に追加するか削除するかは人間判断。件数・exit code には含めない)`);
    for (const [t, locs] of uncontracted) {
      console.log(t);
      for (const l of locs) console.log(`  impl ${l}`);
    }
    console.log("");
  }
  console.log(remaining === 0 ? "OK: 旧 testid の使用 0 件" : `旧 testid の使用: ${remaining} 件`);
  return remaining > 0 ? 1 : 0;
}

// page-groups.md の grouping 節ごとに screen 集合を取り、<elem> 衝突を検出する (11b 用、.ori/pages/ 不要)
async function checkCollisions(root: string): Promise<number> {
  const groups = await parsePageGroups(root);
  if (groups === null) throw new InputError(".ori/domain/ui-fields/page-groups.md がありません");
  if (groups.size === 0) {
    console.error("WARN: page-groups.md から grouping ⇔ screen の対応を 1 件も解析できませんでした (depends_on: の - ui-field:screen-N で参照してください)");
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
  // 検査は追記行だけ (既存 extra の違反は check の責務で、追記を妨げない)
  const v = rowViolations(await loadPage(root, id), row);
  if (v.length > 0) {
    for (const m of v) console.log(`VIOLATION ${id}: ${m}`);
    return 1;
  }
  await writeContract(root, id, { derived: c.derived, extra: [...c.extra, row] });
  console.log(`added: "${testid}" → .ori/pages/${id}/testids.yaml extra`);
  return 0;
}

// ── main ─────────────────────────────────────────────────────────────

async function main(): Promise<number> {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const [cmd, target] = positional;
  const targets = positional.slice(1);
  if (!cmd) usage();
  const root = await resolveRoot(flags.get("root"));
  const all = flags.get("all") === true;
  const ids = async (): Promise<string[]> => {
    if (all) return listPageIds(root);
    if (targets.length === 0) usage();
    return targets;
  };
  switch (cmd) {
    case "sync": {
      for (const id of await ids()) await syncPage(root, id);
      return 0;
    }
    case "check": {
      const opts = { withImpl: flags.get("no-impl") !== true, implementedOnly: flags.get("implemented-only") === true, all };
      // 実装有無の判定には実装の探索が要る
      if (opts.implementedOnly && !opts.withImpl) usage();
      return (await checkPages(root, await ids(), opts)) > 0 ? 1 : 0;
    }
    case "migrate-map":
      if (!target) usage();
      return migrateMap(root, target);
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
