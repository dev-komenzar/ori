# @ori/parser

Markdown / frontmatter / section parsing for the ori toolchain.

## Exports

- `parseFrontmatter(raw)` — splits gray-matter style frontmatter from body
- `extractSections(markdown)` — extracts H2/H3 sections, recognising Pandoc-style `{#id}` anchors
- `hashSection(content)` / `normalizeForHash(content)` — deterministic content hashing for change detection
- `OriFrontmatterSchema` — zod schema for the ori-specific `coherence:` and `ori:` frontmatter blocks

Section IDs use the `## Heading text {#kebab-case-id}` convention. When an anchor is missing the parser still returns a Section but its `id` is `null` and an auto-generated key `_h{depth}_{n}` is used in `byId`.
