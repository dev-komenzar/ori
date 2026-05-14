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
      - { id: shared, kind: shared }
      - { id: domain, kind: feature, feature_internal: feature-internal-ts }
    rules:
      cross_layer:
        - { from: domain, allow: [shared] }
        - { from: shared, allow: [] }
      same_layer: prohibited
      public_entry_required: true
feature_internal:
  feature-internal-ts:
    sub_layers: [presentation, application, domain, infrastructure]
    rules:
      - { from: presentation, allow: [application, domain] }
      - { from: application,  allow: [domain, infrastructure] }
      - { from: domain,       allow: [] }
      - { from: infrastructure, allow: [domain] }
cross_feature:
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
└── lib/
    ├── shared/              # cross-feature primitives (types, events, contracts)
    │   ├── types/           # Result, branded types, etc.
    │   ├── events/          # base DomainEvent shape
    │   └── contracts/       # cross-feature ports / event payload contracts
    └── <feature>/           # one folder per feature — `tasks/` is the worked example
        ├── index.ts         # PUBLIC API — the only file other features may import
        ├── domain/
        ├── application/
        ├── infrastructure/
        ├── presentation/
        └── tests/
```

## Rules

- **Cross-feature direct imports are prohibited.** If feature A needs something
  from feature B, declare the shape in `shared/contracts/` (or emit a domain
  event via `shared/events/`) and have both sides depend on the contract.
- **Each feature has exactly one public entry**: `index.ts`. Importing
  `tasks/domain/task.js` from outside the `tasks/` feature is a violation.
- **`shared/` may not import from any feature** — it sits below everything.

Regenerate after editing this file:

```bash
pnpm exec ori arch export --adapter=eslint
```
