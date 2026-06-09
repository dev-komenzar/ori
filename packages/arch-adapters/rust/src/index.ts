import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildMatchers,
  buildRules,
  type AdapterOpts,
  type Matcher,
  type OriArchAdapter,
  type Rule,
  type RootConfig,
} from "@ori-ori/parser";

function defaultTemplatesDir(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "templates");
}

function escapeRustStr(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function sliceBase(root: RootConfig): string {
  const trimmed = root.slice_root === "."
    ? ensureTrailingSlash(root.path)
    : ensureTrailingSlash(`${root.path}/${root.slice_root}`);
  return trimmed;
}

function ensureTrailingSlash(p: string): string {
  return p.endsWith("/") ? p : `${p}/`;
}

function crateRoot(root: RootConfig): string {
  // Cargo convention: integration tests live at <crate-root>/tests/.
  if (root.path === "src") return ".";
  if (root.path.endsWith("/src")) return root.path.slice(0, -"/src".length);
  return root.path;
}

function renderMatchers(matchers: Matcher[]): string {
  // Returns the content of `&[ <here> ]` — comma-separated LayerMatcher struct
  // literals, indented to fit inside the template's `&[__ORI_MATCHERS__]`.
  const lines = matchers.map(
    (m) =>
      `\n    LayerMatcher { layer_id: "${escapeRustStr(m.layerId)}", kind: "${m.kind}", prefix: "${escapeRustStr(m.prefix)}", slice: ${m.slice} },`,
  );
  return `${lines.join("")}\n`;
}

function renderRules(rules: Rule[]): string {
  const lines = rules.map((r) => {
    const allow = r.allow.map((a) => `"${escapeRustStr(a)}"`).join(", ");
    return `\n    ("${escapeRustStr(r.from)}", &[${allow}]),`;
  });
  return `${lines.join("")}\n`;
}

function applyPlaceholders(template: string, subs: Record<string, string>): string {
  let out = template;
  for (const [key, value] of Object.entries(subs)) {
    out = out.replaceAll(`__ORI_${key}__`, value);
  }
  return out;
}

const adapter: OriArchAdapter = {
  name: "rust",
  language: "rust",

  async export(spec, root, opts: AdapterOpts = {}) {
    if (root.language !== "rust") {
      return {
        files: [],
        notes: [
          `rust adapter skipped: root "${root.id}" is language=${root.language}, not rust.`,
        ],
      };
    }
    const set = spec.layer_sets[root.layer_set];
    if (!set) {
      throw new Error(`layer_set "${root.layer_set}" not found in layer_sets`);
    }

    const matchers = buildMatchers(spec, root);
    const rules = buildRules(spec, root);
    const base = sliceBase(root);

    const templatesDir = opts.templatesDir ?? defaultTemplatesDir();
    const template = await readFile(join(templatesDir, "arch_test.rs.tpl"), "utf8");

    // Note: replacement order matters here — quoted string placeholders are
    // replaced before bare identifiers to avoid double-replacement.
    let content = template
      .replaceAll('"__ORI_ROOT_ID__"', `"${escapeRustStr(root.id)}"`)
      .replaceAll('"__ORI_ROOT_PATH__"', `"${escapeRustStr(root.path)}"`)
      .replaceAll('"__ORI_SLICE_BASE__"', `"${escapeRustStr(base)}"`)
      .replaceAll('"__ORI_PUBLIC_ENTRY__"', `"${escapeRustStr(root.public_entry)}"`);
    content = applyPlaceholders(content, {
      CROSS_SLICE_PROHIBITED: spec.cross_slice.prohibited_direct ? "true" : "false",
      MATCHERS: renderMatchers(matchers),
      CROSS_LAYER_RULES: renderRules(rules),
    });

    const path = `${crateRoot(root)}/tests/arch.rs`;
    return {
      files: [{ path, content }],
      notes: [
        `Run \`cargo test --test arch\` from ${crateRoot(root)} to verify architecture rules.`,
        "The generated test is self-contained (no extra crates). It walks .rs files and panics on violation.",
      ],
    };
  },
};

export default adapter;
