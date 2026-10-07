#!/usr/bin/env node
import { build, context } from "esbuild"
import { readdirSync, mkdirSync, existsSync, copyFileSync, chmodSync } from "fs"
import { join, dirname, basename } from "path"
import { fileURLToPath } from "url"

const watch = process.argv.includes("--watch")

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
const SKILLS_SRC = join(ROOT, "packages/skills")
const SKILLS_OUT = join(ROOT, ".apm/skills")

// 複数 skill が使う script は skill ごとに複製出力する。APM は skill folder を copytree するだけで、
// Agent Skills 仕様は skill root 相対 (`scripts/x`) の参照しか持たないため、他 skill の scripts/ は参照しない。
// entry は packages/skills-shared/src からの相対。src を指定すると repo root 相対で既存の source を使う
// (source の持ち主 skill へは通常どおり出力され、ここでは他 skill への複製だけを宣言する)。
// assets は skill root 相対で、script が自分の位置から読むファイル (持ち主 skill から同じ相対 path へ複製)。
const SHARED_SRC = join(ROOT, "packages/skills-shared/src")
const SHARED_ENTRIES = [
  {
    entry: "scenario-status.ts",
    src: "packages/skills/ori-flow/src/scenario-status.ts",
    skills: ["ori-derive", "ori-finalize", "ori-generate", "ori-review"],
  },
  {
    entry: "new-scenario.ts",
    src: "packages/skills/ori-flow/src/new-scenario.ts",
    // new-scenario.js は ../templates/ を読み、無いと空 manifest を黙って書くので template も複製する
    assets: { from: "ori-flow", paths: ["templates/scenario-manifest.yaml.tpl"] },
    skills: ["ori-architect", "ori-bootstrap", "ori-doctor", "ori-feature-status"],
  },
  { entry: "lint.ts", src: "packages/skills/ori-doctor/src/lint.ts", skills: ["ori-architect"] },
  {
    entry: "check-scenario-exists.sh",
    src: ".apm/skills/ori-generate/scripts/check-scenario-exists.sh",
    skills: ["ori-derive"],
  },
  {
    entry: "testids.ts",
    skills: [
      "ori-bug",
      "ori-ddd-11b-ui-grouping",
      "ori-derive",
      "ori-doctor",
      "ori-generate",
      "ori-impl-green",
      "ori-review",
      "ori-test-red",
    ],
  },
  // bash script は build せずそのまま複製する (実行権限も付ける)
  { entry: "check-page-testids.sh", skills: ["ori-doctor", "ori-generate"] },
]

// 出力先の重複 (skill 固有 entry と共有 entry が同名) は黙って上書きせず止める
const outputs = new Map()

async function buildEntry(entry, outFile, label) {
  if (outputs.has(outFile)) {
    throw new Error(`build-skills: ${outFile} is produced by both ${outputs.get(outFile)} and ${entry}`)
  }
  outputs.set(outFile, entry)
  const opts = {
    entryPoints: [entry],
    outfile: outFile,
    bundle: true,
    platform: "node",
    target: "node20",
    format: "esm",
    minify: false,
    banner: {
      js: [
        "#!/usr/bin/env node",
        // Allow bundled CJS deps (e.g. `yaml`) to use dynamic require for node built-ins.
        "import { createRequire as __ori_createRequire } from 'node:module';",
        "const require = __ori_createRequire(import.meta.url);",
      ].join("\n"),
    },
  }

  if (watch) {
    const ctx = await context({
      ...opts,
      plugins: [
        {
          name: "log",
          setup(b) {
            b.onEnd(() => console.log(`✓ ${label}`))
          },
        },
      ],
    })
    await ctx.watch()
  } else {
    await build(opts)
    console.log(`✓ ${label}`)
  }
}

const skillDirs = readdirSync(SKILLS_SRC, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)

for (const skillName of skillDirs) {
  const srcDir = join(SKILLS_SRC, skillName, "src")
  const outDir = join(SKILLS_OUT, skillName, "scripts")
  mkdirSync(outDir, { recursive: true })

  let entries
  try {
    entries = readdirSync(srcDir, { withFileTypes: true })
      .filter((f) => f.isFile() && f.name.endsWith(".ts"))
      .map((f) => join(srcDir, f.name))
  } catch {
    console.warn(`⚠ ${skillName}: src/ not found, skipping`)
    continue
  }

  if (entries.length === 0) {
    console.warn(`⚠ ${skillName}: no .ts files in src/, skipping`)
    continue
  }

  for (const entry of entries) {
    const outName = basename(entry, ".ts")
    await buildEntry(
      entry,
      join(outDir, `${outName}.js`),
      `${skillName}/src/${outName}.ts → .apm/skills/${skillName}/scripts/${outName}.js`
    )
  }
}

function copyOnce(srcFile, outFile, label) {
  if (outputs.has(outFile)) {
    throw new Error(`build-skills: ${outFile} is produced by both ${outputs.get(outFile)} and ${srcFile}`)
  }
  outputs.set(outFile, srcFile)
  mkdirSync(dirname(outFile), { recursive: true })
  copyFileSync(srcFile, outFile)
  console.log(`✓ ${label}`)
}

for (const { entry, src, assets, skills } of SHARED_ENTRIES) {
  const outName = basename(entry, ".ts")
  const srcFile = src ? join(ROOT, src) : join(SHARED_SRC, entry)
  const srcLabel = src ?? `skills-shared/src/${entry}`
  for (const skillName of skills) {
    if (!existsSync(join(SKILLS_OUT, skillName, "SKILL.md"))) {
      throw new Error(`build-skills: SHARED_ENTRIES target skill not found: .apm/skills/${skillName}/SKILL.md`)
    }
    const outDir = join(SKILLS_OUT, skillName, "scripts")
    mkdirSync(outDir, { recursive: true })
    if (assets && skillName === assets.from) {
      throw new Error(`build-skills: SHARED_ENTRIES ${entry}: assets.from (${assets.from}) must not be listed in skills`)
    }
    for (const asset of assets?.paths ?? []) {
      copyOnce(
        join(SKILLS_OUT, assets.from, asset),
        join(SKILLS_OUT, skillName, asset),
        `.apm/skills/${assets.from}/${asset} → .apm/skills/${skillName}/${asset}`
      )
    }
    if (entry.endsWith(".sh")) {
      const outFile = join(outDir, entry)
      copyOnce(srcFile, outFile, `${srcLabel} → .apm/skills/${skillName}/scripts/${entry}`)
      chmodSync(outFile, 0o755)
      continue
    }
    await buildEntry(srcFile, join(outDir, `${outName}.js`), `${srcLabel} → .apm/skills/${skillName}/scripts/${outName}.js`)
  }
}

if (watch) {
  console.log("👀 watching packages/skills/**/src/ and packages/skills-shared/src/ ...")
}
