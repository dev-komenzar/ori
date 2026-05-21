# @ori-ori/arch-adapter-eslint

Compiles `.ori/architecture.md` into an [`eslint-plugin-boundaries`](https://github.com/javierbrea/eslint-plugin-boundaries) flat config (`eslint.config.ori.js`).

## Install

```bash
pnpm add -D @ori-ori/arch-adapter-eslint eslint eslint-plugin-boundaries
```

## Use

Generate the config:

```bash
ori arch export --adapter=eslint
```

Then spread the generated config into your project's `eslint.config.js`:

```js
import oriArch from "./eslint.config.ori.js";
export default [...oriArch, /* your project rules */];
```

## What it enforces (v0.1)

- **Cross-layer rules** (one allow-list per source layer; everything else denied).
- **Cross-slice isolation** via `eslint-plugin-boundaries`' `sliceName` capture — direct imports between slices under `<slice_root>/` are flagged. Cross-slice traffic must go through `shared/contracts/` or `shared/events/`.
- **Public-entry hint** via `boundaries/no-private` (importing into the inside of a slice is flagged; the public surface is the slice folder's index).

## Layer → filesystem convention (v0.1)

The v1 schema does not include per-layer paths, so the adapter uses:

| Layer kind   | Path pattern                                |
|--------------|---------------------------------------------|
| `shared`     | `<root.path>/<root.slice_root>/<id>/**`     |
| `slice`      | `<root.path>/<root.slice_root>/*/**` (captured as `sliceName`) |
| `ui-layer`   | `<root.path>/<id>/**` (layer id is the directory name) |

For example, with `path: src`, `slice_root: lib`:

- `shared` → `src/lib/shared/**`
- `domain` (a slice) → `src/lib/<slice>/**`
- `ui-entity` → `src/ui-entity/**`

## What's deferred to v0.2

- Slice-internal sub-layer enforcement (`presentation → application → domain`).
- Per-layer path overrides in the schema (would replace the convention above).
- Adapter `check()` method — for now, users run `eslint .` themselves.
