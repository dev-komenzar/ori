---
version: 1
workspace:
  apps_root: apps
  apps:
    - name: myapp
      path: apps/myapp
root:
  app: myapp
  path: apps/myapp/src
  language: typescript
  layer_set: ddd-vsa-hex-ts
  adapter: eslint
  slice_root: task-management
  slice_subdir: slices
  public_entry: index.ts
layer_sets:
  ddd-vsa-hex-ts:
    layers:
      - { id: shared, kind: shared }
      - { id: domain, kind: slice, slice_internal: slice-internal-ts }
      - { id: ui-widget, kind: ui-layer, order: 1 }
      - { id: ui-page, kind: ui-layer, order: 2 }
    rules:
      cross_layer:
        - { from: ui-page, allow: [ui-widget, shared, domain] }
        - { from: ui-widget, allow: [shared, domain] }
        - { from: domain, allow: [shared] }
        - { from: shared, allow: [] }
      same_layer: prohibited
      public_entry_required: true
slice_internal:
  slice-internal-ts:
    sub_layers: [domain, application, infrastructure, presentation, tests]
    rules:
      - { from: presentation, allow: [application, domain] }
      - { from: application, allow: [domain] }
      - { from: infrastructure, allow: [domain] }
      - { from: domain, allow: [] }
      - { from: tests, allow: [domain, application, infrastructure, presentation] }
cross_slice:
  prohibited_direct: true
  via: [shared/contracts, shared/events]
cross_bc:
  via: [apps/myapp/src/shared/contracts, apps/myapp/src/shared/events]
  same_event_bus: true
page_map_marker: phase-11b
phase_hooks: {}
decisions:
  platforms: [web]
  os_integration: none
  ui_native: web
  language: typescript
---

# Architecture (myapp — ddd-vsa-hex / typescript)

This file is the **single source of truth** for the project's allowed dependency
graph. The `/ori-arch` skill compiles the frontmatter above into
`eslint.config.ori.js`; your `eslint.config.js` just spreads it.

## Decisions

- platforms: web
- os_integration: none
- ui_native: web
- language: typescript

## Layout

```
apps/myapp/src/
├── task-management/                # BC (slice_root). One folder per BC.
│   ├── shared/                     # BC-internal shared layer (kind: shared)
│   │   ├── types/                  # Result, branded types
│   │   ├── events/                 # base DomainEvent shape
│   │   └── contracts/              # cross-slice contracts (empty by default)
│   └── slices/                     # slice_subdir = slices
│       └── <slice-id>/             # 1 slice per use case
│           ├── index.ts            # PUBLIC API — the only file other slices may import
│           ├── domain/
│           ├── application/
│           ├── infrastructure/
│           ├── presentation/
│           └── tests/
├── ui-widget/                      # ddd-vsa-hex ui-layer (order 1)
├── ui-page/                        # ddd-vsa-hex ui-layer (order 2)
└── __tests__/
```

## Rules

- **Cross-slice direct imports are prohibited.** If slice A needs something from
  slice B, declare the shape in `task-management/shared/contracts/` (or emit a
  domain event via `task-management/shared/events/`) and have both sides depend
  on the contract.
- **Each slice has exactly one public entry**: `index.ts`. Importing
  `slices/<slice-id>/domain/<file>.js` from outside the slice is a violation.
- **`task-management/shared/` may not import from any slice** — it sits below
  everything in the BC.
- Inside a slice the pipeline is one-way:
  `presentation -> application -> domain` and `infrastructure -> domain`.
  `tests/` may reach into any sub-layer.
- UI layers form a one-way pipeline `ui-page -> ui-widget -> shared/domain`.
  Same-layer imports are prohibited. UI layers consume slices through the
  slice's public `index.ts` only.

Regenerate after editing this file:

```bash
node .apm/skills/ori-arch/scripts/export.js --adapter=eslint
```