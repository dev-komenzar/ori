/**
 * spec-hash: coherence frontmatter (upstream / hash) の共通実装 (ori-0eh.2)。
 *
 * 形式の SSoT は `.apm/instructions/feature-spec.instructions.md` §coherence frontmatter。
 * writer (write-spec-hash) と checker (ori-doctor / ori-finalize gate) は必ずこの
 * module を経由し、形式・hash 計算・旧キー正規化を二重実装しない。
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { isMap, isScalar, isSeq, parse as parseYaml, parseDocument, stringify as yamlStringify } from "yaml";

/** sha256 hex の先頭桁数。resolve-upstream.sh の `cut -c1-12` と同じ。 */
export const HASH_LENGTH = 12;

/** spec を持つ対象の種別。`.ori/<kind>/<id>/` に対応する。 */
export const SPEC_KINDS = ["slices", "pages", "scenarios"] as const;
export type SpecKind = (typeof SPEC_KINDS)[number];

/** manifest.derives_from の 1 entry を正規化したもの。 */
export interface UpstreamRef {
  /** `file` または `file#section` (`.ori/` prefix は除去済み)。coherence.upstream に書く値。 */
  ref: string;
  /** hash map のキー (`.ori/` 相対の file パス、anchor なし)。 */
  file: string;
  section?: string;
}

/** spec.md から読んだ coherence ブロック。 */
export interface SpecCoherence {
  source?: string;
  last_derived?: string;
  /** upstream ref 列 (旧形式 `[{path, hash}]` は path を取り出す)。 */
  upstream: string[];
  /** file キーへ正規化済みの hash map。キー衝突時は最初に出現した値。 */
  hash: Record<string, string>;
  /** 正規化で同一 file に潰れたキーのうち値が一致しなかったもの。 */
  conflicts: HashKeyConflict[];
  /** 新形式に無い記録 (旧キー・旧 upstream 形式・coherence.derives_from) を含むか。 */
  legacy: boolean;
}

export interface HashKeyConflict {
  file: string;
  /** 正規化前のキーと値 (出現順)。 */
  entries: Array<{ key: string; value: string }>;
}

/** writeSpecCoherence に渡す writer 専有フィールド。 */
export interface SpecCoherenceUpdate {
  source?: string;
  last_derived?: string;
  upstream: string[];
  hash: Record<string, string>;
}

/** 新形式で writer が管理するキー。これ以外の coherence 配下キーは保持する。 */
const WRITER_KEYS = ["source", "last_derived", "upstream", "hash"] as const;
/** 旧形式にのみ存在し、書き戻し時に除去するキー (stub の `derives_from: []`)。 */
const LEGACY_KEYS = ["derives_from"] as const;

// ---------------------------------------------------------------------------
// path / key 正規化

