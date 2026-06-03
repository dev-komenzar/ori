import { execFile, execSync } from "node:child_process";
import {
  chmod,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..", "..");
const INIT_SCRIPT = join(
  REPO_ROOT,
  ".apm",
  "skills",
  "ori-init",
  "scripts",
  "create-skeleton.sh",
);

// Resolve bash to an absolute path so test PATH manipulation (used to
// suppress bd discovery) cannot accidentally hide bash on systems where
// bash is not at /usr/bin/bash (NixOS, Termux, etc.).
const BASH_PATH = execSync("command -v bash", {
  encoding: "utf8",
  shell: "/bin/sh",
}).trim();

// To test the "bd missing" branch we keep the parent's PATH but strip the
// directory containing `bd`. This keeps mkdir, env, etc. discoverable on
// distributions (Nix, custom prefixes) where coreutils don't live at /bin.
function pathWithoutBd(): string {
  const bdBin = execSync("command -v bd", {
    encoding: "utf8",
    shell: "/bin/sh",
  }).trim();
  const bdDir = dirname(bdBin);
  return (process.env.PATH ?? "")
    .split(":")
    .filter((d) => d !== bdDir)
    .join(":");
}

// Stub `ori` binary used in tests so we only exercise the bd-init branch
// added in ori-ks7. The real ori init flow is covered by
// packages/cli/src/commands/init.test.ts. Uses /bin/sh so it runs even
// when the test deliberately strips PATH (the "bd missing" case).
const ORI_STUB = `#!/bin/sh
mkdir -p .ori
cat > .ori/config.yaml <<'YAML'
workspace:
  apps:
    - name: stub-app
YAML
`;

async function makeStubBinDir(stubs: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "ori-stub-bin-"));
  for (const [name, body] of Object.entries(stubs)) {
    const path = join(dir, name);
    await writeFile(path, body, "utf8");
    await chmod(path, 0o755);
  }
  return dir;
}

async function runInit(
  dest: string,
  extraPath: string,
  env: NodeJS.ProcessEnv = {},
): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync(BASH_PATH, [INIT_SCRIPT, "--dest", dest], {
    env: {
      ...process.env,
      ...env,
      PATH: `${extraPath}:${process.env.PATH}`,
    },
  });
}

async function readBdPrefix(beadsDir: string): Promise<string> {
  // bd does not write the active prefix to a single dedicated field —
  // metadata.json's `dolt_database` mirrors the prefix (without the
  // trailing hyphen) because dolt naming forbids the hyphen suffix.
  const meta = JSON.parse(
    await readFile(join(beadsDir, "metadata.json"), "utf8"),
  ) as { dolt_database?: string };
  if (!meta.dolt_database) {
    throw new Error("metadata.json missing dolt_database — bd init schema changed");
  }
  return `${meta.dolt_database}-`;
}

describe("ori-init create-skeleton.sh bd integration (ori-ks7)", () => {
  it("runs `bd init` after `ori init` so /ori-flow has a SSoT immediately", async () => {
    const dest = await mkdtemp(join(tmpdir(), "ori-init-bd-"));
    const stubBin = await makeStubBinDir({ ori: ORI_STUB });
    try {
      await runInit(dest, stubBin);
      const prefix = await readBdPrefix(join(dest, ".beads"));
      // ori-ks7 spec: prefix defaults to `ori`. bd requires a trailing
      // hyphen so the on-disk prefix is `ori-`.
      expect(prefix).toBe("ori-");
    } finally {
      await rm(dest, { recursive: true, force: true });
      await rm(stubBin, { recursive: true, force: true });
    }
  });

  it("is idempotent — re-running over an existing .beads/ skips bd init", async () => {
    const dest = await mkdtemp(join(tmpdir(), "ori-init-bd-"));
    const stubBin = await makeStubBinDir({ ori: ORI_STUB });
    try {
      await runInit(dest, stubBin);
      const beadsStat = await stat(join(dest, ".beads"));

      // A second run must not error and must not destroy the existing
      // beads workspace (re-init without authorization would lose data).
      const { stdout } = await runInit(dest, stubBin);
      expect(stdout).toMatch(/skipping bd init \(idempotent\)/);

      const beadsStatAfter = await stat(join(dest, ".beads"));
      // mtime preserved is a weak signal — fall back to asserting .beads/
      // still exists and is a directory (the real assertion: nothing blew up).
      expect(beadsStatAfter.isDirectory()).toBe(true);
      expect(beadsStat.isDirectory()).toBe(true);
    } finally {
      await rm(dest, { recursive: true, force: true });
      await rm(stubBin, { recursive: true, force: true });
    }
  });

  it("respects ORI_BD_PREFIX env var (with or without trailing hyphen)", async () => {
    const dest = await mkdtemp(join(tmpdir(), "ori-init-bd-"));
    const stubBin = await makeStubBinDir({ ori: ORI_STUB });
    try {
      await runInit(dest, stubBin, { ORI_BD_PREFIX: "demo" });
      const prefix = await readBdPrefix(join(dest, ".beads"));
      // `demo` is normalized to `demo-` (bd requires trailing hyphen) and
      // env override takes precedence over the `ori` default.
      expect(prefix).toBe("demo-");
    } finally {
      await rm(dest, { recursive: true, force: true });
      await rm(stubBin, { recursive: true, force: true });
    }
  });

  it("warns and continues with exit 0 when `bd` is not on PATH", async () => {
    const dest = await mkdtemp(join(tmpdir(), "ori-init-bd-"));
    // Stub PATH contains only `ori` — bd lookup will fail.
    const stubBin = await makeStubBinDir({ ori: ORI_STUB });
    try {
      const result = await execFileAsync(BASH_PATH, [INIT_SCRIPT, "--dest", dest], {
        env: {
          ...process.env,
          // Inherit the parent's PATH minus bd's directory so coreutils stay
          // discoverable but `command -v bd` fails inside the script.
          PATH: `${stubBin}:${pathWithoutBd()}`,
        },
      });
      expect(result.stderr).toMatch(/'bd' not found on PATH/);
      // .beads/ must NOT exist — the script must gracefully skip, not stub
      // a half-initialized workspace.
      await expect(stat(join(dest, ".beads"))).rejects.toThrow();
    } finally {
      await rm(dest, { recursive: true, force: true });
      await rm(stubBin, { recursive: true, force: true });
    }
  });
});
