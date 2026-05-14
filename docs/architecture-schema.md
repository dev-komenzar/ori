# `.ori/architecture.md` schema (v1)

`.ori/architecture.md` is the **language-neutral SSoT** for feature-sliced
architecture enforcement. It declares layers, allowed cross-layer dependencies,
and public entry points. Adapters (`@ori-ori/arch-adapter-*`) compile it to
native linter configs (eslint, dependency-cruiser, import-linter, ArchUnit,
arch-adapter-rust, generic regex fallback).

The file is a **YAML frontmatter + Markdown body**. Frontmatter is the
machine-parseable contract; body is rationale, examples, and any
human-maintained notes (preserved across auto-regeneration).

This schema is `version: 1`. v0.1 implementations MUST accept the multi-root
extension fields even if they only execute single-root projects; unknown root
configurations should fail loudly rather than be silently ignored.

---

## Top-level frontmatter

```yaml
---
version: 1                    # schema version; required
default_root: src             # optional. used when 'roots' is absent
roots:                        # optional in v0.1; required for multi-root projects
  - id: ts
    path: src
    language: typescript
    layer_set: feature-sliced-ts
    adapter: eslint           # adapter package suffix (eslint | rust | generic | dependency-cruiser | import-linter)
    feature_root: lib         # features live under <path>/<feature_root>/<feature>/
    public_entry: index.ts    # file that exposes the feature's public API
  - id: rs
    path: src-tauri/src
    language: rust
    layer_set: feature-sliced-rs
    adapter: rust
    feature_root: .           # features live directly under src-tauri/src/<feature>/
    public_entry: mod.rs
cross_root:                   # optional; declares published-language bridges
  - from: { root: rs, path: shared/contracts }
    to:   { root: ts, path: lib/shared/ipc }
    generator: tauri-specta
    auto_generated: true      # the 'to' side is generated; manual edits forbidden
layer_sets:
  feature-sliced-ts: { ... }  # see "Layer set" below
feature_internal:
  feature-internal-ts: { ... }
cross_feature:
  prohibited_direct: true
  via: [shared/contracts, shared/events]
ui_layer_map_marker: phase-11b  # opt-in: enables ori-distill phase 11b to manage the UI layer section
---
```

### Single-root shorthand (v0.1 default)

When the project has exactly one root, omit `roots` and use top-level fields:

```yaml
---
version: 1
root:                         # singular form — equivalent to roots[0]
  path: src
  language: typescript
  layer_set: feature-sliced-ts
  adapter: eslint
  feature_root: lib
  public_entry: index.ts
layer_sets: { ... }
feature_internal: { ... }
cross_feature: { prohibited_direct: true, via: [shared/contracts] }
---
```

Adapters MUST treat `root:` and a single-element `roots:` identically.

---

## Layer set

```yaml
layer_sets:
  feature-sliced-ts:
    layers:
      - { id: shared,     kind: shared }
      - { id: domain,     kind: feature, feature_internal: feature-internal-ts }
      - { id: ui-entity,  kind: ui-layer, order: 1 }
      - { id: ui-feature, kind: ui-layer, order: 2 }
      - { id: ui-widget,  kind: ui-layer, order: 3 }
      - { id: ui-page,    kind: ui-layer, order: 4 }
    rules:
      cross_layer:            # one allow-list per source layer; everything else denied
        - { from: ui-page,    allow: [ui-widget, ui-feature, ui-entity, shared, domain] }
        - { from: ui-widget,  allow: [ui-feature, ui-entity, shared, domain] }
        - { from: ui-feature, allow: [ui-entity, shared, domain] }
        - { from: ui-entity,  allow: [shared, domain] }
        - { from: domain,     allow: [shared] }
        - { from: shared,     allow: [] }
      same_layer: prohibited  # 'prohibited' (default) | 'allowed'
      public_entry_required: true
```

**Layer kinds**:

- `shared` — flat module of cross-cutting code; no internal feature structure
- `feature` — each immediate child is a feature; feature-internal sub-layering applies
- `ui-layer` — FSD layer. `order` is the topological position; lower = closer to shared

**Default semantics**: same-layer imports are prohibited, public-entry is
required. The schema makes these explicit so that an adapter cannot silently
disagree with the rules. UI-layer rules express the canonical FSD pipeline
(`pages → widgets → ui-features → ui-entities → shared`), but a project can
deviate by editing `rules.cross_layer` — the schema is policy, not religion.

---

## Feature-internal structure

A feature (member of a `kind: feature` layer) has its own sub-layering.

