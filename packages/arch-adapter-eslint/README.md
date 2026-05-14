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
- **Cross-feature isolation** via `eslint-plugin-boundaries`' `featureName` capture — direct imports between features under `<feature_root>/` are flagged. Cross-feature traffic must go through `shared/contracts/` or `shared/events/`.
- **Public-entry hint** via `boundaries/no-private` (importing into the inside of a feature is flagged; the public surface is the feature folder's index).

## Layer → filesystem convention (v0.1)

The v1 schema does not include per-layer paths, so the adapter uses:

| Layer kind   | Path pattern                                |
|--------------|---------------------------------------------|
| `shared`     | `<root.path>/<root.feature_root>/<id>/**`   |
| `feature`    | `<root.path>/<root.feature_root>/*/**` (captured as `featureName`) |
| `ui-layer`   | `<root.path>/<id>/**` (layer id is the directory name) |

For example, with `path: src`, `feature_root: lib`:

- `shared` → `src/lib/shared/**`
- `domain` (a feature) → `src/lib/<feature>/**`
- `ui-entity` → `src/ui-entity/**`

## What's deferred to v0.2

- Feature-internal sub-layer enforcement (`presentation → application → domain`).
- Per-layer path overrides in the schema (would replace the convention above).
- Adapter `check()` method — for now, users run `eslint .` themselves.
