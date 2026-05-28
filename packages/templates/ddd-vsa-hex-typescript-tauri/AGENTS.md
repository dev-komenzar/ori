# AGENTS.md — instructions for AI coding agents

Loaded by Codex, OpenCode, Cursor, and other AI coding tools that read
`AGENTS.md`. Claude Code users: see [CLAUDE.md](./CLAUDE.md) for an
expanded version of the same content.

## Project shape (read first)

DDD-VSA-Hex TypeScript + Rust (Tauri 2) scaffold. Machine-readable
architecture lives in [.ori/architecture.md](.ori/architecture.md); lint
configs (`eslint.config.ori.js`,
`apps/template-app/src-tauri/tests/arch.rs`) are **generated** from it.

```
apps/<app>/src/<bc>/...               # TS frontend (ddd-vsa-hex: ui-page -> ui-widget -> {shared, domain})
apps/<app>/src-tauri/src/<bc>/...     # Rust backend (one folder per BC; mod.rs is the public API)
```

One slice = one folder on each side, under `<bc>/slices/<slice-id>/`. A
slice's `index.ts` (TS) / `mod.rs` (Rust) is the **sole** public API;
nothing else may be imported from outside the slice.

## DO / DON'T

### DO

- Use the generated bindings for Rust calls:
  `import { completeTaskCmd } from "@/task-management/shared/ipc/bindings";`
- Add new `#[tauri::command]` functions to
  `apps/<app>/src-tauri/src/<bc>/slices/<slice>/commands.rs` and register
  them in the `collect_commands![...]` macro in
  `apps/<app>/src-tauri/src/lib.rs`.
- Regenerate `apps/<app>/src/<bc>/shared/ipc/bindings.ts` by running
  `pnpm tauri dev` after adding/renaming/removing a command, and commit
  the result.
- Put cross-slice contracts in `apps/<app>/src/<bc>/shared/contracts/`
  (TS) or `<bc>::shared` (Rust). Use domain events for asynchronous
  fan-out.
- Run `pnpm lint` and `pnpm test:rs` before declaring a change complete.

### DON'T

- Don't `import { invoke } from "@tauri-apps/api/core"` from any UI
  layer. The eslint adapter fails on raw-invoke calls.
- Don't reach into `apps/<app>/src/<bc>/slices/<slice>/domain/...` from
  outside the slice. Public API is `index.ts` only.
- Don't scatter `#[tauri::command]` attributes across slice files. They
  all live in `commands.rs`; `collect_commands![...]` references paths
  like `task_management::slices::complete_task::complete_task_cmd`.
- Don't directly import another slice's module. Cross-slice
  collaboration goes through `shared/contracts/`, `shared/events/`, or
  Tauri commands.
- Don't edit `apps/<app>/src/<bc>/shared/ipc/bindings.ts` by hand —
  `tauri dev` regenerates it.
- Don't edit `apps/<app>/src-tauri/Cargo.toml`/`tauri.conf.json` for
  things Tauri CLI manages (allowlist, build commands, identifiers). Use
  `tauri add` / `tauri migrate` instead — these files are owned by
  `tauri init` / `tauri-cli`, not by the ori template.

## Slice-internal layering (one-way)

```
presentation -> application -> domain
infrastructure -> domain
```

- `domain/`: pure (no I/O, no framework imports).
- `application/`: orchestrates domain ops; depends on `domain` (and may
  reach `infrastructure` only via ports declared in `domain`).
- `infrastructure/`: implements ports defined in `domain`.
- `presentation/` (TS) or `commands.rs` (Rust): the outward-facing layer.

The arch-adapter-eslint (TS) and arch-adapter-rust (Rust) enforce this.

## Cross-slice collaboration

Prohibited: direct imports. Allowed channels:

| TS                                          | Rust                                |
| ------------------------------------------- | ----------------------------------- |
| `<bc>/shared/contracts/<x>`                 | `<bc>::shared`                      |
| `<bc>/shared/events/<event>`                | `<bc>::shared::events`              |
| `<bc>/shared/ipc/bindings.ts`               | `commands.rs`                       |

## Adding a Tauri command — checklist

- [ ] Application function in `<bc>/slices/<slice>/application.rs`
- [ ] `#[tauri::command] #[specta::specta]` wrapper in
      `<bc>/slices/<slice>/commands.rs`
- [ ] Path added to `collect_commands![...]` in
      `apps/<app>/src-tauri/src/lib.rs`
- [ ] `pnpm tauri dev` once → `<bc>/shared/ipc/bindings.ts` updated
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
