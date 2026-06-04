import { consola } from "consola";

const args = process.argv.slice(2);
function flag(name: string): string | undefined {
  const idx = args.findIndex((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (idx === -1) return undefined;
  const a = args[idx]!;
  if (a.includes("=")) return a.split("=").slice(1).join("=");
  return args[idx + 1];
}
function boolFlag(name: string): boolean { return args.includes(`--${name}`); }

const file = flag("file");
const since = flag("since");
const check = boolFlag("check");

consola.info(`ori sync (MVP stub) — file=${file ?? "<all>"} since=${since ?? "HEAD"}`);
consola.warn("Detection + graph propagation not wired yet. Coming in next milestone.");
if (check) process.exit(0);
