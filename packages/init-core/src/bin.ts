#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createSkeleton } from "./skeleton.js";

interface ParsedArgs {
  force: boolean;
  dest: string;
  help: boolean;
  unknown?: string;
}

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = { force: false, dest: process.cwd(), help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--force") {
      out.force = true;
    } else if (arg === "--dest") {
      const next = argv[i + 1];
      if (next === undefined) {
        out.unknown = "--dest requires a value";
        return out;
      }
      out.dest = next;
      i++;
    } else if (arg === "-h" || arg === "--help") {
      out.help = true;
    } else {
      out.unknown = arg;
      return out;
    }
  }
  return out;
}

function printUsage(stream: NodeJS.WriteStream): void {
  stream.write(
    [
      "Usage: ori-init-skeleton [options]",
      "",
      "Options:",
      "  --force         Overwrite existing .ori/ files when present",
      "  --dest <dir>    Destination directory (default: current working directory)",
      "  -h, --help      Show this help and exit",
      "",
    ].join("\n"),
  );
}

export async function run(argv: string[]): Promise<number> {
  const parsed = parseArgs(argv);
  if (parsed.help) {
    printUsage(process.stdout);
    return 0;
  }
  if (parsed.unknown !== undefined) {
    process.stderr.write(`ERROR: ${parsed.unknown}\n`);
    printUsage(process.stderr);
    return 2;
  }

  const cwd = resolve(parsed.dest);
  const result = await createSkeleton({ cwd, force: parsed.force });

  process.stdout.write(`ori workspace initialized at ${cwd}\n`);
  process.stdout.write(`  app: ${result.appName}\n`);
  if (result.configWritten) {
    process.stdout.write("  config.yaml: written\n");
  } else if (result.configAlreadyExisted) {
    process.stdout.write("  config.yaml: kept (already existed; use --force to overwrite)\n");
  }
  if (result.scaffold.written.length > 0) {
    process.stdout.write(
      `  domain scaffolds: ${result.scaffold.written.length} written\n`,
    );
  }
  if (result.scaffold.skipped.length > 0) {
    process.stdout.write(
      `  domain scaffolds: ${result.scaffold.skipped.length} skipped (existing)\n`,
    );
  }
  return 0;
}

function isMainModule(): boolean {
  const arg1 = process.argv[1];
  if (!arg1) return false;
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(arg1);
  } catch {
    return false;
  }
}

if (isMainModule()) {
  run(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err) => {
      process.stderr.write(`ERROR: ${err instanceof Error ? err.message : String(err)}\n`);
      process.exit(1);
    },
  );
}
