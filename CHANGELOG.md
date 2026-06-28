# CHANGELOG

ori (織) — DDD-driven slice/page scaffolding with CoDD coherence.

ローカル変更ログ。npm scope は `@ori-ori/*`、monorepo 配下の全 publishable パッケージは同期 version で release する。

## v0.4.0 — 2026-06-26

**Slice DoD enforcement** を skill chain 全体に通した release。`pattern.md` の Slice Definition of Done (4 rule) を SSoT として、`/ori-arch` → `/ori-derive` → `/ori-plan` → `/ori-impl-red` → `/ori-impl-green` → `/ori-doctor` → `/ori-review` が一気通貫で DoD を生成・enforcement する形に揃った。typescript-tauri stack では stub commands.rs / specta bindings rebuild / `setupProductionBuilder.ts` / boundary 経由 test を skill chain が機械的に emit する。並行して v0.3 で導入した skill-only execution model への積み残し追従 (`/ori-sync` / `/ori-propose`) と DDD doc frontmatter の `ori:` block 統一を完了した。配布動線は v0.3 から引き続き APM single package (`apm install dev-komenzar/ori`) のみで、新規 npm publish 対象 package は無い。

### v0.4-O: Slice DoD enforcement epic (`ori-fzr`)

ddd-vsa-hex pattern の slice 完成判定を normative 化し、全 skill が SSoT 参照で derive する構造に揃えた。**hardcoded template を skill 内に持たず、`pattern.md` / instructions / example-slice を SSoT として参照する**方針に転換している。

