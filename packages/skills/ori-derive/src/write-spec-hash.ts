/**
 * write-spec-hash: spec.md の coherence (upstream / hash) を決定的に書く writer (ori-0eh.3)。
 *
 * 形式の SSoT は `.apm/instructions/feature-spec.instructions.md` §coherence-frontmatter。
 * 形式・hash 計算・旧キー正規化は `@ori-ori/coherence` の spec-hash 実装だけを使う (二重実装しない)。
 *
 * Usage:
 *   node scripts/write-spec-hash.js [<kind>/]<id> [--dry-run] [--project-root <dir>]
 *   node scripts/write-spec-hash.js [<kind>/]<id> --accept [--project-root <dir>]
 *   node scripts/write-spec-hash.js [<kind>/]<id> --migrate [--project-root <dir>]
 *   node scripts/write-spec-hash.js --all --migrate [--project-root <dir>]
 *
 *   kind: slice | page | scenario (省略時 slice)
 *
 * モード:
 *   (既定)     derive 直後用。manifest.derives_from から upstream (ref) と hash (file dedupe) を丸ごと
 *              再生成し、last_derived を今日にする。derives_from 外の余剰キーは削除する。
 *              --dry-run は spec.md を書かず、書く予定の upstream / hash を出力する (spec.md 不要)。
 *   --accept   人間が「upstream の変更後も spec はそのままで正しい」と判断した時の re-baseline。
 *              hash を現在値で書き直す (last_derived は保持: 再 derive ではないため)。
 *   --migrate  旧形式 (`file#.*` / `file#anchor` キー、scenario `[{path, hash}]`) を file キーへ正規化する。
 *              記録値は保持し現在 hash で上書きしない。同一 file で記録値が食い違えば書かずに停止する。
 *              --all で `.ori/{slices,pages,scenarios}/*` の spec.md を持つ全対象を処理する。
 *
 * Exit codes:
 *   0  成功 (書き込み済み、または既に最新)
 *   1  対象の失敗 (manifest / spec.md 不在、derives_from が 0 件、upstream file 不在、
 *      --migrate の値食い違い / 記録値なし)。何も成功扱いしない
 *   2  usage error
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { parseDocument } from "yaml";
import {
  SPEC_KINDS,
  type SpecKind,
  computeExpectedCoherence,
  parseDerivesFrom,
  readSpecCoherence,
  writeSpecCoherence,
} from "@ori-ori/coherence";

type Mode = "derive" | "accept" | "migrate";

const KIND_ALIASES: Record<string, SpecKind> = {
  slice: "slices",
  page: "pages",
  scenario: "scenarios",
};

const USAGE = `Usage: write-spec-hash.js [<kind>/]<id> [--dry-run | --accept | --migrate] [--project-root <dir>]
       write-spec-hash.js --all --migrate [--project-root <dir>]
  kind: slice | page | scenario (default: slice)`;

class TargetError extends Error {}

function usageError(msg: string): never {
  console.error(`write-spec-hash: ${msg}\n${USAGE}`);
  process.exit(2);
}

// ---------------------------------------------------------------------------
// args

interface Args {
  target?: string;
  mode: Mode;
  all: boolean;
  dryRun: boolean;
  projectRoot?: string;
}

function parseArgs(argv: string[]): Args {
  const out: Args = { mode: "derive", all: false, dryRun: false };
  const modes: Mode[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "-h" || a === "--help") {
      console.log(USAGE);
      process.exit(0);
    } else if (a === "--accept") modes.push("accept");
    else if (a === "--migrate") modes.push("migrate");
    else if (a === "--all") out.all = true;
    else if (a === "--dry-run") out.dryRun = true;
    else if (a === "--project-root") {
      const v = argv[++i];
      if (v === undefined) usageError("--project-root requires a value");
      out.projectRoot = v;
    } else if (a.startsWith("--project-root=")) out.projectRoot = a.slice("--project-root=".length);
    else if (a.startsWith("-")) usageError(`unknown flag: ${a}`);
    else if (out.target === undefined) out.target = a;
    else usageError(`unexpected argument: ${a}`);
  }
  if (modes.length > 1) usageError("--accept and --migrate are mutually exclusive");
  if (modes[0]) out.mode = modes[0];
  // 全 spec の一括再生成 / 一括承認は drift を黙って消すので --migrate (値保持) に限る
  if (out.all && out.mode !== "migrate") usageError("--all is only allowed with --migrate");
  if (out.all && out.target !== undefined) usageError("--all takes no <kind>/<id>");
  if (!out.all && out.target === undefined) usageError("<kind>/<id> is required");
  if (out.dryRun && out.mode !== "derive") usageError("--dry-run is only allowed in the default mode");
  return out;
}

function parseTarget(target: string): { kind: SpecKind; id: string } {
  const slash = target.indexOf("/");
  if (slash === -1) return { kind: "slices", id: target };
  const kindArg = target.slice(0, slash);
  const id = target.slice(slash + 1);
  const kind = KIND_ALIASES[kindArg] ?? (SPEC_KINDS as readonly string[]).find((k) => k === kindArg);
  if (kind === undefined) usageError(`unknown kind: ${kindArg} (slice | page | scenario)`);
  if (id === "" || id.includes("/")) usageError(`invalid id: ${target}`);
  return { kind: kind as SpecKind, id };
}

function findProjectRoot(start: string): string {
  let d = resolve(start);
  for (;;) {
    if (existsSync(join(d, ".ori"))) return d;
    const parent = dirname(d);
    if (parent === d) break;
    d = parent;
  }
  console.error("write-spec-hash: project root not found (.ori/ missing)");
  process.exit(1);
}

function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// ---------------------------------------------------------------------------
// per-target

interface Result {
  label: string;
  changed: boolean;
  message: string;
}

function processTarget(root: string, kind: SpecKind, id: string, args: Args): Result {
  const label = `${kind}/${id}`;
  const dir = join(root, ".ori", kind, id);
  const manifestPath = join(dir, "manifest.yaml");
  const specPath = join(dir, "spec.md");

  if (!existsSync(manifestPath)) {
    const other = SPEC_KINDS.filter((k) => k !== kind && existsSync(join(root, ".ori", k, id, "manifest.yaml")));
    const hint = other.length > 0 ? ` (found under .ori/${other[0]}/ — pass ${other[0]!.replace(/s$/, "")}/${id})` : "";
    throw new TargetError(`.ori/${label}/manifest.yaml not found${hint}`);
  }
  let refs: ReturnType<typeof parseDerivesFrom>;
  try {
    refs = parseDerivesFrom(readFileSync(manifestPath, "utf8"));
  } catch (e) {
    throw new TargetError(`.ori/${label}/manifest.yaml: invalid YAML: ${(e as Error).message.split("\n")[0]}`);
  }
  if (refs.length === 0) {
    throw new TargetError(`.ori/${label}/manifest.yaml has no derives_from entries (0 upstream — nothing to record)`);
  }

  const expected = computeExpectedCoherence(root, refs);

  if (args.dryRun) {
    if (expected.missing.length > 0) {
      throw new TargetError(`upstream file(s) not found: ${expected.missing.join(", ")}`);
    }
    const lines = [
      `${label}: would write ${expected.upstream.length} upstream ref(s), ${Object.keys(expected.hash).length} hash key(s)`,
      "upstream:",
      ...expected.upstream.map((r) => `  - ${r}`),
      "hash:",
      ...Object.entries(expected.hash).map(([f, h]) => `  ${f}: ${h}`),
    ];
    return { label, changed: false, message: lines.join("\n") };
  }

  if (!existsSync(specPath)) {
    throw new TargetError(`.ori/${label}/spec.md not found (synthesize spec.md before writing coherence)`);
  }
  const text = readFileSync(specPath, "utf8");
  checkFrontmatter(text, label);
  const current = readSpecCoherence(text);
  const notes: string[] = [];
  let hash: Record<string, string>;
  let lastDerived: string | undefined;

  // migrate も含め、derives_from 先の file 欠落は壊れた manifest なので成功扱いしない
  if (expected.missing.length > 0) {
    throw new TargetError(`upstream file(s) not found: ${expected.missing.join(", ")} (fix manifest.derives_from)`);
  }

  if (args.mode === "migrate") {
    if (current.conflicts.length > 0) {
      const detail = current.conflicts
        .map((c) => `${c.file}: ${c.entries.map((e) => `${e.key}=${e.value}`).join(", ")}`)
        .join("; ");
      throw new TargetError(`recorded hash values disagree for the same file — resolve by hand, then re-run: ${detail}`);
    }
    hash = {};
    const unrecorded: string[] = [];
    for (const file of Object.keys(expected.hash)) {
      const v = current.hash[file];
      if (v === undefined) unrecorded.push(file);
      else hash[file] = v;
    }
    if (unrecorded.length > 0) {
      throw new TargetError(
        `no recorded hash for upstream file(s): ${unrecorded.join(", ")} — --migrate keeps recorded values only; ` +
          `review the spec against upstream and use --accept to baseline`,
      );
    }
    lastDerived = current.last_derived;
  } else {
    hash = expected.hash;
    if (args.mode === "accept") {
      lastDerived = current.last_derived;
      for (const [file, h] of Object.entries(hash)) {
        const prev = current.hash[file];
        if (prev !== undefined && prev !== h) notes.push(`accepted ${file}: ${prev} -> ${h}`);
        else if (prev === undefined) notes.push(`accepted ${file}: (none) -> ${h}`);
      }
    } else {
      lastDerived = today();
    }
  }

  const removed = Object.keys(current.hash).filter((f) => !(f in hash));
  if (removed.length > 0) notes.push(`removed key(s) outside derives_from: ${removed.join(", ")}`);
  const removedRefs = current.upstream.filter((r) => !expected.upstream.includes(r));
  if (removedRefs.length > 0) notes.push(`removed upstream ref(s) outside derives_from: ${removedRefs.join(", ")}`);

  const next = writeSpecCoherence(text, {
    source: "derived",
    ...(lastDerived !== undefined ? { last_derived: lastDerived } : {}),
    upstream: expected.upstream,
    hash,
  });
  const changed = next !== text;
  if (changed) writeFileSync(specPath, next);
  const summary = `${label}: ${changed ? "updated" : "unchanged"} (${expected.upstream.length} upstream ref(s), ${Object.keys(hash).length} hash key(s))`;
  return { label, changed, message: [summary, ...notes.map((n) => `  ${n}`)].join("\n") };
}

/** 閉じていない / YAML として壊れた frontmatter に coherence を書き足すと二重 frontmatter や破損の温存になるので止める。 */
function checkFrontmatter(text: string, label: string): void {
  const open = /^---[ \t]*\r?\n/.exec(text);
  if (!open) return;
  const after = text.slice(open[0].length);
  const close = /^---[ \t]*(\r?\n|$)/m.exec(after);
  if (!close) throw new TargetError(`.ori/${label}/spec.md: frontmatter is not closed (missing \`---\`)`);
  const doc = parseDocument(after.slice(0, close.index), { uniqueKeys: false });
  if (doc.errors.length > 0) {
    throw new TargetError(`.ori/${label}/spec.md: invalid frontmatter YAML: ${doc.errors[0]!.message.split("\n")[0]}`);
  }
}

