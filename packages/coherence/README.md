# @ori-ori/coherence

Change detection and propagation for the ori coherence graph.

> **Internal package (v0.3-N〜)**: This package is `private: true` and not published to npm. It is consumed only by `@ori-ori/slice-runner` (which itself is bundled into ori-flow / ori-model skills via esbuild). External library use is not supported — install ori via `apm install dev-komenzar/ori` and invoke the skill scripts instead. Previously published `@ori-ori/coherence@<=0.2.0` is deprecated on npm.

## Concepts

- **Node**: a file (`file` propagation level) or section (`{#id}`-anchored H2/H3).
- **Edge**: `derives_from` (SSoT-protected) or `references` (weak link).
- **Graph**: bidirectional adjacency; built from slice/page manifests.
- **Propagation**: single algorithm — when a node changes, every adjacent node is marked dirty. The receiver decides what to do (re-derive, propose, ignore).
- **SSoT protection**: not enforced at propagation time. Derived files are not edited directly; upstream changes go through `/ori-propose` (the former `/ori-sync --force` is retired).

## Exports

- `buildGraph(edges)` / `neighbors(graph, node)` — graph construction & lookup
- `propagate(graph, changedNode)` — fan out a change to all neighbours
- `detectChangesInFile(path, prev, curr, opts)` — compare two revisions and return changed nodes
- `parseManifest(yaml)` — validate `.ori/slices/<id>/manifest.yaml` or `.ori/pages/<id>/manifest.yaml` (discriminated by `type`)
- spec-hash (`src/spec-hash.ts`, ori-0eh.2) — coherence frontmatter (`upstream` / `hash`) の共通実装。形式の SSoT は `.apm/instructions/feature-spec.instructions.md` §coherence-frontmatter
  - `parseDerivesFrom(manifest)` — manifest.derives_from (legacy string / structured `{path, section}` / node-id `ui-field:<name>`・`page-grouping:<id>`) を正規化した ref 列へ
  - `normalizeHashKey(key)` — `file#.*` / `file#anchor` / `file` → `file`
  - `computeFileHash(path)` — sha256(raw bytes) 先頭 12 hex (`sha256sum | cut -c1-12` と同値)
  - `computeExpectedCoherence(root, refs)` — 書かれるべき upstream / hash (file 単位 dedupe) と欠落 file
  - `readSpecCoherence(text)` / `writeSpecCoherence(text, update)` — frontmatter の coherence を読み書き (旧形式も読める / 他キーと本文は不変)
  - `findSpecTarget(root, id)` — `.ori/{slices,pages,scenarios}/<id>/` を解決
