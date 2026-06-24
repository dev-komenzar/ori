# @ori-ori/parser

Markdown / frontmatter / section parsing for the ori toolchain.

> **Internal package (v0.3-M〜)**: This package is `private: true` and not published to npm. It is consumed only by ori skills (`ori-arch` / `ori-doctor` / `arch-adapters`) via `workspace:*` and gets inlined into each skill bundle by esbuild. External library use is not supported — install ori via `apm install dev-komenzar/ori` and invoke the skill scripts instead. Previously published `@ori-ori/parser@<=0.2.0` is deprecated on npm.

## Exports

- `parseFrontmatter(raw)` — splits gray-matter style frontmatter from body
- `extractSections(markdown)` — extracts H2/H3 sections, recognising Pandoc-style `{#id}` anchors
- `hashSection(content)` / `normalizeForHash(content)` — deterministic content hashing for change detection
- `OriFrontmatterSchema` / `OriBlockSchema` — zod schema for the canonical `ori:` frontmatter block (design.md §5: `node_id` / `type` / `depends_on` / `modules`)

Section IDs use the `## Heading text {#kebab-case-id}` convention. When an anchor is missing the parser still returns a Section but its `id` is `null` and an auto-generated key `_h{depth}_{n}` is used in `byId`.