function listAllTargets(root: string): Array<{ kind: SpecKind; id: string }> {
  const out: Array<{ kind: SpecKind; id: string }> = [];
  for (const kind of SPEC_KINDS) {
    const base = join(root, ".ori", kind);
    if (!existsSync(base)) continue;
    for (const d of readdirSync(base, { withFileTypes: true })) {
      if (!d.isDirectory()) continue;
      const dir = join(base, d.name);
      // spec.md の無い対象はまだ derive されていない (migrate するものが無い)
      if (existsSync(join(dir, "manifest.yaml")) && existsSync(join(dir, "spec.md"))) out.push({ kind, id: d.name });
    }
  }
  return out.sort((a, b) => (a.kind + a.id).localeCompare(b.kind + b.id));
}

// ---------------------------------------------------------------------------
// main

const args = parseArgs(process.argv.slice(2));
const root = args.projectRoot !== undefined ? resolve(args.projectRoot) : findProjectRoot(process.cwd());
const targets = args.all ? listAllTargets(root) : [parseTarget(args.target!)];

if (targets.length === 0) {
  console.error("write-spec-hash: no spec.md found under .ori/{slices,pages,scenarios}/ (0 targets)");
  process.exit(1);
}

let updated = 0;
let unchanged = 0;
let failed = 0;
for (const { kind, id } of targets) {
  try {
    const r = processTarget(root, kind, id, args);
    console.log(r.message);
    if (r.changed) updated++;
    else unchanged++;
  } catch (e) {
    if (!(e instanceof TargetError)) throw e;
    failed++;
    console.error(`write-spec-hash: ${kind}/${id}: ${e.message}`);
  }
}

if (!args.dryRun) {
  console.log(`write-spec-hash: ${updated} updated, ${unchanged} unchanged, ${failed} failed`);
}
process.exit(failed > 0 ? 1 : 0);