function stripQuotes(s: string): string {
  return s.trim().replace(/^(["'])(.*)\1$/, "$2");
}

/** `.ori/domain/x.md` → `domain/x.md`。絶対パスはそのまま。 */
function stripOriPrefix(file: string): string {
  return file.startsWith(".ori/") ? file.slice(".ori/".length) : file;
}

/**
 * hash map キーを file パスへ正規化する。
 * `file#.*` / `file#anchor` / `file` / `.ori/file#...` → `file`。
 */
export function normalizeHashKey(key: string): string {
  const hashIdx = key.indexOf("#");
  const file = hashIdx === -1 ? key : key.slice(0, hashIdx);
  return stripOriPrefix(stripQuotes(file));
}

/** `.ori/` 相対の file キーをディスク上の絶対パスへ解決する (resolve-upstream.sh の resolve_path と同じ規則)。 */
export function resolveUpstreamPath(projectRoot: string, file: string): string {
  return isAbsolute(file) ? file : join(projectRoot, ".ori", file);
}

// ---------------------------------------------------------------------------
// manifest.derives_from

function toRef(path: string, section?: string): UpstreamRef | undefined {
  const raw = stripQuotes(path);
  if (raw === "") return undefined;
  const hashIdx = raw.indexOf("#");
  const file = stripOriPrefix(hashIdx === -1 ? raw : raw.slice(0, hashIdx));
  const sec = section !== undefined && section !== "" ? section : hashIdx === -1 ? undefined : raw.slice(hashIdx + 1);
  if (file === "") return undefined;
  return sec ? { ref: `${file}#${sec}`, file, section: sec } : { ref: file, file };
}

/**
 * manifest.derives_from を UpstreamRef 列に変換する (resolve-upstream.sh の awk パーサの TS 移植)。
 * - legacy string form: `- domain/aggregates.md#note-aggregate`
 * - structured form: `- path: .ori/domain/x.md` + 任意の `section: y`
 * 入力は manifest.yaml のテキストまたは parse 済みオブジェクト。出現順を保ち、同一 ref は 1 つにまとめる。
 */
export function parseDerivesFrom(manifest: string | unknown): UpstreamRef[] {
  const obj = typeof manifest === "string" ? parseYaml(manifest) : manifest;
  if (obj === null || typeof obj !== "object") return [];
  const list = (obj as { derives_from?: unknown }).derives_from;
  if (!Array.isArray(list)) return [];

  const out: UpstreamRef[] = [];
  const seen = new Set<string>();
  for (const entry of list) {
    let ref: UpstreamRef | undefined;
    if (typeof entry === "string") {
      ref = toRef(entry);
    } else if (entry !== null && typeof entry === "object" && typeof (entry as { path?: unknown }).path === "string") {
      const e = entry as { path: string; section?: unknown };
      ref = toRef(e.path, typeof e.section === "string" ? e.section : undefined);
    }
    if (ref && !seen.has(ref.ref)) {
      seen.add(ref.ref);
      out.push(ref);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// hash

/** sha256(raw bytes) の先頭 12 hex。`sha256sum <file> | cut -c1-12` と同値。 */
export function computeFileHash(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex").slice(0, HASH_LENGTH);
}

export interface ExpectedCoherence {
  /** derives_from の ref 列 (coherence.upstream に書く値)。 */
  upstream: string[];
  /** file 単位で dedupe した hash map (derives_from の初出順)。 */
  hash: Record<string, string>;
  /** ディスク上に存在しない file キー。hash には含めない。 */
  missing: string[];
}

/** derives_from から「いま書かれるべき」upstream / hash を計算する。writer と checker の共通基準。 */
export function computeExpectedCoherence(projectRoot: string, refs: UpstreamRef[]): ExpectedCoherence {
  const upstream = refs.map((r) => r.ref);
  const hash: Record<string, string> = {};
  const missing: string[] = [];
  for (const { file } of refs) {
    if (file in hash || missing.includes(file)) continue;
    const abs = resolveUpstreamPath(projectRoot, file);
    if (existsSync(abs)) hash[file] = computeFileHash(abs);
    else missing.push(file);
  }
  return { upstream, hash, missing };
}

// ---------------------------------------------------------------------------
// 対象 (.ori/{slices,pages,scenarios}/<id>/)

export interface SpecTarget {
  kind: SpecKind;
  id: string;
  dir: string;
  manifestPath: string;
  specPath: string;
}

/** id から対象ディレクトリを解決する。manifest.yaml を持つ最初の kind (slices → pages → scenarios) を返す。 */
export function findSpecTarget(projectRoot: string, id: string): SpecTarget | undefined {
  for (const kind of SPEC_KINDS) {
    const dir = join(projectRoot, ".ori", kind, id);
    const manifestPath = join(dir, "manifest.yaml");
    if (existsSync(manifestPath)) return { kind, id, dir, manifestPath, specPath: join(dir, "spec.md") };
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// frontmatter

interface FrontmatterSplit {
  /** `---\n` から閉じ `---` 行の直前まで (YAML 本体)。frontmatter が無ければ undefined。 */
  yaml: string | undefined;
  /** 開き `---` 行。 */
  open: string;
  /** 閉じ `---` 行 (改行込み) 以降の本文。 */
  rest: string;
  eol: string;
}

function splitFrontmatter(text: string): FrontmatterSplit {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const m = /^---[ \t]*\r?\n/.exec(text);
  if (!m) return { yaml: undefined, open: "", rest: text, eol };
  const bodyStart = m[0].length;
  const close = /^---[ \t]*(\r?\n|$)/m;
  const after = text.slice(bodyStart);
  const c = close.exec(after);
  if (!c) return { yaml: undefined, open: "", rest: text, eol };
  return { yaml: after.slice(0, c.index), open: m[0], rest: after.slice(c.index), eol };
}

function scalarString(node: unknown): string | undefined {
  if (isScalar(node)) return node.value === null || node.value === undefined ? undefined : String(node.value);
  return undefined;
}

/**
 * spec.md の coherence ブロックを読む。新形式 (upstream: string[] / hash: file map) に加え、
 * 旧形式 (`hash` の `file#.*` / `file#anchor` キー、YAML 上の重複キー、scenario の
 * `upstream: [{path, hash}]`、stub の `derives_from`) も読み、hash は file キーへ正規化する。
 */
export function readSpecCoherence(specText: string): SpecCoherence {
  const result: SpecCoherence = { upstream: [], hash: {}, conflicts: [], legacy: false };
  const { yaml } = splitFrontmatter(specText);
  if (yaml === undefined) return result;

  // 旧データは `file#.*` が潰れて重複キーになっている (promptnotes ori-ehz) ため uniqueKeys を無効化して読む。
  const doc = parseDocument(yaml, { uniqueKeys: false });
  const coh = doc.get("coherence", true);
  if (!isMap(coh)) return result;

  const source = scalarString(coh.get("source", true));
  if (source !== undefined) result.source = source;
  const lastDerived = scalarString(coh.get("last_derived", true));
  if (lastDerived !== undefined) result.last_derived = lastDerived;
  if (coh.has("derives_from")) result.legacy = true;

  const raw: Array<{ key: string; value: string }> = [];

  const up = coh.get("upstream", true);
  if (isSeq(up)) {
    for (const item of up.items) {
      if (isMap(item)) {
        // scenario 旧形式: { path, hash }
        result.legacy = true;
        const path = scalarString(item.get("path", true));
        if (path === undefined) continue;
        result.upstream.push(path);
        const h = scalarString(item.get("hash", true));
        if (h !== undefined) raw.push({ key: path, value: h });
      } else {
        const s = scalarString(item);
        if (s !== undefined) result.upstream.push(s);
      }
    }
  }

  const hash = coh.get("hash", true);
  if (isMap(hash)) {
    for (const pair of hash.items) {
      const key = isScalar(pair.key) ? String(pair.key.value) : String(pair.key);
      const value = scalarString(pair.value);
      if (value === undefined) continue;
      raw.push({ key, value });
    }
  }

  const byFile = new Map<string, Array<{ key: string; value: string }>>();
  for (const e of raw) {
    const file = normalizeHashKey(e.key);
    if (file !== e.key) result.legacy = true;
    const list = byFile.get(file) ?? [];
    list.push(e);
    byFile.set(file, list);
  }
  for (const [file, entries] of byFile) {
    result.hash[file] = entries[0]!.value;
    if (entries.length > 1) {
      result.legacy = true;
      if (new Set(entries.map((e) => e.value)).size > 1) result.conflicts.push({ file, entries });
    }
  }
  return result;
}

/** 行が frontmatter のトップレベルキー行 (インデントなし `key:`) か。 */
function isTopLevelKeyLine(line: string): boolean {
  return /^[^\s#-][^:]*:(\s|$)/.test(line) || /^["'][^"']*["']:(\s|$)/.test(line);
}

/**
 * spec.md の coherence ブロックを新形式で書き換えた全文を返す。
 * - frontmatter の coherence 以外のキー (行) と本文はバイト単位で変更しない
 * - coherence 配下の writer 管理外キーは保持し、旧 `derives_from` は除去する
 * - frontmatter / coherence が無ければ追加する
 */
export function writeSpecCoherence(specText: string, update: SpecCoherenceUpdate): string {
  const split = splitFrontmatter(specText);
  const eol = split.eol;

  const preserved: Record<string, unknown> = {};
  let lines: string[] = [];
  let start = -1;
  let end = -1;
  if (split.yaml !== undefined) {
    lines = split.yaml.split(/\r?\n/);
    // split の末尾は閉じ `---` 直前の改行で生じる空要素
    if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
    start = lines.findIndex((l) => /^coherence:(\s|$)/.test(l));
    if (start !== -1) {
      end = start + 1;
      while (end < lines.length && !isTopLevelKeyLine(lines[end]!)) end++;
      // ブロック末尾の空行・コメント行は次のキーに属するものとして残す
      while (end > start + 1 && /^(\s*$|#)/.test(lines[end - 1]!)) end--;
      const block = parseDocument(lines.slice(start, end).join("\n"), { uniqueKeys: false }).toJS() as {
        coherence?: unknown;
      } | null;
      const existing = block?.coherence;
      if (existing && typeof existing === "object" && !Array.isArray(existing)) {
        for (const [k, v] of Object.entries(existing as Record<string, unknown>)) {
          if ((WRITER_KEYS as readonly string[]).includes(k) || (LEGACY_KEYS as readonly string[]).includes(k)) continue;
          preserved[k] = v;
        }
      }
    }
  }

  const coherence: Record<string, unknown> = {};
  if (update.source !== undefined) coherence.source = update.source;
  if (update.last_derived !== undefined) coherence.last_derived = update.last_derived;
  coherence.upstream = [...update.upstream];
  coherence.hash = { ...update.hash };
  Object.assign(coherence, preserved);

  const rendered = yamlStringify({ coherence }, { lineWidth: 0 }).replace(/\n$/, "").split("\n");

  if (split.yaml === undefined) {
    return ["---", ...rendered, "---", ""].join(eol) + specText;
  }
  const next = start === -1 ? [...lines, ...rendered] : [...lines.slice(0, start), ...rendered, ...lines.slice(end)];
  return split.open + next.join(eol) + eol + split.rest;
}
