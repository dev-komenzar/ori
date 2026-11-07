/**
 * ori-doctor: spec の coherence.hash と upstream file の実 hash を突き合わせる (ori-0eh.5)。
 *
 * 形式・hash 計算・旧キー正規化は @ori-ori/coherence の spec-hash を使い、ここでは再実装しない。
 * 形式の SSoT は `.apm/instructions/feature-spec.instructions.md` §coherence-frontmatter。
 *
 * Usage: check-hash-consistency.js [--root <dir>] [<kind>/<id> | <id>]...
 *   対象省略時は .ori/{slices,pages,scenarios}/*\/spec.md の全件。
 *   exit code: 0..63 = issue 件数 (63 で頭打ち) / 64 = 引数・環境の誤り (不明 option・対象 id なし・root 不明)。
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  SPEC_KINDS,
  computeFileHash,
  findSpecTarget,
  parseDerivesFrom,
  readSpecCoherence,
  resolveUpstreamPath,
  type SpecKind,
  type SpecTarget,
} from "@ori-ori/coherence";

/** 引数・環境の誤り (sysexits EX_USAGE)。issue 件数 (0..63) と区別するため件数側を 63 で頭打ちにする。 */
const EXIT_USAGE = 64;
const MAX_ISSUE_EXIT = 63;

const args = process.argv.slice(2);
let root = process.cwd();
const targetArgs: string[] = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i]!;
  if (a === "--root") {
    root = args[++i] ?? root;
  } else if (a.startsWith("--")) {
    console.error(`ERROR: unknown option: ${a}`);
    process.exit(EXIT_USAGE);
  } else {
    targetArgs.push(a);
  }
}

function listTargets(): SpecTarget[] {
  const out: SpecTarget[] = [];
  for (const kind of SPEC_KINDS) {
    const base = join(root, ".ori", kind);
    if (!existsSync(base)) continue;
    for (const d of readdirSync(base, { withFileTypes: true })) {
      if (!d.isDirectory()) continue;
      const dir = join(base, d.name);
      out.push({ kind, id: d.name, dir, manifestPath: join(dir, "manifest.yaml"), specPath: join(dir, "spec.md") });
    }
  }
  return out;
}

function resolveTargets(): SpecTarget[] {
  if (targetArgs.length === 0) return listTargets();
  const out: SpecTarget[] = [];
  for (const arg of targetArgs) {
    const m = /^(slices|pages|scenarios)\/([^/]+)$/.exec(arg);
    let t: SpecTarget | undefined;
    if (m) {
      const kind = m[1] as SpecKind;
      const dir = join(root, ".ori", kind, m[2]!);
      if (existsSync(dir)) t = { kind, id: m[2]!, dir, manifestPath: join(dir, "manifest.yaml"), specPath: join(dir, "spec.md") };
    } else if (!arg.includes("/")) {
      t = findSpecTarget(root, arg);
    }
    if (!t) {
      console.error(`ERROR: 対象が見つかりません: ${arg} (.ori/{slices,pages,scenarios}/<id>/ の <kind>/<id> で指定)`);
      process.exit(EXIT_USAGE);
    }
    out.push(t);
  }
  return out;
}

let issues = 0;
const warn = (label: string, msg: string, fix?: string): void => {
  issues++;
  console.log(`  WARN  ${label}: ${msg}`);
  if (fix) console.log(`        fix: ${fix}`);
};
const info = (label: string, msg: string): void => console.log(`  INFO  ${label}: ${msg}`);

const SINGULAR: Record<SpecKind, string> = { slices: "slice", pages: "page", scenarios: "scenario" };
/** write-spec-hash の対象指定 (`<slice|page|scenario>/<id>`)。 */
const writerTarget = (t: SpecTarget): string => `${SINGULAR[t.kind]}/${t.id}`;
const REDERIVE = "/ori-flow <id> で再 derive (hash は ori-derive の writer が生成する。手書きしない)";
/** drift の fix: 原則は再 derive。upstream 変更が spec に影響しないと人間が判断した場合のみ --accept。 */
const driftFix = (t: SpecTarget): string =>
  `${REDERIVE}。再 derive 不要と人間が判断した場合のみ node <ori-derive skill>/scripts/write-spec-hash.js ${writerTarget(t)} --accept (LLM が drift を消す目的で自発的に使わない)`;