```yaml
feature_internal:
  feature-internal-ts:
    sub_layers: [domain, application, infrastructure, presentation, tests]
    rules:
      - { from: presentation,   allow: [application, domain] }
      - { from: application,    allow: [domain] }
      - { from: infrastructure, allow: [domain] }
      - { from: domain,         allow: [] }
      - { from: tests,          allow: [domain, application, infrastructure, presentation] }
  feature-internal-rs:
    sub_layers: [domain, application, infrastructure, presentation]
    rules:
      - { from: presentation,   allow: [application, domain] }
      - { from: application,    allow: [domain] }
      - { from: infrastructure, allow: [domain] }
      - { from: domain,         allow: [] }
```

The feature-internal sub-layers are **physical directories** under the feature
folder (e.g., `src/lib/orders/{domain,application,...}`). Adapters resolve them
via the layer's `feature_internal` reference.

---

## Cross-feature rule

```yaml
cross_feature:
  prohibited_direct: true   # direct imports between features are illegal
  via: [shared/contracts, shared/events]   # allowed bridges, relative to root.path/root.feature_root
```

`prohibited_direct: true` means an adapter MUST flag any import where the
source feature ID ≠ target feature ID. The only legal cross-feature paths
are the ones listed in `via` (typically `shared/contracts/` for domain events
and `shared/events/` for the event bus).

---

## Cross-root contracts (multi-root only)

```yaml
cross_root:
  - from: { root: rs, path: shared/contracts }
    to:   { root: ts, path: lib/shared/ipc }
    generator: tauri-specta
    auto_generated: true
```

Declares a **published-language boundary** between two roots. The `to` side is
generated by `generator` from the `from` side. When `auto_generated: true`,
adapters on the `to` root MUST treat the path as read-only and ignore lint
errors that originate inside generated files (they are the source root's
problem). v0.1 ignores `cross_root` if `roots` is absent; v0.2+ Tauri support
consumes it.

---

## Markdown body conventions

Below the frontmatter, the body is freeform Markdown for rationale and
examples — humans read it, adapters don't. Two structured sections are
recognised:

### `## Layer rationale` (informational)

Free prose explaining why the layer order is what it is, what each layer owns,
and any non-obvious exceptions. Adapters do not read this.

### `## UI Layer Map` (auto-managed by phase 11b)

When `ui_layer_map_marker: phase-11b` is set in frontmatter, the
`ori-distill phase 11b` step (issue ori-lp2) will manage the contents of this
section between markers:

```markdown
## UI Layer Map

<!-- BEGIN ori-distill phase-11b auto-generated; do not edit between markers -->
- ui-entity:
  - promptnotes-ui-entity-prompt-card     (depended_by: prompt-list, prompt-editor)
  - promptnotes-ui-entity-tag             (depended_by: prompt-list, tag-picker)
- ui-feature:
  - promptnotes-ui-feature-prompt-editor  (depends_on: prompt-card, tag-picker)
  - promptnotes-ui-feature-prompt-list    (depends_on: prompt-card)
- ui-widget:
  - promptnotes-ui-widget-prompt-workspace (depends_on: prompt-editor, prompt-list)
- ui-page:
  - promptnotes-ui-page-home               (depends_on: prompt-workspace)
<!-- END ori-distill phase-11b auto-generated -->

## Manual notes

Anything outside the markers is preserved across regeneration. Use this for
opt-outs, deprecations, or notes the team wants pinned to architecture review.
```

Phase 11b derives this from `.ori/domain/ui-fields/screen-*.md` frontmatter
(`depended_by`, `depends_on`). The markers MUST be byte-exact for the
regeneration to be idempotent.

---

## Adapter contract

`ori arch export --adapter=<name>` (issue ori-csk) loads the spec and invokes
the adapter package. Adapters implement:

```ts
// Adapter package default export
export interface OriArchAdapter {
  name: string;
  language: string | string[];
  export(spec: ArchitectureSpec, root: RootConfig): Promise<{
    files: { path: string; content: string }[];      // native config files to write
    notes?: string[];                                 // human-facing post-install steps
  }>;
  check?(spec: ArchitectureSpec, root: RootConfig): Promise<{
    violations: { file: string; line?: number; rule: string; message: string }[];
  }>;
}
```

`ArchitectureSpec` is the parsed frontmatter; `RootConfig` is one element of
`roots[]` (or the singular `root` block in shorthand form). Adapters that
cannot represent a rule in their native linter MUST emit a `notes[]` entry
rather than silently dropping it.

The four MVP adapters in v0.1 scope:

| Adapter package                       | Language(s)  | Output                                                |
|---------------------------------------|--------------|-------------------------------------------------------|
| `@ori-ori/arch-adapter-eslint`        | TS / JS      | `eslint.config.ori.js` (eslint-plugin-boundaries)     |
| `@ori-ori/arch-adapter-rust`          | Rust         | `tests/arch.rs` or `cargo-modules` config              |
| `@ori-ori/arch-adapter-generic`       | any          | `.ori/arch-rules.json` + tiny CLI checker (regex)     |
| `@ori-ori/arch-adapter-dependency-cruiser` (v0.2) | TS / JS | `.dependency-cruiser.cjs`                |

