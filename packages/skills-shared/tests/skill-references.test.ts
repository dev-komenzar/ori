import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// SKILL.md / instructions の参照が consumer でも解決できることを検査する (ori-qh3)。
// consumer に .apm/ は無い。読む参照は相対 markdown link (APM が install 時に書き換える)、
// 実行する script は skill root 相対 (build-skills が各 skill の scripts/ に複製する) で書く。
// 規約: .apm/instructions/ori-conventions.instructions.md
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..", "..");
const SKILLS_DIR = join(REPO_ROOT, ".apm", "skills");
const INSTRUCTIONS_DIR = join(REPO_ROOT, ".apm", "instructions");

// 既知の未解決参照。参照先の決定が内容判断になるため別 issue で扱う
const ALLOWED_APM_PATHS = new Set([
  // ori-kto: 削除済みの architecture.md.tpl "Test Contract" を参照している
  ".apm/skills/ori-test-red/SKILL.md: .apm/skills/ori-architect/patterns/ddd-vsa-hex/stacks/typescript-tauri/architecture.md.tpl",
]);

function walkMd(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return walkMd(p);
    return e.isFile() && e.name.endsWith(".md") ? [p] : [];
  });
}

const mdFiles = [...walkMd(SKILLS_DIR), ...walkMd(INSTRUCTIONS_DIR)];
const rel = (p: string): string => relative(REPO_ROOT, p);

const LINK = /\[[^\]\n]*\]\(([^)\s]+)\)/g;
// fenced block / code span 内の link は生成物の例 (.ori/ 側の相対 link) なので実在検査から外す
const stripCode = (md: string): string => md.replace(/^\s*```[\s\S]*?^\s*```/gm, "").replace(/`[^`\n]*`/g, "");
const APM_PATH = /\.apm\/(?:skills|instructions|agents)\/[^\s`)"'|]+/g;
const SCRIPT_CMD = /\b(?:node|bash) (?:\.\/)?scripts\/([\w.-]+)/g;

describe("skill / instructions references", () => {
  it("does not reference .apm/ paths (consumer has no .apm/)", () => {
    const found = mdFiles.flatMap((f) =>
      [...readFileSync(f, "utf8").matchAll(APM_PATH)].map((m) => `${rel(f)}: ${m[0]}`),
    );
    expect(found.filter((x) => !ALLOWED_APM_PATHS.has(x))).toEqual([]);
  });

  it("relative markdown links point to existing files or dirs", () => {
    const broken = mdFiles.flatMap((f) =>
      [...stripCode(readFileSync(f, "utf8")).matchAll(LINK)]
        .map((m) => m[1]!)
        .filter((t) => !/^([a-z][a-z0-9+.-]*:|#|\/)/i.test(t))
        .filter((t) => !t.includes("<") && !t.includes("{{"))
        .filter((t) => !existsSync(join(dirname(f), t.split(/[#?]/)[0]!)))
        .map((t) => `${rel(f)}: ${t}`),
    );
    expect(broken).toEqual([]);
  });

  // APM は dir への link を書き換えないので、dir link は兄弟 skill 内 (consumer でも兄弟配置) に限る
  it("directory links stay within sibling skills", () => {
    const outside = mdFiles.flatMap((f) =>
      [...stripCode(readFileSync(f, "utf8")).matchAll(LINK)]
        .map((m) => m[1]!.split(/[#?]/)[0]!)
        .filter((t) => !/^([a-z][a-z0-9+.-]*:|\/)/i.test(t) && t !== "")
        .filter((t) => {
          const abs = join(dirname(f), t);
          return existsSync(abs) && statSync(abs).isDirectory() && !abs.startsWith(SKILLS_DIR);
        })
        .map((t) => `${rel(f)}: ${t}`),
    );
    expect(outside).toEqual([]);
  });

  it("scripts/<x> invoked by a skill's md files exist in the skill's own scripts/", () => {
    const missing = readdirSync(SKILLS_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory() && existsSync(join(SKILLS_DIR, d.name, "SKILL.md")))
      .flatMap((d) =>
        walkMd(join(SKILLS_DIR, d.name)).flatMap((md) =>
          [...readFileSync(md, "utf8").matchAll(SCRIPT_CMD)]
            .map((m) => m[1]!)
            .filter((x) => !existsSync(join(SKILLS_DIR, d.name, "scripts", x)))
            .map((x) => `${rel(md)}: scripts/${x}`),
        ),
      );
    expect(missing).toEqual([]);
  });
});
