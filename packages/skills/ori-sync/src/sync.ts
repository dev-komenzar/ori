import { execFileSync } from "node:child_process";
import { access, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { Document, isSeq, parseDocument } from "yaml";
import { consola } from "consola";
import type { NodeRef } from "@ori-ori/coherence";
import { extractSections, hashSection } from "@ori-ori/parser";
import type { DirtyEntry, ScenarioDirtyEntry } from "@ori-ori/slice-runner";

type AnyDirtyEntry = DirtyEntry | ScenarioDirtyEntry;

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
// --force (派生文書の直接編集 + proposal 自動生成) は廃止 (ori-7jm.11)。黙って無視すると
// 派生文書の直接編集が通ったと誤解されるので、正規の更新手順を案内して止める
if (boolFlag("force")) {
  consola.error(
    "/ori-sync: --force is no longer supported. Derived files (spec.md, tests, runner config) are not edited directly: " +
      "edit the source (manifest.yaml / domain docs / .ori/architecture.md), run /ori-sync, then /ori-flow <id>. " +
      "Use /ori-propose when the upstream (domain) needs to change.",
  );
  process.exit(2);
}

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

// --file の相対パスは呼び出し時の cwd 基準で解決する (chdir 後の cwd = project root ではない。ori-064a)
const invocationCwd = process.cwd();
const root = await findProjectRoot(invocationCwd);
process.chdir(root);

function git(gitArgs: string[]): string | null {
  try {
    return execFileSync("git", gitArgs, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 });
  } catch {
    return null;
  }
}

// .ori/ 配下の変更ファイル (domain だけでなく slice/page/scenario の派生物も。ori-7jm.10)。
// --relative で project root 相対にそろえる (.ori/ が git repo の subdir にある場合のため)。
// 未追跡ファイル (生成直後のテスト・新規 domain 文書) も変更として扱う
// -z: 非 ASCII のパス (日本語のファイル名) を git が 8 進エスケープ + 引用符で出さないように。
// --no-renames: rename 元のパスも「削除」として出し、旧パスを derives_from に持つ doc を取りこぼさない
function gitChangedNames(sinceRef: string): string[] {
  const diff = git(["diff", "--name-only", "-z", "--no-renames", "--relative", sinceRef, "--", ".ori/"]);
  const untracked = git(["ls-files", "-z", "--others", "--exclude-standard", "--", ".ori/"]);
  if (diff === null || untracked === null) {
    consola.error(`/ori-sync: git failed to list changes under .ori/ (since=${sinceRef})`);
    process.exit(2);
  }
  const out = new Set<string>();
  for (const f of [...diff.split("\0"), ...untracked.split("\0")]) {
    if (!f || f.split("/").includes("node_modules")) continue;
    out.add(f);
  }
  return [...out];
}

