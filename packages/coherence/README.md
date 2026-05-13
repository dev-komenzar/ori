# @ori/coherence

Change detection and propagation for the ori coherence graph.

## Concepts

- **Node**: a file (`file` propagation level) or section (`{#id}`-anchored H2/H3).
- **Edge**: `derives_from` (SSoT-protected) or `references` (weak link).
- **Graph**: bidirectional adjacency; built from feature manifests.
- **Propagation**: single algorithm — when a node changes, every adjacent node is marked dirty. The receiver decides what to do (re-derive, propose, ignore).
- **SSoT protection**: enforced at edit-time via `--force`, not at propagation time.

## Exports

- `buildGraph(edges)` / `neighbors(graph, node)` — graph construction & lookup
- `propagate(graph, changedNode)` — fan out a change to all neighbours
- `detectChangesInFile(path, prev, curr, opts)` — compare two revisions and return changed nodes
- `parseManifest(yaml)` — validate `.ori/features/<id>/manifest.yaml` content
