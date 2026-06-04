#!/usr/bin/env node
import { build } from "esbuild"
import { readdirSync, mkdirSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
const SKILLS_SRC = join(ROOT, "packages/skills")
const SKILLS_OUT = join(ROOT, ".apm/skills")

const skillDirs = readdirSync(SKILLS_SRC, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)

for (const skillName of skillDirs) {
  const outName = skillName.replace(/^_/, "")
  const outDir = join(SKILLS_OUT, skillName, "scripts")
  mkdirSync(outDir, { recursive: true })

  await build({
    entryPoints: [join(SKILLS_SRC, skillName, "src/index.ts")],
    outfile: join(outDir, `${outName}.js`),
    bundle: true,
    platform: "node",
    target: "node20",
    format: "esm",
    minify: false,
    banner: { js: "#!/usr/bin/env node" },
  })

  console.log(`✓ ${skillName} → .apm/skills/${skillName}/scripts/${outName}.js`)
}
