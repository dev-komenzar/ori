// ori-finalize: 1 つの slice / page / scenario の status.yaml.dirty[] を空にする。
//
// Usage: clear-dirty.js <id> [--kind slice|page|scenario] [--skip-review-check]
//
// - review gate: .ori/<kind>s/<id>/review.md の最後の verdict が PASS でなければ拒否する。
//   --skip-review-check は人間判断でのバイパス専用。
// - status.yaml は YAML ライブラリで読み書きする。行単位の置換は dirty: の下のブロック列を
//   残して YAML を壊すため使わない (GitHub #133 / ori-6dr5)。
// - 書き戻す前に結果を parse し直し、不正なら書き込まずに非 0 で終わる。
import { access, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { isMap, parseDocument } from "yaml";

type Kind = "slice" | "page" | "scenario";
const KINDS: readonly Kind[] = ["slice", "page", "scenario"];
const kindDir = (k: Kind): string => `${k}s`;

function fail(lines: string[]): never {
  for (const l of lines) console.error(l);
  process.exit(1);
}

function usage(): never {
  fail([
    "Usage: clear-dirty.js <id> [--kind slice|page|scenario] [--skip-review-check]",
    "  kind を省略すると .ori/{slices,pages,scenarios}/<id>/status.yaml の存在から決める",
  ]);
}

async function exists(p: string): Promise<boolean> {
  try { await access(p); return true; } catch { return false; }
}

async function isDir(p: string): Promise<boolean> {
  try { return (await stat(p)).isDirectory(); } catch { return false; }
}

// skill dir やサブ dir から実行されても .ori/ を持つ project root を上方探索で解決する。
// git repo の境界で止め、見つからなければ cwd を返す (ori-flow の findProjectRoot と同じ規則)。
async function findProjectRoot(start: string = process.cwd()): Promise<string> {
  let d = start;
  for (;;) {
    if (await isDir(join(d, ".ori"))) return d;
    const parent = dirname(d);
    if (parent === d || (await exists(join(d, ".git")))) return start;
    d = parent;
  }
}

function parseArgs(argv: string[]): { id: string; kind: Kind | null; skipReview: boolean } {
  let id: string | null = null;
  let kind: Kind | null = null;
  let skipReview = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--skip-review-check") {
      skipReview = true;
    } else if (a === "--kind" || a.startsWith("--kind=")) {
      const v = a.includes("=") ? a.slice("--kind=".length) : argv[++i];
      if (!v || !KINDS.includes(v as Kind)) fail([`ERROR: --kind must be one of: ${KINDS.join(", ")}`]);
      kind = v as Kind;
    } else if (a.startsWith("-")) {
      usage();
    } else if (id === null) {
      id = a;
    } else {
      usage();
    }
  }
  if (!id) usage();
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) fail([`ERROR: invalid id "${id}" (must be lower-kebab-case)`]);
  return { id, kind, skipReview };
}

async function resolveKind(root: string, id: string, kind: Kind | null): Promise<Kind> {
  if (kind) {
    const rel = `.ori/${kindDir(kind)}/${id}/status.yaml`;
    if (!(await exists(join(root, rel)))) fail([`ERROR: ${rel} not found`]);
    return kind;
  }
  const found: Kind[] = [];
  for (const k of KINDS) {
    if (await exists(join(root, ".ori", kindDir(k), id, "status.yaml"))) found.push(k);
  }
  if (found.length === 0) {
    fail([`ERROR: status.yaml not found for "${id}" (looked in .ori/{slices,pages,scenarios}/${id}/)`]);
  }
  if (found.length > 1) {
    fail([`ERROR: "${id}" exists as ${found.join(" and ")}; specify --kind ${found.join("|")}`]);
  }
  return found[0]!;
}

async function reviewGate(root: string, kind: Kind, id: string): Promise<void> {
  const rel = `.ori/${kindDir(kind)}/${id}/review.md`;
  const abs = join(root, rel);
  const bypass = [
    "   If you absolutely need to bypass this guard, use:",
    `     clear-dirty.js ${id} --kind ${kind} --skip-review-check`,
  ];
  if (!(await exists(abs))) {
    fail([
      `❌ Cannot clear dirty: ${rel} does not exist`,
      `   Run /ori-review ${id} first (or /ori-flow ${id} to run all phases).`,
      ...bypass,
    ]);
  }
  const body = await readFile(abs, "utf8");
  // 行内だけで照合する (\s だと "verdict:\nPASS" のように改行をまたいで通ってしまう。旧 grep -oP は行単位)
  const verdicts = [...body.matchAll(/verdict[ \t]*[=:][ \t]*(PASS|NEEDS_FIX|REJECT)/g)].map((m) => m[1]);
  const verdict = verdicts.at(-1);
  if (!verdict) {
    fail([`❌ Cannot clear dirty: no verdict found in ${rel}`, `   Run /ori-review ${id} to complete review.`]);
  }
  if (verdict !== "PASS") {
    fail([
      `❌ Cannot clear dirty: review verdict is '${verdict}', must be 'PASS'`,
      `   Address review findings, re-run /ori-review ${id}, then finalize.`,
    ]);
  }
  console.log(`✅ review gate: verdict=PASS confirmed for ${kind} ${id}`);
}

function yamlErrorLines(rel: string, errors: { message: string; linePos?: [{ line: number; col: number }, ...unknown[]] }[]): string[] {
  return errors.map((e) => {
    const pos = e.linePos?.[0];
    const loc = pos ? `${rel}:${pos.line}:${pos.col}` : rel;
    return `  ${loc}  ${e.message.split("\n")[0]}`;
  });
}

async function main(): Promise<void> {
  const { id, kind: kindArg, skipReview } = parseArgs(process.argv.slice(2));
  const root = await findProjectRoot();
  const kind = await resolveKind(root, id, kindArg);
  const rel = `.ori/${kindDir(kind)}/${id}/status.yaml`;
  const statusPath = join(root, rel);

  if (!skipReview) await reviewGate(root, kind, id);

  const raw = await readFile(statusPath, "utf8");
  const doc = parseDocument(raw);
  if (doc.errors.length > 0) {
    fail([
      `❌ ${rel} is not valid YAML; dirty was not cleared:`,
      ...yamlErrorLines(rel, doc.errors),
      "   Fix the file by hand (e.g. remove list items left under `dirty: []`), then re-run.",
    ]);
  }
  if (!isMap(doc.contents)) {
    fail([`❌ ${rel}: top level must be a mapping; dirty was not cleared`]);
  }

  const before = doc.get("dirty");
  const count = before && typeof before === "object" && "items" in before ? (before.items as unknown[]).length : 0;
  doc.set("dirty", doc.createNode([]));
  // 無関係な行の再整形を抑える: 長い文字列を折り返さない / flow collection を `[a, b]` のまま出す
  const out = doc.toString({ lineWidth: 0, flowCollectionPadding: false });

  // 書き込む前に結果が YAML として正しく、dirty が空配列になっていることを確かめる
  const check = parseDocument(out);
  const checked = check.errors.length === 0 ? (check.toJS() as Record<string, unknown> | null) : null;
  if (!checked || !Array.isArray(checked.dirty) || checked.dirty.length !== 0) {
    fail([
      `❌ internal error: rewritten ${rel} did not validate; file left unchanged`,
      ...yamlErrorLines(rel, check.errors),
    ]);
  }

  // 内容は上で検証済みなのでその場で書き戻す (tmp+rename だと permission が変わり、失敗時に tmp が残る)
  await writeFile(statusPath, out, "utf8");
  console.log(`cleared ${count} dirty mark(s) for ${kind} ${id}`);
}

await main();
