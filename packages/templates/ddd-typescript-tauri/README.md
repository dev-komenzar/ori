# DDD TypeScript + Tauri Template

This template scaffolds a Tauri 2 desktop application with a TypeScript
frontend and a Rust backend, organised by Bounded Context.

## Layout

```
<project>/
├── src/                                # TypeScript frontend
│   ├── contexts/                       # one folder per Bounded Context
│   │   └── <bc>/
│   │       ├── domain/
│   │       │   ├── aggregates/         # aggregate roots (one per file)
│   │       │   ├── value-objects/      # branded VO types + Smart Constructors
│   │       │   ├── events/             # domain events
│   │       │   └── workflows/          # DMMF pipelines
│   │       ├── application/            # use-case orchestration (when needed)
│   │       └── infrastructure/         # Tauri command bindings, adapters
│   ├── shared-kernel/                  # cross-context shared types
│   └── ui/                             # React/etc. components (per UI feature)
├── src-tauri/                          # Tauri Rust backend
│   └── src/
│       ├── value_objects.rs            # Rust-side Smart Constructors
│       └── commands/                   # Tauri command handlers
└── tests/                              # vitest specs (mirrors src/contexts)
```

## Conventions

- Value Objects: branded types in TS, newtype structs in Rust. Smart Constructors return `Result<T, Error>`.
- Aggregates: command methods return `{ state, events }` (pure functions).
- Workflows: DMMF-style pipelines with explicit intermediate types between stages.
- Side effects only inside `infrastructure/` (Tauri commands, file I/O).
- Tests cite `spec.md` section ids via `describe('feature:<id>', ...)`.

See `.apm/instructions/ddd-typescript.instructions.md` for the full ruleset
applied automatically by any AI agent editing this layout.
