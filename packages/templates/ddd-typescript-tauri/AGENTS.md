# AGENTS.md — instructions for AI coding agents

Loaded by Codex, OpenCode, Cursor, and other AI coding tools that read
`AGENTS.md`. Claude Code users: see [CLAUDE.md](./CLAUDE.md) for an
expanded version of the same content.

## Project shape (read first)

Feature-sliced TypeScript + Rust (Tauri 2) DDD scaffold. Machine-readable
architecture lives in [.ori/architecture.md](.ori/architecture.md); lint
configs (`eslint.config.ori.js`, `src-tauri/tests/arch.rs`) are
**generated** from it.

```
src/<lib|ui-*>/...        # TS frontend (FSD: ui-page → ui-widget → ui-feature → ui-entity → shared)
src-tauri/src/features/   # Rust backend (one folder per feature; mod.rs is the public API)
```

One feature = one folder on each side. A feature's `index.ts` (TS) /
`mod.rs` (Rust) is the **sole** public API; nothing else may be imported
from outside the feature.

## DO / DON'T

### DO

- Use the generated bindings for Rust calls:
  `import { completeTaskCmd } from "@/lib/shared/ipc/bindings";`
- Add new `#[tauri::command]` functions to
  `src-tauri/src/features/<feature>/commands.rs` and register them in
  the `collect_commands![...]` macro in `src-tauri/src/lib.rs`.
- Regenerate `src/lib/shared/ipc/bindings.ts` by running `pnpm tauri
  dev` after adding/renaming/removing a command, and commit the result.
- Put cross-feature contracts in `src/lib/shared/contracts/` (TS) or
  `features::shared` (Rust). Use domain events for asynchronous fan-out.
- Run `pnpm lint` and `pnpm test:rs` before declaring a change complete.

### DON'T

- Don't `import { invoke } from "@tauri-apps/api/core"` from any UI
  layer. The eslint adapter fails on raw-invoke calls.
- Don't reach into `src/lib/<feature>/domain/...` from outside the
  feature. Public API is `index.ts` only.
- Don't scatter `#[tauri::command]` attributes across feature files.
  They all live in `commands.rs`; `collect_commands![...]` references
  paths like `features::tasks::complete_task_cmd`.
- Don't directly import another feature's module. Cross-feature
  collaboration goes through `shared/contracts/`, `shared/events/`, or
  Tauri commands.
- Don't edit `src/lib/shared/ipc/bindings.ts` by hand — `tauri dev`
  regenerates it.
- Don't edit `src-tauri/Cargo.toml`/`tauri.conf.json` for things Tauri
  CLI manages (allowlist, build commands, identifiers). Use
  `tauri add` / `tauri migrate` instead — these files are owned by
  `tauri init` / `tauri-cli`, not by the ori template.

## Feature-internal layering (one-way)

```
presentation → application → domain ← infrastructure
```

- `domain/`: pure (no I/O, no framework imports).
- `application/`: orchestrates domain ops; depends on `domain`,
  `infrastructure`.
- `infrastructure/`: implements ports defined in `domain`.
- `presentation/` (TS) or `commands.rs` (Rust): the outward-facing layer.

The arch-adapter-eslint (TS) and arch-adapter-rust (Rust) enforce this.

## Cross-feature collaboration

Prohibited: direct imports. Allowed channels:

| TS                        | Rust                       |
| ------------------------- | -------------------------- |
| `shared/contracts/<x>`    | `features::shared`         |
| `shared/events/<event>`   | `features::shared::events` |
| `shared/ipc/bindings.ts`  | `commands.rs`              |

## Adding a Tauri command — checklist

- [ ] Application function in `features/<feature>/application.rs`
- [ ] `#[tauri::command] #[specta::specta]` wrapper in
      `features/<feature>/commands.rs`
- [ ] Path added to `collect_commands![...]` in `src-tauri/src/lib.rs`
- [ ] `pnpm tauri dev` once → `src/lib/shared/ipc/bindings.ts` updated
- [ ] Committed the regenerated `bindings.ts`

## After editing `.ori/architecture.md`

```bash
pnpm arch:export   # rewrites eslint.config.ori.js and src-tauri/tests/arch.rs
```

These generated files are gitignored. The frontmatter in `architecture.md`
is the source of truth — recompile, don't hand-edit.

## Quality gates

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:rs
pnpm bindings:check   # detects tauri-specta drift; CI enforces this
```
