import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..", "..");
const COPY_SCRIPT = join(
  REPO_ROOT,
  ".apm",
  "skills",
  "ori-arch",
  "scripts",
  "copy-template.sh",
);
const TEMPLATES_DIR = join(REPO_ROOT, "packages", "templates");

async function runCopy(args: string[], dest: string) {
  return execFileAsync(
    "bash",
    [COPY_SCRIPT, ...args, "--dest", dest, "--templates-dir", TEMPLATES_DIR],
    { env: { ...process.env, ORI_TEMPLATES_DIR: TEMPLATES_DIR } },
  );
}

describe("ori-arch copy-template.sh placeholder behavior (ori-ou6)", () => {
  it("emits an eslint.config.ori.js placeholder when scaffolding fresh", async () => {
    const dest = await mkdtemp(join(tmpdir(), "ori-scaffold-"));
    try {
      await runCopy(["--template", "ddd-vsa-hex-typescript"], dest);

      const placeholder = join(dest, "eslint.config.ori.js");
      const body = await readFile(placeholder, "utf8");
      // The placeholder must be a valid ES module that exposes an iterable
      // config array — eslint flat config consumers spread it. An empty
      // array keeps `pnpm lint` from crashing before `ori arch export` runs.
      expect(body).toMatch(/export default\s*\[/);
      // The header must point users at the regeneration command so they
      // know the placeholder is intentional and replaceable.
      expect(body).toMatch(/ori arch export/);
    } finally {
      await rm(dest, { recursive: true, force: true });
    }
  });

  it("does not overwrite an existing eslint.config.ori.js", async () => {
    const dest = await mkdtemp(join(tmpdir(), "ori-scaffold-"));
    try {
      // Seed the destination as if the user (or a previous `ori arch export`
      // run) already wrote a real arch config. The scaffold must respect it.
      await runCopy(["--template", "ddd-vsa-hex-typescript"], dest);
      const placeholder = join(dest, "eslint.config.ori.js");
      const realConfig = "export default [{ rules: { 'no-debugger': 'error' } }];\n";
      await writeFile(placeholder, realConfig, "utf8");

      await runCopy(["--template", "ddd-vsa-hex-typescript", "--force"], dest);

      const body = await readFile(placeholder, "utf8");
      expect(body).toBe(realConfig);
    } finally {
      await rm(dest, { recursive: true, force: true });
    }
  });

});