for (const t of resolveTargets()) {
  const label = `${t.kind}/${t.id}`;
  if (!existsSync(t.specPath)) {
    if (targetArgs.length > 0) warn(label, "spec.md がありません");
    continue;
  }

  let refs: ReturnType<typeof parseDerivesFrom> = [];
  if (existsSync(t.manifestPath)) {
    try {
      refs = parseDerivesFrom(readFileSync(t.manifestPath, "utf8"));
    } catch (e) {
      warn(label, `manifest.yaml を読めません (${(e as Error).message.split("\n")[0]})`);
      continue;
    }
  }

  let coh;
  try {
    coh = readSpecCoherence(readFileSync(t.specPath, "utf8"));
  } catch (e) {
    warn(label, `spec.md の frontmatter を読めません (${(e as Error).message.split("\n")[0]})`);
    continue;
  }

  const expected = new Set(refs.map((r) => r.file));
  const recorded = Object.keys(coh.hash);

  if (expected.size > 0 && recorded.length === 0) {
    const why = coh.source === "derived" ? "coherence.source: derived なのに " : "";
    warn(label, `${why}coherence.hash が未記録です (derives_from ${expected.size} file)`, REDERIVE);
  }

  // 記録された file の存在 + drift
  for (const file of recorded) {
    const abs = resolveUpstreamPath(root, file);
    if (!existsSync(abs)) {
      warn(label, `記録された file が存在しません: ${file}`, "domain 文書の移動・削除なら manifest.derives_from と合わせて更新し再 derive");
      continue;
    }
    const actual = computeFileHash(abs);
    const rec = (coh.hash[file] ?? "").trim().toLowerCase();
    if (rec !== actual) {
      warn(label, `drift: ${file} 記録 ${coh.hash[file]} ≠ 現在 ${actual}`, driftFix(t));
    }
  }

  // キー集合の差分 (hash が丸ごと未記録のときは上で報告済み)
  if (recorded.length > 0) {
    for (const file of expected) {
      if (recorded.includes(file)) continue;
      if (!existsSync(resolveUpstreamPath(root, file))) {
        warn(label, `derives_from の file が存在しません: ${file}`, "manifest.derives_from を実在 path に直す");
      } else {
        warn(label, `hash 欠落: ${file} が derives_from にあるが coherence.hash に無い`, REDERIVE);
      }
    }
    for (const file of recorded) {
      if (!expected.has(file)) {
        warn(label, `hash 余剰: ${file} が coherence.hash にあるが derives_from に無い`, REDERIVE);
      }
    }
  } else {
    for (const file of expected) {
      if (!existsSync(resolveUpstreamPath(root, file))) {
        warn(label, `derives_from の file が存在しません: ${file}`, "manifest.derives_from を実在 path に直す");
      }
    }
  }

  // 形式のみの問題は issue にしない
  if (coh.legacy) {
    info(label, `旧形式の coherence を検出 (値は正規化して比較済み)。node <ori-derive skill>/scripts/write-spec-hash.js ${writerTarget(t)} --migrate (全件は --all --migrate) で新形式へ移行できます`);
  }
  for (const c of coh.conflicts) {
    info(label, `旧キーが同一 file ${c.file} で別の hash を記録 (${c.entries.map((e) => `${e.key}=${e.value}`).join(", ")}); 先頭の値で比較`);
  }
}

console.log(`  hash consistency: ${issues} issue(s)`);
// exit code は件数 (run-checks.sh が合算)。引数誤りの EXIT_USAGE と衝突しないよう 63 で頭打ち
process.exit(Math.min(issues, MAX_ISSUE_EXIT));
