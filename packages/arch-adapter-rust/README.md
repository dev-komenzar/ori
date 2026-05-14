# @ori-ori/arch-adapter-rust

Compiles `.ori/architecture.md` into a self-contained Rust integration test (`tests/arch.rs`) that enforces architecture rules at `cargo test` time.

The generated test has **zero external dependencies** — it uses only `std`. Walks the source tree, regex-parses `use` statements, and panics on any rule violation.

## Install

```bash
pnpm add -D @ori-ori/arch-adapter-rust
```

## Use

```bash
# Generate the test file (lands at <crate-root>/tests/arch.rs)
ori arch export --adapter=rust --root=<rs-root-id>

# Then run the test
cd <crate-root>
cargo test --test arch
```

## Output location

| Spec `root.path`           | Generated file                    |
|----------------------------|-----------------------------------|
| `src`                      | `./tests/arch.rs`                 |
| `src-tauri/src`            | `src-tauri/tests/arch.rs`         |
| `crates/<name>/src`        | `crates/<name>/tests/arch.rs`     |

The adapter strips a trailing `/src` from `root.path` to find the Cargo crate root.

## What it enforces

- **Cross-layer rules** from `spec.layer_sets[<id>].rules.cross_layer`.
- **Cross-feature direct imports** (when `spec.cross_feature.prohibited_direct: true`).
- Resolves `use crate::x::y`, `use super::x`, `use self::x`. Bare `use my_crate::x` (external) is skipped.

## What's not enforced (v0.1)

- Feature-internal sub-layer rules (`presentation → application → domain`).
- `mod.rs as sole public entry` — the generated test does not verify this structurally (relies on convention).
- Bare module-level imports without `crate::` prefix (uncommon in 2018+ editions).

## CI tip

Re-export before testing to keep the rules file in sync with the spec:

```bash
ori arch export --adapter=rust --root=rs
cd src-tauri && cargo test --test arch
```

A pre-commit hook or CI job can fail the build when `arch.rs` is stale relative to `.ori/architecture.md`.
