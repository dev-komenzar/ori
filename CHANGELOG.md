# CHANGELOG

ori (織) — DDD-driven slice/page scaffolding with CoDD coherence.

ローカル変更ログ。npm scope は `@ori-ori/*`、monorepo 配下の全 publishable パッケージは同期 version で release する。

## Unreleased

### v0.3-M: `@ori-ori/parser` を private 化 (skill-only モデル徹底)

`@ori-ori/parser` の npm publish を停止し、Phase J の `@ori-ori/arch-adapter-*` と同じ「APM bundle 単独配布」方針に揃える。parser は ori 内部 skill (ori-arch / ori-doctor / arch-adapters) からのみ利用されており、外部 plugin consumer は実在しない。skill bundle は esbuild `bundle: true` で parser ソースをインライン化済のため、APM 利用者側に影響なし。

- **M1** ([`ori-1pe`](https://github.com/dev-komenzar/ori/issues)) — `packages/parser/package.json` に `"private": true` 追加 + `publishConfig` 削除 (pnpm workspace 内には残置、`workspace:*` 依存は従来通り)。既存 publish 済 `@ori-ori/parser@<=0.2.0` を npm deprecate 強化 (`scripts/npm-deprecate-parser.sh`)

破壊的変更:

- `pnpm add @ori-ori/parser` は v0.3 以降サポート対象外。APM 経由 (`apm install dev-komenzar/ori`) で配布される skill bundle 内に parser ロジックが embed されるため、外部から library として再利用する用途は廃止。必要なら architecture.md は markdown として直接 parse 可能 (deps: `gray-matter` / `mdast-util-from-markdown` 相当)。

### v0.3-K: runtime artifact を consuming skill bundle に co-locate

Phase K で旧 `.apm/contexts/` (cross-skill 共有 SSoT) を全廃し、runtime artifact (adapter bundle / pattern / schema / manifest テンプレ) を全て consuming skill bundle と同 tree に常駐させる layout に揃えた。各 resolver は `import.meta.url` 基準の bundle-adjacent 解決のみで完結する。

- **K1** ([`ori-6kd.2`](https://github.com/dev-komenzar/ori/issues)) — adapter bundle を `.apm/skills/ori-arch/adapters/` に co-locate。templates SSoT を `packages/arch-adapters/<name>/templates/` に格上げ。`resolveAdaptersDir` を `--adapters-dir` + bundle-adjacent の 2 候補のみに簡略化 (apm_modules walk / `$ORI_ADAPTERS_DIR` env / legacy parent-of-repo fallback を削除)
- **K2** ([`ori-6kd.4`](https://github.com/dev-komenzar/ori/issues)) — `architecture-md-schema.md` と `patterns/` を `.apm/skills/ori-arch/` 配下に co-locate、`resolvePatternsDir` を bundle-adjacent 1 候補に簡略化
- **K3** ([`ori-6kd.3`](https://github.com/dev-komenzar/ori/issues)) — `{slice,page}-manifest.yaml.tpl` を `.apm/skills/ori-flow/templates/` に co-locate、`loadTemplate` を bundle-adjacent (`dirname(import.meta.url)/../templates`) に変更、`skill-scripts-build.md` を `docs/skill-scripts-build.md` に移管、`.apm/contexts/` dir を物理撤去

### v0.3-J: npm package 廃止 → APM 単独配布

`@ori-ori/arch-adapter-*` を含む adapter は APM bundle (`.apm/skills/ori-arch/adapters/<name>/`) に統合され、npm 上の publish は停止します。配布は `apm install dev-komenzar/ori` のみ。

- **J1** ([`ori-apv`](https://github.com/dev-komenzar/ori/pull/34)) — adapter を「template + JSON injection」分離構造に再設計、当時は `.apm/contexts/adapters/{eslint,rust,generic}/` に bundle (Phase K1 で `.apm/skills/ori-arch/adapters/` に移動)、ori-arch skill は dynamic import で skill 隣接から解決
- **J2** ([`ori-osm`](https://github.com/dev-komenzar/ori/issues)) — 旧 `packages/arch-adapter-{eslint,rust,generic}/` を物理撤去。pnpm workspace から消失し、`pnpm -r publish` の対象外に。既存 publish 済 `@ori-ori/arch-adapter-{eslint,rust,generic}@0.2.0` は npm deprecate 強化 ([`ori-u5d`](https://github.com/dev-komenzar/ori/issues) 内包、`scripts/npm-deprecate-adapters.sh` 参照)

破壊的変更:

- `pnpm add -D @ori-ori/arch-adapter-eslint` 等は v0.3 以降サポート対象外。APM 経由 (`apm install dev-komenzar/ori`) で `.apm/skills/ori-arch/adapters/` を入手し、ori-arch skill (`node .apm/skills/ori-arch/scripts/export.js --adapter=eslint`) から利用すること

## v0.2.0 — 2026-06-03

Phase C (epic [`ori-5mi`](https://github.com/dev-komenzar/ori/issues)) で「`/ori-flow` execution gap を閉じる」を目標に進めた release。greenfield acceptance ([`ori-3ik`](https://github.com/dev-komenzar/ori/pull/14)) と promptnotes-vcsdd ドッグフード ([`ori-ywp`](https://github.com/dev-komenzar/ori/issues)) で /ori-flow が手動代替ゼロで完走することを確認済み。

### Highlights

- **`/ori-flow` 7-phase 自動実行** ([`ori-bdx`](https://github.com/dev-komenzar/ori/pull/8)) — `.apm/skills/ori-flow/SKILL.md` を 7 skill chain に薄化（手動順次呼出と差ゼロ）。`packages/slice-runner` で `sync → finalize` リネーム、`nextPhase / isValidPhase` ヘルパを追加
- **APM package 配布** ([`ori-ix4`](https://github.com/dev-komenzar/ori/pull/6)) — `apm install dev-komenzar/ori` で 31 skills + 1 agent + 7 rules + per-skill scripts/ が target project に展開される
- **skill-only `/ori-init`** ([`ori-1ih`](https://github.com/dev-komenzar/ori/pull/20)) — `ori init` CLI 経路を廃し、pure bash + 静的 YAML template の skill-only init に作り直し。CLI 拡張禁止方針（memory: `ori-execution-model-shift`）の最初の実装
- **`/ori-plan` skill が下流 beads issue を idempotent に bd create** ([`ori-zds`](https://github.com/dev-komenzar/ori/pull/21)) — AI が plan output から直接 bd issue を起票する手順を SKILL.md に inline 文書化。`bd show` の exit code 罠と `bd create --id` 上書き挙動への対策付き
- **`/ori-arch` skill** ([`ori-9gy / ori-ap7`](https://github.com/dev-komenzar/ori/pull/13)) — pattern / framework 決定 + template scaffold を skill 化、`ori init` → `/ori-arch` の 2-step 動線を確立

### Changes

- Template rename: `ddd-typescript` / `ddd-typescript-tauri` → `ddd-vsa-hex-typescript` / `ddd-vsa-hex-typescript-tauri` + 構造を [`design.md`](docs/design.md) §SSoT に整合 ([`ori-3n1`](https://github.com/dev-komenzar/ori/pull/11))
- Default code layout を `apps/<app>/src/contexts/<bc>/slices/<id>/` に変更 ([`ori-nwb`](https://github.com/dev-komenzar/ori/pull/10))
- Arch parser / adapter に `slice_subdir` を追加 ([`ori-3n1`](https://github.com/dev-komenzar/ori/pull/11))
- README / `docs/design.md` §19 を v0.3 CLI 廃止方針に整合 ([`ori-b5r`](https://github.com/dev-komenzar/ori/pull/22))
- bd workspace 共有手順ガイド ([`docs/acceptance/README.md`](docs/acceptance/README.md), [`ori-cvv`](https://github.com/dev-komenzar/ori/pull/19))
- `ori-derive` の `resolve-upstream.sh` が structured manifest (frontmatter + ID list) を parse できるよう修正 ([`ori-szx`](https://github.com/dev-komenzar/ori/pull/18))
- `/ori-init` 内で `bd init` を統合 ([`ori-ks7`](https://github.com/dev-komenzar/ori/pull/17))
- Templates の worked example Task を 3-value status (`todo / doing / done`) に migrate ([`ori-q58`](https://github.com/dev-komenzar/ori/pull/16))
- `/ori-flow` を 7 skill chain に薄化 ([`ori-bdx`](https://github.com/dev-komenzar/ori/pull/8))

### Fixes

- `ori --version` を `package.json` から読むよう変更 ([`ori-ulh`](https://github.com/dev-komenzar/ori/commit/496a977))
- `ori slice new / page new` から空 `tests/` subdir 作成を削除 ([`ori-8tx`](https://github.com/dev-komenzar/ori/commit/2b30a01))
- Tauri template に `infrastructure/.gitkeep` を復元 ([`ori-3n1`](https://github.com/dev-komenzar/ori/pull/11))
- Templates の cli pin を `^0.1.0` に固定 + `@types/node` + eslint placeholder 追加 ([`ori-aw6 / ori-1ui / ori-ou6`](https://github.com/dev-komenzar/ori/commit/862eb61))
- `/ori-init` の `create-skeleton.sh` を ori CLI wrapper として整備 ([`ori-05r`](https://github.com/dev-komenzar/ori/commit/ddf03da))
- `create-skeleton.sh` の `pnpm dlx` invocation syntax 修正 ([`ori-3ik` retry](https://github.com/dev-komenzar/ori/commit/82e79b9))
- `apm.yml` を repo root に配置（APM が `/apm.yml + /.apm/` レイアウトを期待） ([`ori-ix4`](https://github.com/dev-komenzar/ori/pull/6))

### Deferred to future brownfield epic

以下は Phase B dogfooding (`promptnotes-vcsdd`) で観測した brownfield-only friction で、greenfield acceptance を blocker としないため v0.2 scope 外。

- `ori-29p` — `/ori-test-red` 用 test infra auto-scaffold（既存 jest stack 尊重 / brownfield 起点）
- `ori-5wv` — brownfield migration helper（`/ori-migrate-domain` 等）
- `ori-6us` — 既存 DDD output 移行 5 ギャップ（`.ddd-session.json` / `implement.md` / coherence frontmatter 簡略化 / 旧 path 参照 / 日本語 anchor）

### Notes

- v0.2 = 「v0.3 で CLI を廃止する前に、現 CLI 構造のまま execution gap を閉じる」位置付け。v0.3 (epic [`ori-1ny`](https://github.com/dev-komenzar/ori/issues)) では `packages/cli/` 撤去 + skill scripts 移植を予定
- 全 publishable npm package (`@ori-ori/cli / parser / slice-runner / coherence / templates / arch-adapter-eslint / arch-adapter-rust / arch-adapter-generic`) を 0.2.0 に同期 bump
- 配布の SSoT は APM single package (`apm install dev-komenzar/ori`)。npm package は名前温存目的で残し、v0.3 で soft-deprecate する想定

## v0.1.0 — 2026-05-22

Phase B (epic `ori-qzq`) の dogfooding 開始版。`promptnotes-vcsdd` で `ori init` を初回実行し friction を 6 件起票 ([`ori-lft`](https://github.com/dev-komenzar/ori/issues)) → うち 2 件 (`ori-dmx` 空ディレクトリ `.gitkeep` / `ori-98v` 等) を Phase C 着手前に解消した。

### Highlights

- 全 monorepo パッケージを 0.0.1 → 0.1.0 に同期 bump ([`ori-okg`](https://github.com/dev-komenzar/ori/commit/2e00645))
- `feature` → `slice` / `page` リネーム ([`ori-0kw`](https://github.com/dev-komenzar/ori/commit/351b2d3))
- `ori init` 実装 (template copy + domain scaffold) ([`ori-ep5`](https://github.com/dev-komenzar/ori/commit/4dc0cab))
- 空 `.ori/` dir に `.gitkeep` を seed して VCS で追跡可能に ([`ori-dmx`](https://github.com/dev-komenzar/ori/pull/4))
- APM convention に合わせ CLI 依存を外し scripts/ を導入 ([commit `b410a95`](https://github.com/dev-komenzar/ori/commit/b410a95))

## v0.0.1 — 2026-05-13

npm scope `@ori-ori/` の name reservation 目的の placeholder release。実機能は scaffold 段階。

- `@ori-ori/cli@0.0.1`
- `@ori-ori/parser@0.0.1`
- `@ori-ori/coherence@0.0.1`
- `@ori-ori/feature-runner@0.0.1` — 2026-05-21 silent rename: 後継は `@ori-ori/slice-runner` ([`ori-x5l`](https://github.com/dev-komenzar/ori/commit/66348fa))
- `@ori-ori/slice-runner@0.0.1` — 2026-05-21 publish (新規ネーム占有)
- `@ori-ori/templates` — 未 publish（中身が `.gitkeep` のみ、名前のみ予約）

Scope rename: `@oriori/` → `@ori-ori/` ([commit `89a53d6`](https://github.com/dev-komenzar/ori/commit/89a53d6))。
