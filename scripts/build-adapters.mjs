#!/usr/bin/env node
import { build, context } from "esbuild"
import { existsSync, readdirSync, mkdirSync, cpSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"

const watch = process.argv.includes("--watch")

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
const ADAPTERS_SRC = join(ROOT, "packages/arch-adapters")
const ADAPTERS_OUT = join(ROOT, ".apm/skills/ori-arch/adapters")

const adapterDirs = readdirSync(ADAPTERS_SRC, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)

function copyTemplates(adapterName) {
  const srcTemplatesDir = join(ADAPTERS_SRC, adapterName, "templates")
  if (!existsSync(srcTemplatesDir)) return
  const outTemplatesDir = join(ADAPTERS_OUT, adapterName, "templates")
  cpSync(srcTemplatesDir, outTemplatesDir, { recursive: true })
}

for (const adapterName of adapterDirs) {
  const entry = join(ADAPTERS_SRC, adapterName, "src/index.ts")
  if (!existsSync(entry)) {
    console.warn(`⚠ ${adapterName}: src/index.ts not found, skipping`)
    continue
  }

  const outDir = join(ADAPTERS_OUT, adapterName)
  mkdirSync(outDir, { recursive: true })
  const outFile = join(outDir, "index.js")

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
        // Allow bundled CJS deps to use dynamic require for node built-ins.
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
            b.onEnd(() => {
              copyTemplates(adapterName)
              console.log(
                `✓ arch-adapters/${adapterName}/src/index.ts → .apm/skills/ori-arch/adapters/${adapterName}/index.js`
              )
            })
          },
        },
      ],
    })
    await ctx.watch()
  } else {
    await build(opts)
    copyTemplates(adapterName)
    console.log(
      `✓ arch-adapters/${adapterName}/src/index.ts → .apm/skills/ori-arch/adapters/${adapterName}/index.js`
    )
  }
}
