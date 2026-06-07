#!/usr/bin/env node
import { build, context } from "esbuild"
import { readdirSync, mkdirSync } from "fs"
import { join, dirname, basename } from "path"
import { fileURLToPath } from "url"

const watch = process.argv.includes("--watch")

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
const SKILLS_SRC = join(ROOT, "packages/skills")
const SKILLS_OUT = join(ROOT, ".apm/skills")

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
    const outFile = join(outDir, `${outName}.js`)

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
              b.onEnd(() =>
                console.log(
                  `✓ ${skillName}/src/${outName}.ts → .apm/skills/${skillName}/scripts/${outName}.js`
                )
              )
            },
          },
        ],
      })
      await ctx.watch()
    } else {
      await build(opts)
      console.log(`✓ ${skillName}/src/${outName}.ts → .apm/skills/${skillName}/scripts/${outName}.js`)
    }
  }
}

if (watch) {
  console.log("👀 watching packages/skills/**/src/ ...")
}
