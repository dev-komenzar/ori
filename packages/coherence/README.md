# @ori-ori/coherence

Change detection and propagation for the ori coherence graph.

> **Internal package (v0.3-N〜)**: This package is `private: true` and not published to npm. It is consumed only by `@ori-ori/slice-runner` (which itself is bundled into ori-flow / ori-model skills via esbuild). External library use is not supported — install ori via `apm install dev-komenzar/ori` and invoke the skill scripts instead. Previously published `@ori-ori/coherence@<=0.2.0` is deprecated on npm.

## Concepts

- **Node**: a file (`file` propagation level) or section (`{#id}`-anchored H2/H3).
- **Edge**: `derives_from` (SSoT-protected) or `references` (weak link).
- **Graph**: bidirectional adjacency; built from slice/page manifests.
- **Propagation**: single algorithm — when a node changes, every adjacent node is marked dirty. The receiver decides what to do (re-derive, propose, ignore).
- **SSoT protection**: enforced at edit-time via `--force`, not at propagation time.

## Exports

- `buildGraph(edges)` / `neighbors(graph, node)` — graph construction & lookup
- `propagate(graph, changedNode)` — fan out a change to all neighbours
- `detectChangesInFile(path, prev, curr, opts)` — compare two revisions and return changed nodes
- `parseManifest(yaml)` — validate `.ori/slices/<id>/manifest.yaml` or `.ori/pages/<id>/manifest.yaml` (discriminated by `type`)
