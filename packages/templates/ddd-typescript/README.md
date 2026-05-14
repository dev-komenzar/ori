# ddd-typescript template

A minimal **feature-sliced** TypeScript DDD scaffold. Each domain feature owns
its own pipeline (`domain → application → infrastructure → presentation`) and
exposes only `index.ts` to the rest of the world. The UI side mirrors that
discipline with the FSD layers `ui-entity → ui-feature → ui-widget → ui-page`.
Cross-feature collaboration goes through `shared/contracts/` or
`shared/events/`; direct feature-to-feature imports are prohibited.

## Layout

```
<project>/
├── .ori/architecture.md          # SSoT for the dependency graph (compiled to eslint)
├── eslint.config.js              # spreads ./eslint.config.ori.js + your rules
├── vitest.config.ts
├── tsconfig.json
└── src/
    ├── lib/
    │   ├── shared/
    │   │   ├── types/            # Result, branded types
    │   │   ├── events/           # base DomainEvent shape
    │   │   └── contracts/        # cross-feature ports (empty by default)
    │   └── tasks/                # one worked domain feature
    │       ├── index.ts          # PUBLIC API — only file other features may import
    │       ├── domain/           # aggregates, VOs, events (pure)
    │       ├── application/      # use-case orchestration (when needed)
    │       ├── infrastructure/   # adapters, persistence, I/O
    │       ├── presentation/     # UI bindings (when needed)
    │       └── tests/
    ├── ui-entity/                # FSD layer 1 — display models / atomic visuals
    │   └── task-card/index.ts
    ├── ui-feature/               # FSD layer 2 — user-facing actions (allowed to import a domain feature)
    │   └── complete-task/index.ts
    ├── ui-widget/                # FSD layer 3 — composed UI blocks
    │   └── task-list/index.ts
    ├── ui-page/                  # FSD layer 4 — top-level screens
    │   └── tasks/index.ts
    └── __tests__/
        └── ui-flow.test.ts       # end-to-end demo wiring page → widget → feature → domain
```

## Getting started

```bash
pnpm install
pnpm arch:export      # regenerate eslint.config.ori.js from .ori/architecture.md
pnpm test
pnpm lint
```

## Conventions

### Backend (domain) features

- **Value Objects** are branded types with a Smart Constructor returning
  `Result<T, Error>`. See `tasks/domain/task-id.ts`.
- **Aggregates** are pure: command functions take state, return
  `{ state, events }`. Side effects live in `infrastructure/`.
- **Public API**: a feature's `index.ts` is the only file that may be imported
  from outside the feature. `eslint-plugin-boundaries` (via the ori adapter)
  enforces this.
- **Cross-feature traffic**: define a contract in `shared/contracts/` or
  publish/subscribe via `shared/events/`. Never `import` a sibling feature
  directly.

### UI layers (FSD)

- One-way dependency: `ui-page → ui-widget → ui-feature → ui-entity → shared`.
- **Only `ui-feature` may import a domain feature** via `lib/<feature>/index.js`.
  Other UI layers stay UI-pure and consume the view models the feature returns.
- **Same-layer imports are prohibited** — siblings inside `ui-widget/` may not
  reach each other directly; share through `ui-feature` or `shared/`.
- Each UI slice has one public entry (`index.ts`); internal files are not
  importable from outside the slice.

See `.ori/architecture.md` for the machine-readable rules.
