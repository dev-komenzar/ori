import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPTS = join(__dirname, "..", "..", "..", "..", ".apm", "skills", "ori-flow", "scripts");

// coherence ブロックの SSoT: .apm/instructions/feature-spec.instructions.md §coherence-frontmatter
const COHERENCE_STUB = "coherence:\n  source: derived\n  upstream: []\n  hash: {}\n";

describe.each([
  ["new-slice.js", "slices"],
  ["new-page.js", "pages"],
])("%s spec stub", (script, kind) => {
  it("writes the coherence block in the SSoT format", async () => {
    const root = await mkdtemp(join(tmpdir(), "ori-new-stub-"));
    try {
      await mkdir(join(root, ".ori"), { recursive: true });
      await execFileAsync("node", [join(SCRIPTS, script), "stub-x"], { cwd: root });
      const spec = await readFile(join(root, ".ori", kind, "stub-x", "spec.md"), "utf8");
      expect(spec).toContain(COHERENCE_STUB);
      expect(spec).toContain("propagation_level: file");
      expect(spec).not.toContain("derives_from");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