// 比較元の ref が解決できないとき (typo・shallow clone で origin/main が無い等) に
// 「変更なし」で exit 0 すると --check が素通りするため、先に検証して止める
// (既定の HEAD が解決できない = git 外 / commit 前の repo は従来どおり「変更なし」で続ける)
function sinceResolvable(sinceRef: string): boolean {
  if (git(["rev-parse", "--verify", "--quiet", `${sinceRef}^{commit}`]) !== null) return true;
  if (flag("since") !== undefined) {
    consola.error(`/ori-sync: cannot resolve --since ref '${sinceRef}' (is this a git repository with that commit?)`);
    process.exit(2);
  }
  consola.warn(`/ori-sync: ${sinceRef} is not resolvable (not a git repository, or no commits yet); use --file=<path> to name changed files`);
  return false;
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

// domain 文書の変更を section (H2/H3 の {#anchor}) 単位で判定する (ori-t3vg)。
// 以前はファイル単位で突き合わせていたため、1 節の編集でそのファイルのどこかを
// derives_from に持つ全 doc が dirty になっていた。
interface DomainChange {
  /** null = 節単位で判定できない (旧版が無い / 新規 / 削除 / .md 以外 / --file) → ファイル単位 */
  changed: Set<string> | null;
  /** 旧版・新版の両方で一意な anchor 付き H2/H3 section id (重複 anchor はファイル単位に倒す) */
  known: Set<string>;
}

const domainChangeCache = new Map<string, DomainChange>();

// frontmatter は自前で切り出す (gray-matter は不正な frontmatter で throw し、sync 全体が落ちるため)
function splitFrontmatter(content: string): { frontmatter: string; body: string } {
  const m = /^---\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/.exec(content);
  return m ? { frontmatter: m[0], body: content.slice(m[0].length) } : { frontmatter: "", body: content };
}

interface SectionDigest {
  /** どの節にも属さない部分 (frontmatter + 最初の H2/H3 より前の前文 + H1 直下の本文) の hash */
  preamble: string;
  /** anchor → 判定用 hash。null は重複 anchor */
  sections: Map<string, string | null>;
}

// 節の判定用 hash = 自身 (見出し + 子節を含む本文) + 祖先 H2 の「自身の本文」(見出し + anchor 付き子節を除く本文)。
// 親 H2 の前文や anchor の無い子節が変わったときも、子の H3 を参照する doc を dirty にする (取りこぼし防止)
function sectionDigest(content: string): SectionDigest {
  const { frontmatter, body } = splitFrontmatter(content);
  const lines = body.split(/\r?\n/);
  const ordered = extractSections(body).ordered;
  // 0-indexed の [start, end) 行範囲 (見出し行を含む)
  const range = (sec: (typeof ordered)[number]) => [sec.startLine - 1, sec.endLine - 1] as const;
  const covered = new Array<boolean>(lines.length).fill(false);
  for (const sec of ordered) {
    const [a, b] = range(sec);
    for (let k = a; k < b; k++) covered[k] = true;
  }
  const preamble = hashSection(frontmatter + "\n" + lines.filter((_, k) => !covered[k]).join("\n"));

  const sections = new Map<string, string | null>();
  let parent: { own: string; end: number } | null = null;
  for (const sec of ordered) {
    const [a, b] = range(sec);
    if (sec.depth === 2) {
      // 自身の本文 = 範囲から anchor 付きの子 H3 を除いた行
      const own = new Array<boolean>(b - a).fill(true);
      for (const child of ordered) {
        if (child.depth !== 3 || child.id === null) continue;
        const [ca, cb] = range(child);
        if (ca < a || ca >= b) continue;
        for (let k = ca; k < cb; k++) own[k - a] = false;
      }
      parent = { own: hashSection(lines.slice(a, b).filter((_, k) => own[k]).join("\n")), end: b };
    } else if (parent && a >= parent.end) {
      parent = null; // H2 の外にある H3
    }
    if (sec.id === null) continue;
    const self = hashSection(lines.slice(a, b).join("\n"));
    const digest = sec.depth === 3 && parent ? `${parent.own}:${self}` : self;
    sections.set(sec.id, sections.has(sec.id) ? null : digest);
  }
  return { preamble, sections };
}

async function domainChange(changedFile: string): Promise<DomainChange> {
  const cached = domainChangeCache.get(changedFile);
  if (cached) return cached;
  let result: DomainChange = { changed: null, known: new Set() };
  // --file は「このファイルが変わった」という明示指定なので、差分の有無によらずファイル単位
  if (!fileArg && changedFile.endsWith(".md")) {
    const prev = git(["show", `${since}:./${changedFile}`]);
    let curr: string | null = null;
    try { curr = await readFile(join(root, changedFile), "utf8"); } catch { curr = null; }
    let before: SectionDigest | null = null;
    let after: SectionDigest | null = null;
    try {
      if (prev !== null && curr !== null) {
        before = sectionDigest(prev);
        after = sectionDigest(curr);
      }
    } catch (err) {
      // 解析できない文書はファイル単位で判定する (無関係な doc の dirty 付与まで止めない)
      consola.warn(`cannot split ${changedFile} into sections (${(err as Error).message}); matching by file`);
    }
    // frontmatter / 前文の変更は、どの節に効くか分からないのでファイル単位
    if (before && after && before.preamble === after.preamble) {
      const changed = new Set<string>();
      const known = new Set<string>();
      for (const id of new Set([...before.sections.keys(), ...after.sections.keys()])) {
        const b = before.sections.get(id);
        const a = after.sections.get(id);
        if (b === null || a === null) continue; // 重複 anchor → known に入れずファイル単位
        known.add(id);
        if (b !== a) changed.add(id); // 片方にしか無い (追加・削除) も変更
      }
      result = { changed, known };
    }
  }
  domainChangeCache.set(changedFile, result);
  return result;
}

async function domainRefAffected(ref: string, changedFile: string): Promise<boolean> {
  if (!pathMatches(ref, changedFile)) return false;
  const { sectionId } = normalizeRef(ref);
  if (!sectionId) return true;
  const change = await domainChange(changedFile);
  if (change.changed === null) return true;
  // H1 の anchor や H4 以下など節として追跡していない anchor は、ファイル単位で判定する (取りこぼし防止)
  if (!change.known.has(sectionId)) return true;
  return change.changed.has(sectionId);
}

interface ManifestEntry {
  id: string;
  kind: "slice" | "page" | "scenario";
  dir: string;
  manifest: any;
}

// manifest.yaml が YAML として不正なとき、その doc は derives_from が分からず dirty を付けられない。
// 黙って飛ばすと exit 0 で終わり dirty 付与漏れになるため、位置付きで報告して exit 1 にする (ori-5qrc)
class InvalidYamlError extends Error {
  constructor(readonly rel: string, readonly details: string[]) {
    super(`${rel} is not valid YAML`);
  }
}

function yamlErrorDetails(rel: string, doc: Document.Parsed): string[] {
  return doc.errors.map((e) => {
    const pos = e.linePos?.[0];
    return `${pos ? `${rel}:${pos.line}:${pos.col}` : rel}  ${e.message.split("\n")[0]}`;
  });
}

async function listManifests(): Promise<{ entries: ManifestEntry[]; invalid: InvalidYamlError[] }> {
  const out: ManifestEntry[] = [];
  const invalid: InvalidYamlError[] = [];
  for (const kind of ["slices", "pages", "scenarios"] as const) {
    const baseDir = join(root, ".ori", kind);
    if (!(await exists(baseDir))) continue;
    const entries = await readdir(baseDir, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const dir = join(baseDir, e.name);
      const manifestPath = join(dir, "manifest.yaml");
      if (!(await exists(manifestPath))) continue;
      const rel = relative(root, manifestPath);
      let raw: string;
      try {
        raw = await readFile(manifestPath, "utf8");
      } catch (err) {
        invalid.push(new InvalidYamlError(rel, [`${rel}  cannot read: ${(err as Error).message}`]));
        continue;
      }
      const doc = parseDocument(raw);
      if (doc.errors.length > 0) {
        invalid.push(new InvalidYamlError(rel, yamlErrorDetails(rel, doc)));
        continue;
      }
      const kindType = kind === "slices" ? "slice" : kind === "pages" ? "page" : "scenario";
      out.push({ id: e.name, kind: kindType, dir, manifest: doc.toJS() });
    }
  }
  return { entries: out, invalid };
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

// status.yaml が YAML として不正なときは該当ファイルと位置を示して報告する (ori-6dr5)。
// 例外のスタックトレースで落ちると、どのファイルが壊れているか利用者に分からない。
async function readStatusDoc(statusPath: string): Promise<Document.Parsed> {
  const rel = relative(root, statusPath);
  const doc = parseDocument(await readFile(statusPath, "utf8"));
  if (doc.errors.length > 0) throw new InvalidYamlError(rel, yamlErrorDetails(rel, doc));
  const data = doc.toJS();
  if (data != null && (typeof data !== "object" || Array.isArray(data))) {
    throw new InvalidYamlError(rel, [`${rel}  top level must be a mapping`]);
  }
  return doc;
}

async function readStatus(statusPath: string): Promise<Record<string, any>> {
  return (await readStatusDoc(statusPath)).toJS() ?? {};
}

function reportInvalid(invalid: InvalidYamlError[]): void {
  // 詳細も error に含める (consola.log は test 環境などで level により抑止される)
  const statuses = invalid.filter((e) => e.rel.endsWith("status.yaml"));
  const manifests = invalid.filter((e) => !e.rel.endsWith("status.yaml"));
  const lines: string[] = [];
  if (statuses.length > 0) {
    lines.push(
      `${statuses.length} status.yaml file(s) are not valid YAML:`,
      ...statuses.flatMap((e) => e.details.map((d) => `  ${d}`)),
      "  fix the file(s) by hand (e.g. remove list items left under 'dirty: []', quote values containing ': '), then re-run /ori-sync",
    );
  }
  if (manifests.length > 0) {
    lines.push(
      `${manifests.length} manifest.yaml file(s) are not valid YAML (their docs could not be checked for dirty):`,
      ...manifests.flatMap((e) => e.details.map((d) => `  ${d}`)),
      "  fix the file(s), then re-run /ori-sync",
    );
  }
  consola.error(lines.join("\n"));
}

const entryKey = (e: AnyDirtyEntry) =>
  `${e.source.path}#${e.source.sectionId ?? ""}|${e.affected_phase}|${e.reason ?? ""}`;

// dirty だけを追記し、手書きのコメントや他キーの書式は保つ (ori-o3nu)
async function appendDirty(statusPath: string, newEntries: AnyDirtyEntry[]): Promise<number> {
  const doc = (await exists(statusPath)) ? await readStatusDoc(statusPath) : new Document({});
  if (doc.contents == null) doc.contents = doc.createNode({}) as any;
  const data = doc.toJS() ?? {};
  const existing: AnyDirtyEntry[] = Array.isArray(data.dirty) ? data.dirty : [];
  const seen = new Set(existing.map(entryKey));
  const toAdd: AnyDirtyEntry[] = [];
  for (const e of newEntries) {
    if (seen.has(entryKey(e))) continue;
    seen.add(entryKey(e));
    toAdd.push(e);
  }
  if (toAdd.length === 0) return 0;
  const node = doc.get("dirty", true);
  if (isSeq(node)) {
    node.flow = false;
    for (const e of toAdd) node.add(doc.createNode(e));
  } else {
    doc.set("dirty", doc.createNode([...existing, ...toAdd]));
  }
  await writeFile(statusPath, doc.toString(), "utf8");
  return toAdd.length;
}

// ---- derived 内の dirty 伝播 (ori-7jm.10) ----
// domain → derived だけでなく、doc 自身の source / 派生物の変更、scenario が参照する page の変更も
// dirty にする。affected_phase は「どの phase からやり直すか」。
//   manifest.yaml (全 kind)                      → derive
//   scenario の spec.md                           → generate (テストを spec に合わせ直す)
//   scenario の tests/** / runner config          → review   (再レビューが要る)
//   scenario.pages の page spec.md / testids.yaml → generate (testid 契約・画面仕様の変更)
// doctor の check-scenario-staleness.sh と同じく、変更ファイルが doc の review.md より新しい場合だけ
// 付ける (flow を回して review 済みの変更を、HEAD との差分として再び dirty にしないため)。
const SCENARIO_RUNNER_FILES = new Set([
  "validation.md",
  "playwright.config.ts",
  "wdio.conf.ts",
  "teardown.mjs",
  "tsconfig.json",
  "docker-compose.yml",
]);

// tests/ 直下の、テスト runner が既定で吐く出力ディレクトリだけを除く (派生物ではないため)。
// 拡張子や任意の深さのディレクトリ名では除かない: screenshot baseline (__screenshots__ / *-snapshots / localBaseline) や
// fixtures の画像・zip・log もテストの入力なので、review をやり直す対象。その他の生成物は .gitignore に入れる
const RUN_OUTPUT_DIRS = new Set(["test-results", "playwright-report", "allure-results", "allure-report", ".cache"]);
function isRunArtifact(relInDir: string): boolean {
  const segs = relInDir.split("/"); // ["tests", <dir>, ...]
  return segs.length > 2 && RUN_OUTPUT_DIRS.has(segs[1]!);
}

function internalPhase(m: ManifestEntry, relInDir: string): AnyDirtyEntry["affected_phase"] | null {
  if (relInDir === "manifest.yaml") return "derive";
  if (m.kind !== "scenario") return null;
  if (relInDir === "spec.md") return "generate";
  if (SCENARIO_RUNNER_FILES.has(relInDir)) return "review";
  if (relInDir.startsWith("tests/") && !isRunArtifact(relInDir)) return "review";
  return null;
}

async function mtimeMs(p: string): Promise<number | null> {
  try { return (await stat(p)).mtimeMs; } catch { return null; }
}

// review.md より後に変わったか。削除されたファイルは、残っている最寄りの親ディレクトリの mtime
// (エントリ削除で更新される) で比べる (常に「後」とすると finalize 後も毎回 dirty が付き直る)。
// review.md が無い doc は初回の flow が進行中 (scaffold 直後・generate 中) で、review → finalize を
// まだ通っていないので付けない (付けると作成直後の doc が --check で落ちる)
async function changedAfterReview(m: ManifestEntry, changedFile: string): Promise<boolean> {
  const reviewed = await mtimeMs(join(m.dir, "review.md"));
  if (reviewed === null) return false;
  let changed = await mtimeMs(join(root, changedFile));
  for (let d = dirname(join(root, changedFile)); changed === null && d.startsWith(root); d = dirname(d)) {
    changed = await mtimeMs(d);
    if (d === root) break;
  }
  if (changed === null) return true;
  // 秒単位にそろえる (doctor と同じく同秒は review 済み扱い)
  return Math.floor(changed / 1000) > Math.floor(reviewed / 1000);
}

async function derivedHits(
  m: ManifestEntry,
  changedFiles: string[],
): Promise<Array<{ source: NodeRef; phase: AnyDirtyEntry["affected_phase"] }>> {
  const out: Array<{ source: NodeRef; phase: AnyDirtyEntry["affected_phase"] }> = [];
  const dirRel = relative(root, m.dir);
  const pages: string[] =
    m.kind === "scenario" && Array.isArray(m.manifest?.pages)
      ? m.manifest.pages.filter((p: unknown): p is string => typeof p === "string")
      : [];
  for (const cf of changedFiles) {
    let phase: AnyDirtyEntry["affected_phase"] | null = null;
    if (cf.startsWith(`${dirRel}/`)) {
      phase = internalPhase(m, cf.slice(dirRel.length + 1));
    } else if (pages.some((p) => cf === `.ori/pages/${p}/spec.md` || cf === `.ori/pages/${p}/testids.yaml`)) {
      phase = "generate";
    }
    if (phase === null) continue;
    if (!(await changedAfterReview(m, cf))) continue;
    out.push({ source: { path: cf, sectionId: null }, phase });
  }
  return out;
}

async function run(): Promise<void> {
  // 1. determine changed files
  let changedFiles: string[];
  if (fileArg) {
    changedFiles = [relative(root, resolve(invocationCwd, fileArg)) || fileArg];
  } else {
    changedFiles = sinceResolvable(since) ? gitChangedNames(since) : [];
  }

  if (!changedFiles.length) {
    consola.success(`/ori-sync: no changes under .ori/ since ${since}`);
    // also check existing dirty marks
    if (check) await exitIfDirtyRemaining();
    process.exit(0);
  }

  consola.info(`/ori-sync: ${changedFiles.length} changed file(s) (since=${since})`);
  for (const f of changedFiles) consola.log(`  - ${f}`);

  // 2. find affected slices/pages/scenarios
  const { entries: manifests, invalid } = await listManifests();
  const now = new Date().toISOString();
  const reason = "edit";
  let totalDirty = 0;
  const affectedIds: string[] = [];

  for (const m of manifests) {
    const entries: AnyDirtyEntry[] = [];
    // 2a. domain → derived (section 単位)
    for (const ref of collectDerivedRefs(m.manifest)) {
      for (const cf of changedFiles) {
        if (!(await domainRefAffected(ref, cf))) continue;
        const norm = normalizeRef(ref);
        entries.push({
          source: { path: norm.path.startsWith(".ori/") ? norm.path : `.ori/${norm.path}`, sectionId: norm.sectionId },
          detected_at: now,
          affected_phase: "derive",
          reason,
        });
      }
    }
    // 2b. derived 内 (doc 自身の source / 派生物、scenario が参照する page)
    for (const h of await derivedHits(m, changedFiles)) {
      entries.push({ source: h.source, detected_at: now, affected_phase: h.phase, reason } as AnyDirtyEntry);
    }
    if (!entries.length) continue;

    const statusPath = join(m.dir, "status.yaml");
    let added: number;
    try {
      added = await appendDirty(statusPath, entries);
    } catch (err) {
      if (!(err instanceof InvalidYamlError)) throw err;
      invalid.push(err);
      consola.log(`  skipped (invalid status.yaml) → ${m.kind}/${m.id}`);
      continue;
    }
    if (added > 0) {
      totalDirty += added;
      affectedIds.push(m.id);
      consola.log(`  dirty +${added} → ${m.kind}/${m.id}`);
    }
  }

  if (totalDirty === 0 && invalid.length === 0) {
    consola.success("/ori-sync: no slices/pages/scenarios affected by these changes");
  } else if (totalDirty === 0) {
    consola.warn("/ori-sync: no dirty marks added (some manifest.yaml / status.yaml could not be read)");
  } else {
    consola.success(`/ori-sync: marked ${totalDirty} dirty entr${totalDirty === 1 ? "y" : "ies"} across ${affectedIds.length} ${affectedIds.length === 1 ? "doc" : "docs"}`);
    consola.info(`affected: ${affectedIds.join(", ")}`);
  }

  if (invalid.length > 0) {
    // dirty を付けられなかった doc があるので成功扱いにしない。修正後の再実行で重複なく付け直せる
    reportInvalid(invalid);
    process.exit(1);
  }

  if (check) await exitIfDirtyRemaining();
}

async function exitIfDirtyRemaining(): Promise<void> {
  const { count, invalid } = await countRemainingDirty();
  if (invalid.length > 0) {
    reportInvalid(invalid);
    process.exit(1);
  }
  if (count > 0) {
    consola.error(`${count} dirty mark(s) still pending across slices/pages/scenarios`);
    process.exit(1);
  }
}

async function countRemainingDirty(): Promise<{ count: number; invalid: InvalidYamlError[] }> {
  const { entries: manifests, invalid } = await listManifests();
  let count = 0;
  for (const m of manifests) {
    const statusPath = join(m.dir, "status.yaml");
    if (!(await exists(statusPath))) continue;
    try {
      const data = await readStatus(statusPath);
      if (Array.isArray(data.dirty)) count += data.dirty.length;
    } catch (err) {
      // 以前は黙って 0 件扱いにしていたため、壊れた status.yaml が --check を素通りした
      if (!(err instanceof InvalidYamlError)) throw err;
      invalid.push(err);
    }
  }
  return { count, invalid };
}

await run();
