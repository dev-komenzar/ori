# @ori-ori/arch-adapter-generic

Language-neutral fallback adapter for `ori arch`. Parses imports via per-language regex and checks against `.ori/architecture.md` rules — used when no native linter integration exists for the target language.

> Precision is per-file regex, not AST. Use a native adapter (`eslint`, `dependency-cruiser`, `rust`) when available. This adapter is the safety net.

## Install

```bash
pnpm add -D @ori-ori/arch-adapter-generic
```

## Use

```bash
# Emit .ori/arch-rules.json for inspection / debugging
ori arch export --adapter=generic

# Scan source files and report violations
ori arch check --adapter=generic
```

## Supported languages (v0.1)

| Language    | Import patterns recognised                                  |
|-------------|-------------------------------------------------------------|
| TypeScript / JavaScript | `import`, `import()`, `require()`, `export ... from` |
| Python      | `import x`, `from .x import y`, relative `..`               |
| Rust        | `use crate::x`, `use super::x`, `use self::x`               |
| Go          | `import "..."` (single + grouped)                           |
| Java        | `import x.y.z;` (incl. `import static`)                     |

Bare specifiers (e.g. `react`, `serde`) are ignored — external packages are out of scope.

## What it enforces

- **Cross-layer rules** from `spec.layer_sets[<id>].rules.cross_layer`.
- **Cross-feature isolation** — direct imports between two different features under the same `feature` layer are flagged with a dedicated `cross-feature` message.

## Layer → filesystem convention (v0.1)

Same convention as `@ori-ori/arch-adapter-eslint`:

| Layer kind   | Path prefix                                  |
|--------------|----------------------------------------------|
| `shared`     | `<root.path>/<root.feature_root>/<id>/`      |
| `feature`    | `<root.path>/<root.feature_root>/<feature>/` |
| `ui-layer`   | `<root.path>/<id>/`                          |

## What's deferred to v0.2

- Feature-internal sub-layer enforcement (`presentation → application → domain`).
- `tsconfig` path alias (`@/foo`) resolution — currently only relative imports resolve.
- Per-layer path overrides in the schema.
