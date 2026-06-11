import { execFile, execSync } from "node:child_process";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { parse as yamlParse } from "yaml";

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..", "..", "..");
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
// directory containing `bd`. This keeps mkdir, sed, etc. discoverable on
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

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function runScript(
  dest: string,
  extraArgs: string[] = [],
  env: NodeJS.ProcessEnv = {},
): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync(BASH_PATH, [INIT_SCRIPT, "--dest", dest, ...extraArgs], {
    env: {
      ...process.env,
      ...env,
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

const EXPECTED_SCAFFOLDS = [
  ".ori/domain/discovery.md",
  ".ori/domain/event-storming.md",
  ".ori/domain/bounded-contexts.md",
  ".ori/domain/context-map.md",
  ".ori/domain/aggregates.md",
  ".ori/domain/domain-events.md",
  ".ori/domain/validation.md",
  ".ori/domain/glossary.md",
  ".ori/domain/workflows/index.md",
  ".ori/domain/types.md",
  ".ori/domain/code/index.md",
  ".ori/domain/ui-fields/index.md",
];

describe("ori-init create-skeleton.sh — skeleton creation (ori-1ih)", () => {
  it("creates the .ori/ skeleton silently — no project-root files touched", async () => {
    const dest = await mkdtemp(join(tmpdir(), "ori-init-mkdir-"));
    try {
      await runScript(dest);
      expect(await fileExists(join(dest, ".ori/config.yaml"))).toBe(true);
      expect(await fileExists(join(dest, ".ori/.gitignore"))).toBe(true);
      for (const rel of EXPECTED_SCAFFOLDS) {
        expect(await fileExists(join(dest, rel))).toBe(true);
      }
      // init must NOT scaffold app code at the project root — that is
      // /ori-arch's job. (Note: bd init legitimately creates CLAUDE.md /
      // AGENTS.md as harness integration, so we don't assert on those.)
      expect(await fileExists(join(dest, "package.json"))).toBe(false);
      expect(await fileExists(join(dest, "src-tauri"))).toBe(false);
      // apps/ scaffolding is delegated to /ori-arch — config.yaml records
      // the *intent* but the directory must not yet exist at init time.
      expect(await fileExists(join(dest, "apps"))).toBe(false);
    } finally {
      await rm(dest, { recursive: true, force: true });
    }
  });

  it("writes a valid config.yaml with workspace.apps derived from --dest folder", async () => {
    const dest = await mkdtemp(join(tmpdir(), "ori-init-config-"));
    try {
      await runScript(dest);
      const config = yamlParse(await readFile(join(dest, ".ori/config.yaml"), "utf8")) as {
        ori: {
          version: number;
          workspace: {
            apps_root: string;
            apps: Array<{ name: string; path: string }>;
          };
          workflow: { phases: Record<string, { capability: string; fresh_context?: boolean }> };
          agents: Record<string, { capability_to_model: Record<string, string> }>;
          current_agent: string;
        };
      };
      const sanitized = basename(dest)
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
      expect(config.ori.version).toBe(1);
      expect(config.ori.workspace.apps_root).toBe("apps");
      expect(config.ori.workspace.apps).toEqual([
        { name: sanitized, path: `apps/${sanitized}` },
      ]);
      expect(config.ori.current_agent).toBe("claude");
      // Phase config — review must keep fresh_context for adversarial review.
      expect(config.ori.workflow.phases.review?.fresh_context).toBe(true);
      expect(config.ori.workflow.phases.derive?.capability).toBe("deep");
      // All 6 agents seeded.
      expect(Object.keys(config.ori.agents).sort()).toEqual(
        ["claude", "codex", "copilot", "cursor", "gemini", "opencode"],
      );
      expect(config.ori.agents.claude?.capability_to_model.deep).toBe("claude-sonnet-4-6");
    } finally {
      await rm(dest, { recursive: true, force: true });
    }
  });

  it("seeds aggregates.md / validation.md / workflows index with the right phase pointer", async () => {
    const dest = await mkdtemp(join(tmpdir(), "ori-init-scaffold-"));
    try {
      await runScript(dest);
      const aggregates = await readFile(join(dest, ".ori/domain/aggregates.md"), "utf8");
      expect(aggregates).toContain("# Aggregates");
      expect(aggregates).toContain("status: pending");
      expect(aggregates).toContain("/ori-ddd-5-aggregates");

      const validation = await readFile(join(dest, ".ori/domain/validation.md"), "utf8");
      expect(validation).toContain("# Validation");
      expect(validation).toContain("/ori-ddd-7-validation");

      const workflowsIndex = await readFile(
        join(dest, ".ori/domain/workflows/index.md"),
        "utf8",
      );
      expect(workflowsIndex).toContain("# Workflows Index");
      expect(workflowsIndex).toContain("/ori-ddd-9-workflows");

      const uiFieldsIndex = await readFile(
        join(dest, ".ori/domain/ui-fields/index.md"),
        "utf8",
      );
      expect(uiFieldsIndex).toContain("# UI Fields Index");
      expect(uiFieldsIndex).toContain("/ori-ddd-11a-ui-fields");

      const codeIndex = await readFile(join(dest, ".ori/domain/code/index.md"), "utf8");
      expect(codeIndex).toContain("# Code Index");
      expect(codeIndex).toContain("/ori-ddd-10-types");
    } finally {
      await rm(dest, { recursive: true, force: true });
    }
  });

  it("places .gitkeep in empty VCS-tracked directories", async () => {
    const dest = await mkdtemp(join(tmpdir(), "ori-init-gitkeep-"));
    try {
      await runScript(dest);
      expect(await fileExists(join(dest, ".ori/slices/.gitkeep"))).toBe(true);
      expect(await fileExists(join(dest, ".ori/pages/.gitkeep"))).toBe(true);
      expect(await fileExists(join(dest, ".ori/proposals/.gitkeep"))).toBe(true);
    } finally {
      await rm(dest, { recursive: true, force: true });
    }
  });

  it("does NOT overwrite existing scaffold files without --force", async () => {
    const dest = await mkdtemp(join(tmpdir(), "ori-init-noforce-"));
    try {
      await mkdir(join(dest, ".ori/domain"), { recursive: true });
      await writeFile(join(dest, ".ori/domain/aggregates.md"), "USER CONTENT\n", "utf8");
      await runScript(dest);
      const body = await readFile(join(dest, ".ori/domain/aggregates.md"), "utf8");
      expect(body).toBe("USER CONTENT\n");
    } finally {
      await rm(dest, { recursive: true, force: true });
    }
  });

  it("overwrites existing scaffold files when --force is given", async () => {
    const dest = await mkdtemp(join(tmpdir(), "ori-init-force-"));
    try {
      await mkdir(join(dest, ".ori/domain"), { recursive: true });
      await writeFile(join(dest, ".ori/domain/aggregates.md"), "USER CONTENT\n", "utf8");
      await runScript(dest, ["--force"]);
      const body = await readFile(join(dest, ".ori/domain/aggregates.md"), "utf8");
      expect(body).toContain("status: pending");
      expect(body).toContain("# Aggregates");
    } finally {
      await rm(dest, { recursive: true, force: true });
    }
  });
});

describe("ori-init create-skeleton.sh — --app-name override (ori-gag)", () => {
  it("uses the explicit --app-name value in workspace.apps[]", async () => {
    const dest = await mkdtemp(join(tmpdir(), "ori-init-appname-"));
    try {
      await runScript(dest, ["--app-name", "checkout-svc"]);
      const config = yamlParse(
        await readFile(join(dest, ".ori/config.yaml"), "utf8"),
      ) as { ori: { workspace: { apps: Array<{ name: string; path: string }> } } };
      expect(config.ori.workspace.apps).toEqual([
        { name: "checkout-svc", path: "apps/checkout-svc" },
      ]);
    } finally {
      await rm(dest, { recursive: true, force: true });
    }
  });

  it("sanitizes a user-supplied --app-name the same way as basename derivation", async () => {
    const dest = await mkdtemp(join(tmpdir(), "ori-init-appname-"));
    try {
      // Uppercase + underscore + spaces — must be normalized to [a-z0-9-].
      await runScript(dest, ["--app-name", "My App_Name"]);
      const config = yamlParse(
        await readFile(join(dest, ".ori/config.yaml"), "utf8"),
      ) as { ori: { workspace: { apps: Array<{ name: string; path: string }> } } };
      expect(config.ori.workspace.apps[0]?.name).toBe("my-app-name");
    } finally {
      await rm(dest, { recursive: true, force: true });
    }
  });

  it("rejects --app-name that sanitizes to empty (exit 2)", async () => {
    const dest = await mkdtemp(join(tmpdir(), "ori-init-appname-"));
    try {
      // Surfacing the typo is better than silently falling back to "app",
      // which would mask the mistake until the user opens config.yaml.
      await expect(runScript(dest, ["--app-name", "///"])).rejects.toMatchObject({
        code: 2,
      });
      // .ori/ must NOT have been created when the input is rejected.
      expect(await fileExists(join(dest, ".ori/config.yaml"))).toBe(false);
    } finally {
      await rm(dest, { recursive: true, force: true });
    }
  });
});

describe("ori-init create-skeleton.sh — current_agent resolution (ori-zpy)", () => {
  type ConfigShape = { ori: { current_agent: string } };

  async function readAgent(dest: string): Promise<string> {
    const cfg = yamlParse(
      await readFile(join(dest, ".ori/config.yaml"), "utf8"),
    ) as ConfigShape;
    return cfg.ori.current_agent;
  }

  it("uses the explicit --agent value and surfaces the override on stdout", async () => {
    const dest = await mkdtemp(join(tmpdir(), "ori-init-agent-"));
    try {
      const { stdout } = await runScript(dest, ["--agent", "opencode"]);
      expect(stdout).toMatch(/using --agent override: opencode/);
      expect(await readAgent(dest)).toBe("opencode");
    } finally {
      await rm(dest, { recursive: true, force: true });
    }
  });

  it("rejects --agent values outside the supported set (exit 2)", async () => {
    const dest = await mkdtemp(join(tmpdir(), "ori-init-agent-"));
    try {
      await expect(runScript(dest, ["--agent", "bogus"])).rejects.toMatchObject({
        code: 2,
      });
      // Reject before any filesystem mutation so a typo is recoverable
      // without --force.
      expect(await fileExists(join(dest, ".ori/config.yaml"))).toBe(false);
    } finally {
      await rm(dest, { recursive: true, force: true });
    }
  });

  it("falls back to claude with an INFO note when no agent markers exist", async () => {
    const dest = await mkdtemp(join(tmpdir(), "ori-init-agent-"));
    try {
      const { stderr } = await runScript(dest);
      expect(stderr).toMatch(/no agent markers found/);
      expect(await readAgent(dest)).toBe("claude");
    } finally {
      await rm(dest, { recursive: true, force: true });
    }
  });

  it("auto-detects a single non-claude marker (opencode) — the ori-zpy regression case", async () => {
    const dest = await mkdtemp(join(tmpdir(), "ori-init-agent-"));
    try {
      // Reproduce the promptnotes-vcsdd dry-run: only .opencode/ present.
      await mkdir(join(dest, ".opencode"), { recursive: true });
      const { stdout } = await runScript(dest);
      expect(stdout).toMatch(/detected agent: opencode/);
      expect(await readAgent(dest)).toBe("opencode");
    } finally {
      await rm(dest, { recursive: true, force: true });
    }
  });

  it("warns and picks claude by priority when multiple markers are present", async () => {
    const dest = await mkdtemp(join(tmpdir(), "ori-init-agent-"));
    try {
      await mkdir(join(dest, ".claude"), { recursive: true });
      await mkdir(join(dest, ".opencode"), { recursive: true });
      const { stderr } = await runScript(dest);
      // Both must appear in the warning so the user can decide whether to
      // re-run with --agent — silently picking one would mask the choice.
      expect(stderr).toMatch(/multiple agent markers detected/);
      expect(stderr).toMatch(/claude/);
      expect(stderr).toMatch(/opencode/);
      expect(await readAgent(dest)).toBe("claude");
    } finally {
      await rm(dest, { recursive: true, force: true });
    }
  });

  it("detects copilot via .github/copilot-instructions.md (file, not dir)", async () => {
    const dest = await mkdtemp(join(tmpdir(), "ori-init-agent-"));
    try {
      await mkdir(join(dest, ".github"), { recursive: true });
      await writeFile(
        join(dest, ".github/copilot-instructions.md"),
        "# copilot\n",
        "utf8",
      );
      await runScript(dest);
      expect(await readAgent(dest)).toBe("copilot");
    } finally {
      await rm(dest, { recursive: true, force: true });
    }
  });

  it("detects cursor via .cursorrules file alone (no .cursor/ dir)", async () => {
    const dest = await mkdtemp(join(tmpdir(), "ori-init-agent-"));
    try {
      await writeFile(join(dest, ".cursorrules"), "rules\n", "utf8");
      await runScript(dest);
      expect(await readAgent(dest)).toBe("cursor");
    } finally {
      await rm(dest, { recursive: true, force: true });
    }
  });

  it("--agent overrides auto-detection even when markers are present", async () => {
    const dest = await mkdtemp(join(tmpdir(), "ori-init-agent-"));
    try {
      await mkdir(join(dest, ".opencode"), { recursive: true });
      await runScript(dest, ["--agent", "codex"]);
      expect(await readAgent(dest)).toBe("codex");
    } finally {
      await rm(dest, { recursive: true, force: true });
    }
  });
});

describe("ori-init create-skeleton.sh — bd integration (ori-ks7)", () => {
  it("runs `bd init` after skeleton creation so /ori-flow has a SSoT immediately", async () => {
    const dest = await mkdtemp(join(tmpdir(), "ori-init-bd-"));
    try {
      await runScript(dest);
      const prefix = await readBdPrefix(join(dest, ".beads"));
      // ori-ks7 spec: prefix defaults to `ori`. bd requires a trailing
      // hyphen so the on-disk prefix is `ori-`.
      expect(prefix).toBe("ori-");
    } finally {
      await rm(dest, { recursive: true, force: true });
    }
  });

  it("is idempotent — re-running over an existing .beads/ skips bd init", async () => {
    const dest = await mkdtemp(join(tmpdir(), "ori-init-bd-"));
    try {
      await runScript(dest);
      const beadsStat = await stat(join(dest, ".beads"));

      // A second run must not error and must not destroy the existing
      // beads workspace (re-init without authorization would lose data).
      const { stdout } = await runScript(dest);
      expect(stdout).toMatch(/skipping bd init \(idempotent\)/);

      const beadsStatAfter = await stat(join(dest, ".beads"));
      expect(beadsStatAfter.isDirectory()).toBe(true);
      expect(beadsStat.isDirectory()).toBe(true);
    } finally {
      await rm(dest, { recursive: true, force: true });
    }
  });

  it("respects ORI_BD_PREFIX env var (with or without trailing hyphen)", async () => {
    const dest = await mkdtemp(join(tmpdir(), "ori-init-bd-"));
    try {
      await runScript(dest, [], { ORI_BD_PREFIX: "demo" });
      const prefix = await readBdPrefix(join(dest, ".beads"));
      // `demo` is normalized to `demo-` (bd requires trailing hyphen) and
      // env override takes precedence over the `ori` default.
      expect(prefix).toBe("demo-");
    } finally {
      await rm(dest, { recursive: true, force: true });
    }
  });

  it("warns and continues with exit 0 when `bd` is not on PATH", async () => {
    const dest = await mkdtemp(join(tmpdir(), "ori-init-bd-"));
    try {
      // Inherit the parent's PATH minus bd's directory so coreutils stay
      // discoverable but `command -v bd` fails inside the script.
      const result = await execFileAsync(BASH_PATH, [INIT_SCRIPT, "--dest", dest], {
        env: {
          ...process.env,
          PATH: pathWithoutBd(),
        },
      });
      expect(result.stderr).toMatch(/'bd' not found on PATH/);
      // .beads/ must NOT exist — the script must gracefully skip, not stub
      // a half-initialized workspace.
      await expect(stat(join(dest, ".beads"))).rejects.toThrow();
      // …but the .ori/ skeleton must still have been created.
      expect(await fileExists(join(dest, ".ori/config.yaml"))).toBe(true);
    } finally {
      await rm(dest, { recursive: true, force: true });
    }
  });
});
