---
version: 1
workspace:
  apps_root: apps
  apps:
    - name: {{APP_NAME}}
      path: apps/{{APP_NAME}}
root:
  app: {{APP_NAME}}
  path: apps/{{APP_NAME}}/src
  language: typescript
  layer_set: ddd-vsa-hex-ts
  adapter: eslint
  slice_root: {{BC_NAME}}
  slice_subdir: slices
  public_entry: index.ts
layer_sets:
  ddd-vsa-hex-ts:
    layers:
      - { id: shared,    kind: shared }
      - { id: domain,    kind: slice, slice_internal: slice-internal-ts }
      - { id: ui-widget, kind: ui-layer, order: 1 }
      - { id: ui-page,   kind: ui-layer, order: 2 }
    rules:
      cross_layer:
        - { from: ui-page,    allow: [ui-widget, shared, domain] }
        - { from: ui-widget,  allow: [shared, domain] }
        - { from: domain,     allow: [shared] }
        - { from: shared,     allow: [] }
      same_layer: prohibited
      public_entry_required: true
slice_internal:
  slice-internal-ts:
    sub_layers: [domain, application, infrastructure, presentation, tests]
    rules:
      - { from: presentation,   allow: [application, domain] }
      - { from: application,    allow: [domain] }
      - { from: infrastructure, allow: [domain] }
      - { from: domain,         allow: [] }
      - { from: tests,          allow: [domain, application, infrastructure, presentation] }
cross_slice:
  prohibited_direct: true
  via: [shared/contracts, shared/events]
cross_bc:
  via: [apps/{{APP_NAME}}/src/shared/contracts, apps/{{APP_NAME}}/src/shared/events]
  same_event_bus: true
page_map_marker: phase-11b
---

# Architecture ({{APP_NAME}} — ddd-vsa-hex / typescript)

This file is the **single source of truth** for the project's allowed
dependency graph. The `/ori-arch` skill (`node .apm/skills/ori-arch/scripts/export.js --adapter=eslint`) compiles
the frontmatter above into `eslint.config.ori.js`; your `eslint.config.js`
just spreads it.

## Layout

```
apps/{{APP_NAME}}/src/
├── {{BC_NAME}}/                        # BC (slice_root). One folder per BC.
│   ├── shared/                         # BC-internal shared layer (kind: shared)
│   │   ├── types/                      # Result, branded types
│   │   ├── events/                     # base DomainEvent shape
│   │   └── contracts/                  # cross-slice contracts (empty by default)
│   └── slices/                         # slice_subdir = slices (design.md §17)
│       └── <slice-id>/                 # 1 slice per use case
│           ├── index.ts                # PUBLIC API — the only file other slices may import
│           ├── domain/                 # aggregates, VOs, events (pure)
│           ├── application/            # use-case orchestration
│           ├── infrastructure/         # adapters, persistence, I/O
│           ├── presentation/           # view models / pure render
│           └── tests/
├── ui-widget/                          # ddd-vsa-hex ui-layer (order 1)
│   └── <widget>/index.ts
├── ui-page/                            # ddd-vsa-hex ui-layer (order 2)
│   └── <page>/index.ts
└── __tests__/
    └── <e2e>.test.ts                   # end-to-end demo (page -> widget -> slice)
```

See `.apm/contexts/patterns/ddd-vsa-hex/stacks/typescript/example-slice/` for
a worked TS slice (`complete-task`) — AI agents read it on demand when
generating new slices.

## Rules

### Slice layer (`kind: slice`, slice_root = `{{BC_NAME}}`)

- **Cross-slice direct imports are prohibited.** If slice A needs something
  from slice B, declare the shape in `{{BC_NAME}}/shared/contracts/` (or
  emit a domain event via `{{BC_NAME}}/shared/events/`) and have both
  sides depend on the contract.
- **Each slice has exactly one public entry**: `index.ts`. Importing
  `slices/<slice-id>/domain/<file>.js` from outside the slice is a violation.
- **`{{BC_NAME}}/shared/` may not import from any slice** — it sits
  below everything in the BC.

### Slice-internal sub-layers

Inside a slice the pipeline is one-way:
`presentation -> application -> domain` and `infrastructure -> domain`.
`tests/` may reach into any sub-layer.

### UI layers (ddd-vsa-hex)

The two UI layers form a one-way pipeline
`ui-page -> ui-widget -> shared/domain`. Same-layer imports are prohibited
(e.g., one `ui-widget` may not import from another `ui-widget`).

- UI layers consume slices through the slice's public `index.ts`. They never
  reach into a slice's `domain/`, `application/`, etc. directly.
- Cross-UI state should live in a slice's `presentation/` (or a dedicated
  shared store) rather than be shared by sibling imports.

Regenerate after editing this file:

```bash
node .apm/skills/ori-arch/scripts/export.js --adapter=eslint
```

## Page Map

<!-- BEGIN ori-distill phase-11b auto-generated; do not edit between markers -->
<!-- (empty until phase 11b runs on .ori/domain/ui-fields/) -->
<!-- END ori-distill phase-11b auto-generated -->
