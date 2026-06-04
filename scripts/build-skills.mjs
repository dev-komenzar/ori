#!/usr/bin/env node
import { build } from "esbuild"
import { readdirSync, mkdirSync } from "fs"
import { join, dirname, basename } from "path"
import { fileURLToPath } from "url"

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

    await build({
      entryPoints: [entry],
      outfile: outFile,
      bundle: true,
      platform: "node",
      target: "node20",
      format: "esm",
      minify: false,
      banner: { js: "#!/usr/bin/env node" },
    })

    console.log(`✓ ${skillName}/src/${outName}.ts → .apm/skills/${skillName}/scripts/${outName}.js`)
  }
}
