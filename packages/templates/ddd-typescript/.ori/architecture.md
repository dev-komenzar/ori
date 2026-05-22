---
version: 1
root:
  path: src
  language: typescript
  layer_set: feature-sliced-ts
  adapter: eslint
  slice_root: lib
  public_entry: index.ts
layer_sets:
  feature-sliced-ts:
    layers:
      - { id: shared,     kind: shared }
      - { id: domain,     kind: slice, slice_internal: slice-internal-ts }
      - { id: ui-entity,  kind: ui-layer, order: 1 }
      - { id: ui-feature, kind: ui-layer, order: 2 }
      - { id: ui-widget,  kind: ui-layer, order: 3 }
      - { id: ui-page,    kind: ui-layer, order: 4 }
    rules:
      cross_layer:
        - { from: ui-page,    allow: [ui-widget, ui-feature, ui-entity, shared] }
        - { from: ui-widget,  allow: [ui-feature, ui-entity, shared] }
        - { from: ui-feature, allow: [ui-entity, shared, domain] }
        - { from: ui-entity,  allow: [shared] }
        - { from: domain,     allow: [shared] }
        - { from: shared,     allow: [] }
      same_layer: prohibited
      public_entry_required: true
slice_internal:
  slice-internal-ts:
    sub_layers: [presentation, application, domain, infrastructure]
    rules:
      - { from: presentation, allow: [application, domain] }
      - { from: application,  allow: [domain, infrastructure] }
      - { from: domain,       allow: [] }
      - { from: infrastructure, allow: [domain] }
cross_slice:
  prohibited_direct: true
  via: [shared/contracts, shared/events]
---

# Architecture (ddd-typescript template)

This file is the **single source of truth** for the project's allowed
dependency graph. The `ori arch export --adapter=eslint` command compiles
the frontmatter above into `eslint.config.ori.js`; your `eslint.config.js`
just spreads it.

## Layout

```
src/
├── lib/
│   ├── shared/              # cross-slice primitives (types, events, contracts)
│   │   ├── types/           # Result, branded types, etc.
│   │   ├── events/          # base DomainEvent shape
│   │   └── contracts/       # cross-slice ports / event payload contracts
│   └── <slice>/             # one folder per domain slice — `tasks/` is the worked example
│       ├── index.ts         # PUBLIC API — the only file other slices may import
│       ├── domain/
│       ├── application/
│       ├── infrastructure/
│       ├── presentation/
│       └── tests/
├── ui-entity/               # FSD layer 1 — display models / atomic visuals
│   └── <slice>/index.ts     # may import only from shared
├── ui-feature/              # FSD layer 2 — user-facing actions
│   └── <slice>/index.ts     # may import lib/<slice>/index.ts (domain public API)
├── ui-widget/               # FSD layer 3 — composed UI blocks
│   └── <slice>/index.ts     # may import ui-feature, ui-entity, shared
└── ui-page/                 # FSD layer 4 — top-level screens
    └── <slice>/index.ts     # may import ui-widget, ui-feature, ui-entity, shared
```

## Rules

### Backend (domain) slices

- **Cross-slice direct imports are prohibited.** If slice A needs something
  from slice B, declare the shape in `shared/contracts/` (or emit a domain
  event via `shared/events/`) and have both sides depend on the contract.
- **Each slice has exactly one public entry**: `index.ts`. Importing
  `tasks/domain/task.js` from outside the `tasks/` slice is a violation.
- **`shared/` may not import from any slice** — it sits below everything.

### UI layers (FSD)

The four UI layers form a strict one-way pipeline
`ui-page → ui-widget → ui-feature → ui-entity → shared`. Lower layers may
never import from higher layers, and **same-layer imports are prohibited**
(e.g., one `ui-widget` slice may not import from another `ui-widget` slice).

- **`ui-feature` is the only UI layer permitted to import a domain slice**
  (`lib/<slice>/index.ts`). Other UI layers stay UI-pure and receive view
  models from `ui-feature` outputs.
- **Each UI slice exposes one public entry**: `index.ts`. Cross-slice imports
  must hit the slice's `index.ts`, never an internal file.
- Cross-UI state should live in `shared/` (a Zustand slice, URL params, or a
  query client) rather than being shared by sibling imports.

Regenerate after editing this file:

```bash
pnpm exec ori arch export --adapter=eslint
```
