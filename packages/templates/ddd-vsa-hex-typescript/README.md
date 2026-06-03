# ddd-vsa-hex-typescript template

A minimal **DDD-VSA-Hex** TypeScript scaffold aligned with the design SSoT
(`docs/design.md` §6 / §12 / §17). Each domain slice owns its own pipeline
(`domain -> application -> infrastructure -> presentation -> tests`) and
exposes only `index.ts` to the rest of the project. UI composition is done
through the two-layer pipeline `ui-page -> ui-widget`. Cross-slice
collaboration goes through `task-management/shared/contracts/` or
`task-management/shared/events/`; direct slice-to-slice imports are
prohibited.

## Layout

```
<project>/
├── .ori/architecture.md                       # SSoT for the dependency graph
├── eslint.config.js                           # spreads ./eslint.config.ori.js + your rules
├── vitest.config.ts
├── tsconfig.json
└── apps/
    └── template-app/                          # default app (rename to your project folder name)
        └── src/
            ├── task-management/               # BC (slice_root)
            │   ├── shared/                    # BC-internal shared (kind: shared)
            │   │   ├── types/                 # Result, branded types
            │   │   ├── events/                # base DomainEvent shape
            │   │   └── contracts/             # cross-slice contracts (empty by default)
            │   └── slices/                    # slice_subdir = slices
            │       └── complete-task/         # one worked slice
            │           ├── index.ts           # PUBLIC API — only file other slices may import
            │           ├── domain/            # aggregates, VOs, events (pure)
            │           ├── application/       # use-case orchestration
            │           ├── infrastructure/    # adapters, persistence, I/O
            │           ├── presentation/      # view models / pure render
            │           └── tests/
            ├── ui-widget/                     # ddd-vsa-hex ui-layer (order 1)
            │   └── task-list/index.ts
            ├── ui-page/                       # ddd-vsa-hex ui-layer (order 2)
            │   └── tasks/index.ts
            └── __tests__/
                └── ui-flow.test.ts            # end-to-end demo
```

`apps/template-app/` is a placeholder; `/ori-init` sanitizes the repo folder
name into an app name and `.ori/config.yaml` records `workspace.apps[]`.

## Getting started

```bash
pnpm install
pnpm arch:export      # regenerate eslint.config.ori.js from .ori/architecture.md
pnpm test
pnpm lint
```

## Conventions

### Slices (`kind: slice`)

- **Value Objects** are branded types with a Smart Constructor returning
  `Result<T, Error>`. See
  `apps/template-app/src/task-management/slices/complete-task/domain/task-id.ts`.
- **Aggregates** are pure: command functions take state, return
  `{ state, events }`. Side effects live in `infrastructure/`.
- **Public API**: a slice's `index.ts` is the only file that may be imported
  from outside the slice. `eslint-plugin-boundaries` (via the ori adapter)
  enforces this.
- **Cross-slice traffic**: define a contract in
  `task-management/shared/contracts/` or publish/subscribe via
  `task-management/shared/events/`. Never `import` a sibling slice directly.

### Slice-internal pipeline

```
presentation -> application -> domain
infrastructure -> domain
tests -> {domain, application, infrastructure, presentation}
```

- `domain/` is pure (no I/O, no framework deps).
- `application/` orchestrates domain commands; depends only on `domain/`.
- `infrastructure/` implements ports from `domain/` (repositories, gateways).
- `presentation/` derives view models from `domain/` and may call
  `application/` (e.g. a presenter that issues a command).

### UI layers (ddd-vsa-hex)

- One-way dependency: `ui-page -> ui-widget -> {shared, domain}`.
- UI layers consume slices via the slice public `index.ts`.
- **Same-layer imports are prohibited** — siblings inside `ui-widget/` may
  not reach each other directly; share through a slice or via app-level
  `shared/`.
- Each UI directory (e.g. `ui-widget/task-list/`) has one public entry
  (`index.ts`); internal files are not importable from outside.

See `.ori/architecture.md` for the machine-readable rules.