- **O1 — pattern SSoT 確定** ([`ori-fzr.1`](https://github.com/dev-komenzar/ori/issues)) `pattern.md` に "Slice Definition of Done" 4 rule (sub_layers 全埋め / boundary 経路 / production wiring / cross_root 同期) を Dependency rules の後に追加。`ai-notes.md` で AI agent への enforcement 指示として再展開
- **O2 — typescript-tauri stack 具体化** ([`ori-fzr.2`](https://github.com/dev-komenzar/ori/issues)) Test Contract instantiation + `phase_hooks` (flow-impl-red-pre / green-post で tauri-specta 再生成) を stack template に追加
- **O3 — example-slice 参照実装** ([`ori-fzr.3`](https://github.com/dev-komenzar/ori/issues)) complete-task slice に boundary test 4 ケース + `setupProductionBuilder.ts` + bindings.ts skeleton を配置 (AI agent が template として読める形)
- **O4 — instructions 整合化** ([`ori-fzr.4`](https://github.com/dev-komenzar/ori/issues)) `.apm/instructions/` 6 file (feature-manifest / feature-spec / ddd-rust / ddd-typescript / ui-test / task-management) を DoD と整合
- **O5 — `/ori-init` specta scaffold 同梱** ([`ori-fzr.5`](https://github.com/dev-komenzar/ori/issues)) typescript-tauri stack 用に `install-tauri-scaffold.sh` / `export-types.rs.tpl` / `specta-build.sh` / `setupProductionBuilder.ts.tpl` を skill bundle に追加。`/ori-arch` から `pnpm tauri init` 完了後に call される
- **O6 — `/ori-derive` SSoT 参照化** ([`ori-fzr.6`](https://github.com/dev-komenzar/ori/issues)) spec.md に boundary test / stub commands.rs / production fixture を必ず derive。出力テンプレート section を削除し feature-spec instruction を SSoT 化
- **O7 — `/ori-plan` checklist 拡張** ([`ori-fzr.7`](https://github.com/dev-komenzar/ori/issues)) 下流 test-red / impl-green / review issue description に b3 (stub emit) + p3 (production wiring) checklist を生成 (stack=typescript-tauri 時のみ)
- **O8 — `/ori-impl-red` b3 emit** ([`ori-fzr.8`](https://github.com/dev-komenzar/ori/issues)) typescript-tauri stack で `stub commands.rs (Err("pending"))` → `invoke_handler!` 登録 → specta rebuild → `setupProductionBuilder` pending case → `dod.test.ts` emit → vitest RED を一気通貫で実行
- **O9 — `/ori-impl-green` Tauri DoD flow** ([`ori-fzr.9`](https://github.com/dev-komenzar/ori/issues)) stub→real impl 置換、production adapter wiring、specta rebuild post-step を SSoT 参照で documented。hardcoded code template を削除
- **O10 — `/ori-review` 簡素化** ([`ori-fzr.10`](https://github.com/dev-komenzar/ori/issues)) DoD checklist を撤去し、3 mechanical structural gate (boundary test green / arch lint pass / public_entry 整合性) に集約。DoD 個別 rule の強制責務は `ori-doctor` / `dod.test.ts` / arch adapter / specta-build hook に分散。`/ori-plan` の review checklist からも DoD 検査 block を revert
- **O11 — `phase_hooks` 全 stack 出力** ([`ori-fzr.11`](https://github.com/dev-komenzar/ori/issues)) `/ori-arch` 生成 architecture.md の frontmatter に `phase_hooks` block を必須化 (cross_root 無し stack でも空 `{}` 出力)。schema / migration path を documented
- **O12 — `/ori-doctor` DoD sweep** ([`ori-fzr.12`](https://github.com/dev-komenzar/ori/issues)) `check-dod-sweep.sh` 追加。rule:dod-1〜4 を check し `--dod-sweep --emit-issues` で `slice:<id>` + `rule:<id>` label により bd issue を idempotent 起票
- **O13 — integration smoke** ([`ori-fzr.13`](https://github.com/dev-komenzar/ori/issues)) fresh project で step 1-8 を end-to-end 確認 (PASS 7 / FAIL 1)。残 defect を O14 / O15 / O16 に起票
- **O14 — `__BC_NAME__` sentinel 統一 (fix)** ([`ori-fzr.14`](https://github.com/dev-komenzar/ori/issues)) `export-types.rs.tpl` の `{{BC_NAME}}` 残置を `__BC_NAME__` に統一 (`install-tauri-scaffold.sh` の sed 置換と整合)
- **O15 — `PROJECT_ROOT` auto-detect (fix)** ([`ori-fzr.15`](https://github.com/dev-komenzar/ori/issues)) `/ori-doctor` 配下 7 script を PWD-first 検出に変更 (`SCRIPT_DIR` が ori repo を指して user project の `.ori/` が見えない bug 修正)
- **O16 — CI DoD smoke driver** ([`ori-fzr.16`](https://github.com/dev-komenzar/ori/issues)) `ci/smoke/Dockerfile` (node22 + pnpm10 + rust + tauri-cli 2) + `run-smoke.sh` + `.github/workflows/dod-smoke.yml` 追加。create-skeleton → render-architecture → tauri scaffold → cargo check → `check-dod-sweep.sh` rule:dod-1 検出までを deterministic に CI smoke

### v0.4-P: skill-only execution model 積み残し追従

v0.3.0 で完了したはずの skill-only model 移行のうち、未追従だった skill を追従させた。

- **P1 — `/ori-sync` MVP→実装** ([`ori-56e`](https://github.com/dev-komenzar/ori/issues)) `git diff --since=<ref>` で `.ori/domain/` 変更を検知、`derives_from` / `relations` を辿って影響 slice / page を特定し各 `status.yaml` の `dirty[]` に idempotent 追記。`--check` (CI 用 exit 1) + `--force <path>` (`/ori-review-proposals` 橋渡し) mode 追加。旧 `detect-changes.sh` (SKILL.md から未参照) を削除
- **P2 — `/ori-propose` skill-only 化** (`ori-propose`) 存在しない `ori propose` CLI 呼び出しから、AI が Write tool で `.ori/proposals/` 配下を直接生成する手順に置換。ファイル名規約 / frontmatter schema / 5 セクション template / target 引用 guardrail を SKILL.md に内蔵
- **P3 — skill script path 統一** ([`ori-dpw`](https://github.com/dev-komenzar/ori/issues)) 8 SKILL.md の `.apm/skills/<name>/scripts/<x>.js` 絶対 path を `./scripts/<x>` (bundle 相対) に書き換え、18 skill の裸 `bash scripts/<x>.sh` / `node scripts/<x>.js` に `./` prefix。install 場所 (`.apm/` vs `.claude/skills/`) 非依存に

### v0.4-Q: DDD doc frontmatter 統一 (`coherence:` → `ori:` block)

- **Q1 — 12 DDD skill SKILL.md 改修** ([`ori-ywk`](https://github.com/dev-komenzar/ori/pull/54)) `coherence:` (distill-ddd 上流残り) を `design.md §5` の `ori:` block (`node_id` / `type` / `depends_on` / `modules`) に揃える。Phase 1〜11b の node_id 規約 (`discovery:overview` / `event-storming:timeline` / `bounded-context:collection` 等) を明示。13 個の `lint-domain.sh` も `^ori:` 検出 + 必須 field check に更新
- **Q2 — parser schema 置換 + bundle 再生成** ([`ori-1mg`](https://github.com/dev-komenzar/ori/pull/54)) `OriCoherenceSchema` を撤去し `OriBlockSchema` (`schema.propagation_level` 含む) を新設。`OriFrontmatterSchema` は `ori:` block のみ validate。`pnpm -r run build` で parser + adapter (3) + skill bundle (11) を再生成、14 package typecheck + 148 test 全 pass

破壊的変更:

- 既存 consumer repo の `.ori/domain/*.md` は frontmatter migration が必要 (旧 `coherence:` → 新 `ori:` block)。migration script の配布は別 issue ([`ori-gxh`](https://github.com/dev-komenzar/ori/issues))

### v0.4-R: 利用者 project 向け task management instruction 配布

- **R1 — tier 構造 instruction を APM 配布** ([`ori-98p`](https://github.com/dev-komenzar/ori/pull/53)) `.apm/instructions/task-management.instructions.md` を新設。beads marketplace 公式 BOUNDARIES.md (bd = Strategic / TodoWrite = Tactical) と整合する tier 構造 (epic → child → TodoWrite) / epic 化 trigger / lazy promote (γ rule) / Mode-Epic / Mode-Resume / Mode-Flat dispatch rule / phase=label / session 終了時 notes 進捗保存を documented。`bd setup claude` が CLAUDE.md に書き込む旧 strict template (`do NOT use TodoWrite`) との矛盾を解消し、meta 固有参照 (`ori-9fg` / `task-management-rule`) を generic 化

### その他 fix / chore

- README クイックスタートを `/ori-distill` → `/ori-arch` の順に修正、`/ori-arch` が pattern/stack 確定の前提として明示 (`fix(skills): DDD next-step ガイダンス`)
- `/ori-init` の `.ori/.gitignore` を `state/` のみから cargo `target/` / `node_modules/` / `dist/` / `build/` / `.gradle/` / `__pycache__` 等に拡張 (phase 10 build artifact 596 file 誤コミット実例への対処)

## v0.3.0 — 2026-06-11

skill-only execution model への全面移行が完了する release。Phase J 〜 N で `packages/cli` / `packages/templates` / `packages/arch-adapter-*` 撤去 + `@ori-ori/parser` / `slice-runner` / `coherence` の private 化を完遂し、APM single package (`apm install dev-komenzar/ori`) のみが配布動線となる。新規 npm publish 対象 package は存在しない。

### v0.3-N: `@ori-ori/slice-runner` + `@ori-ori/coherence` を private 化 (Phase M の余波 cleanup)

Phase M (`ori-1pe`) で `@ori-ori/parser` を private 化したのと同条件 (現状 public published / 内部 skill からのみ利用 / 外部 consumer 0) で残っていた 2 package を、同パターンに揃える cleanup。slice-runner は `ori-flow` / `ori-model` skill の esbuild bundle に inline 済、coherence は slice-runner 経由で同 skill bundle に間接 inline 済のため、APM 利用者側に影響なし。

- **N1** ([`ori-hqr`](https://github.com/dev-komenzar/ori/issues)) — `packages/slice-runner/package.json` および `packages/coherence/package.json` に `"private": true` 追加 + `publishConfig` 削除 (pnpm workspace 内には残置、`workspace:*` 依存は従来通り)。既存 publish 済 `@ori-ori/slice-runner@<=0.2.0` / `@ori-ori/coherence@<=0.2.0` を npm deprecate 強化 (`scripts/npm-deprecate-runner-coherence.sh`)

破壊的変更:

- `pnpm add @ori-ori/slice-runner` / `pnpm add @ori-ori/coherence` は v0.3 以降サポート対象外。APM 経由 (`apm install dev-komenzar/ori`) で配布される skill bundle 内にロジックが embed されるため、外部から library として再利用する用途は廃止。

この PR で `@ori-ori/*` の npm publishable package は **全て** placeholder 状態 (`@ori-ori/templates` 系) または bundled に移行済となり、`@ori-ori/cli` deprecate stub を除いて新規 publish 対象 package は無くなった (Phase J → L → M → N の skill-only モデル徹底 cleanup 完了)。

### v0.3-M: `@ori-ori/parser` を private 化 (skill-only モデル徹底)

`@ori-ori/parser` の npm publish を停止し、Phase J の `@ori-ori/arch-adapter-*` と同じ「APM bundle 単独配布」方針に揃える。parser は ori 内部 skill (ori-arch / ori-doctor / arch-adapters) からのみ利用されており、外部 plugin consumer は実在しない。skill bundle は esbuild `bundle: true` で parser ソースをインライン化済のため、APM 利用者側に影響なし。

- **M1** ([`ori-1pe`](https://github.com/dev-komenzar/ori/issues)) — `packages/parser/package.json` に `"private": true` 追加 + `publishConfig` 削除 (pnpm workspace 内には残置、`workspace:*` 依存は従来通り)。既存 publish 済 `@ori-ori/parser@<=0.2.0` を npm deprecate 強化 (`scripts/npm-deprecate-parser.sh`)

破壊的変更:

- `pnpm add @ori-ori/parser` は v0.3 以降サポート対象外。APM 経由 (`apm install dev-komenzar/ori`) で配布される skill bundle 内に parser ロジックが embed されるため、外部から library として再利用する用途は廃止。必要なら architecture.md は markdown として直接 parse 可能 (deps: `gray-matter` / `mdast-util-from-markdown` 相当)。

### v0.3-L: `packages/cli/` 物理撤去 + `@ori-ori/cli` strong deprecate

design.md L1244 で v0.3 において「`packages/cli` 撤去 + `@ori-ori/*` 4 packages を npm deprecate」と明文化されていた積み残しを解消。Phase B (`/ori-init` skill 化) 以降 skill-only execution model に移行済で `packages/cli/` 配下は dead code 化していたため、workspace から物理撤去し、`@ori-ori/cli` npm 側は deprecate message を strong 化した。

- **L1** ([`ori-7dx`](https://github.com/dev-komenzar/ori/issues)) — `packages/cli/` (1505 行) を repo から削除。root `package.json` から `cli` script 削除、`pnpm-lock.yaml` 更新。`docs/design.md` の package layout 図 / cli 関連記述を「撤去済」文言に更新。`pnpm -r test` / `pnpm -r typecheck` green、副作用として `ori-ehd` (cli vitest が citty / @ori-ori/parser を解決できない P3 bug) も自動解消

破壊的変更:

- `pnpm add -g @ori-ori/cli` および `npx @ori-ori/cli` は v0.3 以降サポート対象外。`ori init` / `ori slice new` / `ori page new` / `ori arch` 等の CLI 動線は全廃され、`apm install dev-komenzar/ori` で配布される `.apm/skills/ori-*/` の skill scripts を直接 invoke する (`node .apm/skills/ori-init/scripts/...` 等)。published `@ori-ori/cli@<=0.2.0` は npm 上に保持されるが deprecate message で APM 誘導される

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
