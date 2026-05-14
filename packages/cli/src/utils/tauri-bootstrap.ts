import { spawn } from "node:child_process";
import { access, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

export interface TauriBootstrapOptions {
  readonly cwd: string;
  readonly appName?: string;
  readonly windowTitle?: string;
  readonly runner?: TauriRunner;
  readonly install?: boolean;
}

export type TauriRunner = (
  command: string,
  args: string[],
  options: { cwd: string },
) => Promise<{ exitCode: number; stdout: string; stderr: string }>;

export interface TauriBootstrapResult {
  readonly ran: { command: string; args: string[] }[];
  readonly steps: string[];
  readonly skipped?: string;
}

const SRC_TAURI_DIR = "src-tauri";
const LIB_RS_PATH = join(SRC_TAURI_DIR, "src", "lib.rs");

export async function bootstrapTauriProject(
  opts: TauriBootstrapOptions,
): Promise<TauriBootstrapResult> {
  const runner = opts.runner ?? defaultRunner;
  const ran: { command: string; args: string[] }[] = [];
  const steps: string[] = [];

  const appName = sanitizeAppName(opts.appName ?? basename(opts.cwd));
  const windowTitle = opts.windowTitle ?? appName;

  const ourLibRsPath = join(opts.cwd, LIB_RS_PATH);
  let savedLibRs: string | null = null;
  if (await fileExists(ourLibRsPath)) {
    savedLibRs = await readFile(ourLibRsPath, "utf8");
  }

  if (opts.install !== false) {
    await run(runner, "pnpm", ["install"], { cwd: opts.cwd });
    ran.push({ command: "pnpm", args: ["install"] });
    steps.push("pnpm install");
  }

  const tauriInitArgs = [
    "tauri",
    "init",
    "--ci",
    "--app-name",
    appName,
    "--window-title",
    windowTitle,
    "--frontend-dist",
    "../dist",
    "--dev-url",
    "http://localhost:5173",
    "--before-dev-command",
    "pnpm vite",
    "--before-build-command",
    "pnpm vite build",
    "--directory",
    SRC_TAURI_DIR,
  ];
  await run(runner, "pnpm", tauriInitArgs, { cwd: opts.cwd });
  ran.push({ command: "pnpm", args: tauriInitArgs });
  steps.push(`pnpm ${tauriInitArgs.join(" ")}`);

  if (savedLibRs != null) {
    await writeFile(ourLibRsPath, savedLibRs, "utf8");
    steps.push(`restored ${LIB_RS_PATH} (tauri-specta wiring)`);
  }

  return { ran, steps };
}

function sanitizeAppName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "app";
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function run(
  runner: TauriRunner,
  command: string,
  args: string[],
  options: { cwd: string },
): Promise<void> {
  const result = await runner(command, args, options);
  if (result.exitCode !== 0) {
    const cmd = `${command} ${args.join(" ")}`;
    throw new Error(
      `Command failed (${result.exitCode}): ${cmd}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    );
  }
}

const defaultRunner: TauriRunner = (command, args, options) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
      process.stdout.write(chunk);
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
      process.stderr.write(chunk);
    });
    child.on("error", reject);
    child.on("close", (exitCode) => {
      resolve({ exitCode: exitCode ?? 0, stdout, stderr });
    });
  });
