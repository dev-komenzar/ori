import { defineCommand } from "citty";
import { consola } from "consola";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { extractSections, parseFrontmatter } from "@ori-ori/parser";

interface LintIssue {
  file: string;
  line: number;
  message: string;
}

async function* walkMarkdown(dir: string): AsyncGenerator<string> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkMarkdown(full);
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      yield full;
    }
  }
}

async function lintFile(path: string): Promise<LintIssue[]> {
  const raw = await readFile(path, "utf8");
  const { content } = parseFrontmatter(raw);
  const sections = extractSections(content);
  const issues: LintIssue[] = [];

  for (const section of sections.ordered) {
    if (section.id === null && (section.depth === 2 || section.depth === 3)) {
      issues.push({
        file: path,
        line: section.startLine,
        message: `H${section.depth} "${section.heading}" missing {#kebab-id} anchor`,
      });
    }
    if (section.id && !/^[a-z][a-z0-9-]*$/.test(section.id)) {
      issues.push({
        file: path,
        line: section.startLine,
        message: `Section id "${section.id}" should be lower-kebab-case starting with a letter`,
      });
    }
  }

  // unique-id check within file
  const seen = new Set<string>();
  for (const section of sections.ordered) {
    if (!section.id) continue;
    if (seen.has(section.id)) {
      issues.push({
        file: path,
        line: section.startLine,
        message: `Duplicate section id "${section.id}" in file`,
      });
    }
    seen.add(section.id);
  }

  return issues;
}

export const lintCommand = defineCommand({
  meta: {
    name: "lint",
    description: "Validate ori convention compliance on domain / slice / page docs",
  },
  args: {
    path: {
      type: "positional",
      description: "Directory or file to lint (default: .ori/)",
      required: false,
    },
    strict: {
      type: "boolean",
      description: "Exit non-zero on any issue",
      default: false,
    },
  },
  async run({ args }) {
    const target = args.path ?? ".ori";
    const cwd = process.cwd();
    const absTarget = join(cwd, target);

    let issues: LintIssue[] = [];
    let st;
    try {
      st = await stat(absTarget);
    } catch {
      consola.error(`Path not found: ${target}`);
      process.exit(2);
    }

    if (st.isFile()) {
      issues = await lintFile(absTarget);
    } else {
      for await (const file of walkMarkdown(absTarget)) {
        issues.push(...(await lintFile(file)));
      }
    }

    if (issues.length === 0) {
      consola.success(`No lint issues in ${target}`);
      return;
    }

    for (const issue of issues) {
      consola.warn(`${relative(cwd, issue.file)}:${issue.line}  ${issue.message}`);
    }
    consola.error(`${issues.length} issue(s) found`);
    if (args.strict) process.exit(1);
  },
});