---

## Worked example 1 — single-root TypeScript (ships with `ddd-typescript`)

```yaml
---
version: 1
root:
  path: src
  language: typescript
  layer_set: feature-sliced-ts
  adapter: eslint
  feature_root: lib
  public_entry: index.ts
layer_sets:
  feature-sliced-ts:
    layers:
      - { id: shared,     kind: shared }
      - { id: domain,     kind: feature, feature_internal: feature-internal-ts }
      - { id: ui-entity,  kind: ui-layer, order: 1 }
      - { id: ui-feature, kind: ui-layer, order: 2 }
      - { id: ui-widget,  kind: ui-layer, order: 3 }
      - { id: ui-page,    kind: ui-layer, order: 4 }
    rules:
      cross_layer:
        - { from: ui-page,    allow: [ui-widget, ui-feature, ui-entity, shared, domain] }
        - { from: ui-widget,  allow: [ui-feature, ui-entity, shared, domain] }
        - { from: ui-feature, allow: [ui-entity, shared, domain] }
        - { from: ui-entity,  allow: [shared, domain] }
        - { from: domain,     allow: [shared] }
        - { from: shared,     allow: [] }
      same_layer: prohibited
      public_entry_required: true
feature_internal:
  feature-internal-ts:
    sub_layers: [domain, application, infrastructure, presentation, tests]
    rules:
      - { from: presentation,   allow: [application, domain] }
      - { from: application,    allow: [domain] }
      - { from: infrastructure, allow: [domain] }
      - { from: domain,         allow: [] }
      - { from: tests,          allow: [domain, application, infrastructure, presentation] }
cross_feature:
  prohibited_direct: true
  via: [shared/contracts, shared/events]
ui_layer_map_marker: phase-11b
---

## Layer rationale

Feature-sliced design (FSD) with a one-way pipeline from pages down to shared.
Same-layer imports are prohibited so that widgets can be composed without
fearing hidden dependencies. Cross-feature traffic flows through
`shared/events` (event-bus) or `shared/contracts` (typed messages) only.

## UI Layer Map

<!-- BEGIN ori-distill phase-11b auto-generated; do not edit between markers -->
<!-- (empty until phase 11b runs on .ori/domain/ui-fields/) -->
<!-- END ori-distill phase-11b auto-generated -->
```

## Worked example 2 — multi-root Tauri (target for ori-775)

```yaml
---
version: 1
roots:
  - id: ts
    path: src
    language: typescript
    layer_set: feature-sliced-ts
    adapter: eslint
    feature_root: lib
    public_entry: index.ts
  - id: rs
    path: src-tauri/src
    language: rust
    layer_set: feature-sliced-rs
    adapter: rust
    feature_root: .
    public_entry: mod.rs
cross_root:
  - from: { root: rs, path: shared/contracts }
    to:   { root: ts, path: lib/shared/ipc }
    generator: tauri-specta
    auto_generated: true
layer_sets:
  feature-sliced-ts: { ... }   # as in example 1
  feature-sliced-rs:
    layers:
      - { id: shared, kind: shared }
      - { id: domain, kind: feature, feature_internal: feature-internal-rs }
    rules:
      cross_layer:
        - { from: domain, allow: [shared] }
        - { from: shared, allow: [] }
      same_layer: prohibited
      public_entry_required: true
feature_internal:
  feature-internal-ts: { ... }
  feature-internal-rs:
    sub_layers: [domain, application, infrastructure, presentation]
    rules:
      - { from: presentation,   allow: [application, domain] }
      - { from: application,    allow: [domain] }
      - { from: infrastructure, allow: [domain] }
      - { from: domain,         allow: [] }
cross_feature:
  prohibited_direct: true
  via: [shared/contracts, shared/events]
---
```

Each root selects its own adapter; `cross_root` makes the published-language
bridge explicit so adapters know which generated paths to skip.

---

## What's deferred to v2

- **Per-feature overrides** (e.g., a single feature opting into a different
  `feature_internal`). v1 applies the layer's default to every feature.
- **External-package allow-lists** (which npm/crate dependencies each layer
  may import). v1 only governs intra-project boundaries.
- **Glob-based path overrides** for tests, fixtures, examples. v1 treats the
  conventional sub-layer names as fixed.
- **Severity levels** (warn vs error per rule). v1 treats every violation as
  an error; adapters can downgrade in their own config if needed.

Adding any of these is additive: new optional frontmatter fields, default-off,
no migration required.
