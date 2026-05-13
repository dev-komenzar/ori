# @ori/templates

DDD code-generation templates used by `ori init --template <name>` and by
phase 4 (`impl-green`) of `ori feature run`.

## MVP

- **ddd-typescript-tauri**: TypeScript + Tauri 2 desktop app skeleton with
  the canonical `src/contexts/<bc>/{domain,application,infrastructure}/` layout.

## Roadmap

- `ddd-typescript-node`: pure-Node server (no Tauri)
- `ddd-rust`: Rust DDD (axum/actix backend or Tauri Rust side)
- `ddd-typescript-react`: React frontend without Tauri

Each template ships:

- `src/` skeleton (one example Bounded Context with Aggregate + VO + Workflow)
- `tests/` skeleton (vitest + property tests)
- `package.json` / `tsconfig.json` / linter configs
- Top-level README explaining the layout

The CLI copies the template into the target project with placeholder
substitution; the AI is expected to fill in the actual content during
phase 4.
