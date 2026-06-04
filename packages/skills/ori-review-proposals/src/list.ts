import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { consola } from "consola";

const args = process.argv.slice(2);
const check = args.includes("--check");

const cwd = process.cwd();
const proposalsDir = join(cwd, ".ori/proposals");

let files: string[] = [];
try {
  await stat(proposalsDir);
  const entries = await readdir(proposalsDir, { withFileTypes: true });
  files = entries
    .filter((e) => e.isFile() && e.name.endsWith(".md"))
    .map((e) => e.name)
    .sort();
} catch {
  consola.info("/ori-review-proposals: no .ori/proposals/ directory found");
  process.exit(0);
}

if (files.length === 0) {
  consola.success("No pending proposals");
  process.exit(0);
}

consola.info(`${files.length} pending proposal(s):`);
for (const f of files) {
  consola.log(`  - ${f}`);
}

if (check) {
  consola.error(`${files.length} unresolved proposal(s) found`);
  process.exit(1);
}
