# ddd-typescript template

A minimal **feature-sliced** TypeScript DDD scaffold. Each feature owns its
own pipeline (`domain → application → infrastructure → presentation`) and
exposes only `index.ts` to the rest of the world. Cross-feature collaboration
goes through `shared/contracts/` or `shared/events/`; direct feature-to-feature
imports are prohibited.

## Layout

```
<project>/
├── .ori/architecture.md          # SSoT for the dependency graph (compiled to eslint)
├── eslint.config.js              # spreads ./eslint.config.ori.js + your rules
├── vitest.config.ts
├── tsconfig.json
└── src/
    └── lib/
        ├── shared/
        │   ├── types/            # Result, branded types
        │   ├── events/           # base DomainEvent shape
        │   └── contracts/        # cross-feature ports (empty by default)
        └── tasks/                # one worked example feature
            ├── index.ts          # PUBLIC API — only file other features may import
            ├── domain/           # aggregates, VOs, events (pure)
            ├── application/      # use-case orchestration (when needed)
            ├── infrastructure/   # adapters, persistence, I/O
            ├── presentation/     # UI bindings (when needed)
            └── tests/
```

## Getting started

```bash
pnpm install
pnpm arch:export      # regenerate eslint.config.ori.js from .ori/architecture.md
pnpm test
pnpm lint
```

## Conventions

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

See `.ori/architecture.md` for the machine-readable rules.
