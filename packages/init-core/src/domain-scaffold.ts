import { mkdir, writeFile, access } from "node:fs/promises";
import { dirname, join } from "node:path";

interface DomainScaffoldEntry {
  readonly path: string;
  readonly title: string;
  readonly phase: string;
}

const DOMAIN_SCAFFOLDS: DomainScaffoldEntry[] = [
  { path: ".ori/domain/discovery.md", title: "Discovery", phase: "ori-ddd-1-discovery" },
  { path: ".ori/domain/event-storming.md", title: "Event Storming", phase: "ori-ddd-2-event-storming" },
  { path: ".ori/domain/bounded-contexts.md", title: "Bounded Contexts", phase: "ori-ddd-3-bounded-contexts" },
  { path: ".ori/domain/context-map.md", title: "Context Map", phase: "ori-ddd-4-context-map" },
  { path: ".ori/domain/aggregates.md", title: "Aggregates", phase: "ori-ddd-5-aggregates" },
  { path: ".ori/domain/domain-events.md", title: "Domain Events", phase: "ori-ddd-6-domain-events" },
  { path: ".ori/domain/validation.md", title: "Validation", phase: "ori-ddd-7-validation" },
  { path: ".ori/domain/glossary.md", title: "Glossary", phase: "ori-ddd-8-glossary" },
  { path: ".ori/domain/workflows/index.md", title: "Workflows Index", phase: "ori-ddd-9-workflows" },
  { path: ".ori/domain/types.md", title: "Types Index", phase: "ori-ddd-10-types" },
  { path: ".ori/domain/code/index.md", title: "Code Index", phase: "ori-ddd-10-types" },
  { path: ".ori/domain/ui-fields/index.md", title: "UI Fields Index", phase: "ori-ddd-11a-ui-fields" },
];

function scaffoldBody(entry: DomainScaffoldEntry): string {
  return `---
coherence:
  source: scaffold
  status: pending
  last_validated: null
---

# ${entry.title}

<!-- Scaffolded by \`ori init\`. Fill via \`/${entry.phase}\`. -->
`;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export interface SeedDomainScaffoldOptions {
  readonly cwd: string;
  readonly force: boolean;
}

export interface SeedDomainScaffoldResult {
  readonly written: string[];
  readonly skipped: string[];
}

export async function seedDomainScaffolds(
  opts: SeedDomainScaffoldOptions,
): Promise<SeedDomainScaffoldResult> {
  const written: string[] = [];
  const skipped: string[] = [];
  for (const entry of DOMAIN_SCAFFOLDS) {
    const target = join(opts.cwd, entry.path);
    if (!opts.force && (await exists(target))) {
      skipped.push(entry.path);
      continue;
    }
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, scaffoldBody(entry), "utf8");
    written.push(entry.path);
  }
  return { written, skipped };
}

export const DOMAIN_SCAFFOLD_PATHS = DOMAIN_SCAFFOLDS.map((e) => e.path);
