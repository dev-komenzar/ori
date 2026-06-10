# ori 設計 — MVP v0.1 SSoT

> AI ハーネスで動作する、ドメイン駆動かつ仕様変更追従可能な開発フレームワーク。
> 開発者が「適切なアーキテクチャ上で開発している」ことを意識せずに済むよう、AI とドメインと設計とコードを織り合わせる。

このドキュメントは ori MVP v0.1 の **設計 SSoT** です。ここに反映された決定は実装の根拠であり、変更時は本ドキュメントから先に更新します。

詳細議論ログは git log + `.claude/projects/.../memory/` 参照。

---

## 目次

1. [ビジョンと設計原則](#1-ビジョンと設計原則)
2. [関連プロジェクト](#2-関連プロジェクト)
3. [MVP v0.1 スコープ](#3-mvp-v01-スコープ)
4. [中核概念 — slice と page](#4-中核概念--slice-と-page)
5. [DDD pipeline(Phase 1-11)](#5-ddd-pipelinephase-1-11)
6. [Architecture pattern](#6-architecture-pattern)
7. [Stack — dynamic axes と tech catalog](#7-stack--dynamic-axes-と-tech-catalog)
8. [Skill inventory](#8-skill-inventory)
9. [/ori-flow — 7-phase slice/page 実装](#9-ori-flow--7-phase-slicepage-実装)
10. [変更伝播 — hook と queue と /ori-sync](#10-変更伝播--hook-と-queue-と-ori-sync)
11. [Manifest schema(slice + page)](#11-manifest-schemaslice--page)
12. [.ori/architecture.md schema(v1)](#12-oriarchitecturemd-schemav1)
13. [Cross-cutting concerns](#13-cross-cutting-concerns)
14. [失敗モードと resume](#14-失敗モードと-resume)
15. [配布 — APM single package](#15-配布--apm-single-package)
16. [Curated content の置き場](#16-curated-content-の置き場)
17. [Repository layout](#17-repository-layout)
18. [用語集](#18-用語集)
19. [ロードマップ](#19-ロードマップ)

---

## 1. ビジョンと設計原則

### ビジョン
AI ハーネス(Claude Code, OpenCode, Codex, Gemini CLI, GitHub Copilot, Cursor, Windsurf)で動く skill 集として、**DDD ドキュメントを完成させればコードについて心配する必要がない** ハーネスを目指す。

### 設計原則
1. **DDD ドキュメントが Single Source of Truth** — slice/page・コードは派生
2. **構造から自動抽出** — Phase 9 (workflows) と Phase 11b (page-grouping) から slice/page を生成
3. **単一伝播アルゴリズム + edit-time SSoT guardrail** — `--force` で派生側編集を許可、proposal を自動生成
4. **CLI = 決定的重処理 / AI = 創造的判断** の責務分離
5. **multi-harness 中立** — APM で全 AI ツールへ配布、capability-role で model 抽象化
6. **markdown-driven 拡張** — pattern / tech / schema は markdown で curate、TS adapter は最小化

---

## 2. 関連プロジェクト

| プロジェクト | URL | ori との関係 |
|---|---|---|
| **CoDD** | https://github.com/yohey-w/codd-dev | frontmatter ベースの traceability に着想 |
| **VCSDD** | https://github.com/sc30gsw/vcsdd-claude-code | Coherence Engine + 自律実装 flow に着想 |
| **distill-ddd** | https://github.com/tango238/distill-ddd | 11 phase DDD pipeline を ori に **再実装**(依存しない、参照のみ) |
| **cc-sdd** | https://github.com/gotalab/cc-sdd | 軽量化、autonomous implementation |
| **APM** | https://microsoft.github.io/apm/ | ori の配布手段(Microsoft Agent Package Manager) |
| **Beads** | https://github.com/gastownhall/beads | タスク管理基盤(MVP は直接 CLI 呼出、formal adapter なし) |

---

## 3. MVP v0.1 スコープ

### 含むもの

#### Distribution
- **APM single package**(npm `@ori-ori/*` は全 soft-deprecate)
- Node 20+ runtime
- per-skill esbuild bundle in `.apm/skills/<name>/scripts/`
- 開発 source は monorepo(`src/`、ビルド時に各 skill bundle 化)

#### Architecture
- **1 curated pattern**: `ddd-vsa-hex`
- **動的 axes stack**(curated `axes-vocabulary.md`、初期 5 core + 4 optional)
- **12 initial tech catalog**(tauri, nextjs, sveltekit, nuxt, vite-react, hono, axum, supabase, cloudflare-pages, sqlite, postgresql, prisma, drizzle)
- 各 tech に `variants` + `phase_hooks` フィールド
- Multi-root + cross-root(Tauri 対応)

#### Skills(32 個、3-tier 分類は実装時に確定)
- DDD phase 1-11(`ori-ddd-1-discovery` 〜 `ori-ddd-11b-ui-grouping`、12 個)
- Setup: `ori-init`
- Architecture: `ori-arch`
- Flow: `ori-flow` + 7 phases(verify→plan→test-red→impl-green→refactor→review→finalize)
- Proposal: `ori-propose`, `ori-review-proposals`
- Maintenance: `ori-sync`, `ori-feature-status`, `ori-doctor`, `ori-model`, `ori-graph`, `ori-bug`, `ori-migrate`, `ori-distill`

#### 中核概念
- **Slice**(1 use case = 1 handler、`.ori/slices/<id>/`)
- **Page**(N slice の宿主、`.ori/pages/<id>/`、slice と同 manifest schema + `type` discriminator)
- Manifest enrich(`derives_from` + `inputs[].hash` + `outputs[].hash` + `flow_state.history`)
- `spec.md` 廃止、phase 1 = verify(file 出力なし)
- Aggregate **hybrid placement**(BC 共有 domain + slice 内 command DTO)
- Event-bus 自動生成 + manifest-driven subscriptions

#### Cross-cutting concerns
- **Always-on**(default 組み込み): error handling, logging, trace ID
- **DDD-driven**(MVP は auth のみ): `validation.md` `## Authorization rules` 空 → guard code 生成なし

#### Iteration / propagation
- PostToolUse hook(APM 自動配備、`.apm/hooks/sync-trigger.json` + scripts/)
- Queue-based 疎結合(`.ori/state/sync-queue.jsonl`)
- /ori-sync が drain → dirty 伝播 → beads issue
- /ori-flow verify が fail-safe
- OpenCode fallback(手動 /ori-sync、APM が hook 配備を silent skip)

#### Traceability
- 6-layer(no static analysis、`source_type: static` は placeholder)
- doc-to-code: frontmatter `depends_on` + manifest `derives_from` / `inputs` / `outputs`
- markers: `@ori-generated`, `@ori-imported`, `@ori-stub`, `@ori-operation` / `@ori-status`

#### Task management
- **Beads only**(`bd` CLI を skill から直接呼出、formal adapter 化なし)

### 含まないもの(v0.2+)

| 項目 | 理由 |
|---|---|
| `/ori-rules`(machine-checkable invariants) | 複雑、後回し |
| 追加 pattern(現在 1 個) | MVP は単一 pattern で哲学を実証 |
| Brownfield support(/ori-extract 等) | 既存コードからの逆生成 |
| Layer 1 hard lock(OpenCode 以外) | best-effort |
| Static analysis 由来 edge | placeholder のみ |
| AI 自動 polling | 安全側 |
| Rate limiting / audit trail / i18n / caching / metrics | DDD-driven 追加 |
| Concurrent /ori-flow | flow-lock で禁止 |
| 分散 event bus | in-process のみ |
| 追加 task adapter(Linear / GitHub Issues / Jira) | Beads で検証後 |
| Curated content の semver + migration helper | pin 運用 |

---

## 4. 中核概念 — slice と page

### Slice

**定義**: 1 slice = 1 use case = 1 handler(command または query)

**1:1 対応**:
- Slice ↔ Phase 9 workflow step(完全 1:1)
- Slice ↔ DDD docs(`derives_from` で論理依存を declare)

**所在(SSoT メタ)**: `.ori/slices/<slice-id>/`
- `manifest.yaml`(SSoT)
- `spec.md` / `plan.md` / `review.md`(各 phase 出力)
- `notes.md`(実装ログ、任意)
- `status.yaml`(beads 派生キャッシュ)

**所在(code + tests)**: `apps/<app>/src/<bc>/slices/<slice-id>/`
- `domain/` `application/` `infrastructure/` `presentation/` `tests/`
- tests は impl と co-locate(sibling import、vitest default が効く)

### Page

**定義**: 1 page = N slice の **宿主**(UI composition unit)

**生成元**: Phase 11b (page-grouping) 出力

**所在**: `.ori/pages/<page-id>/`
- `manifest.yaml`(slice manifest と同 schema、`type: page` discriminator)
- `tests/`(主に E2E、Phase 7 scenario.scope=page 由来)

### slice と page の関係

- slice manifest に `page: <page-id>` field(任意、UI 関連 slice のみ)
- page manifest に `slices: [<slice-id>, ...]` field(双方向参照)
- /ori-flow は **slice / page 両方を 7-phase で処理**(content templates が type で切替)
- Page の verify phase は「hosted slice が全部 generated」を要求 → beads dep で順序強制

### 命名規約

| 概念 | naming |
|---|---|
| slice ID | kebab-case 動詞-名詞(例: `register-user`, `change-email`)、workflow step ID と完全一致 |
| page ID | kebab-case(例: `registration`, `user-settings`) |
| BC | kebab-case 概念名(例: `user-management`, `order`) |

---

## 5. DDD pipeline(Phase 1-11)

distill-ddd の 11 phase を ori に再実装。各 phase が `.ori/domain/` 配下に doc を生成。

### Phase 一覧と出力

| # | Phase | Skill | 出力 |
|---|---|---|---|
| 1 | discovery | `/ori-ddd-1-discovery` | `.ori/domain/discovery.md`(+ personas) |
| 2 | event-storming | `/ori-ddd-2-event-storming` | `.ori/domain/event-storming.md` |
| 3 | bounded-contexts | `/ori-ddd-3-bounded-contexts` | `.ori/domain/bounded-contexts.md`(H2 = BC) |
| 4 | context-map | `/ori-ddd-4-context-map` | `.ori/domain/context-map.md` |
| 5 | aggregates | `/ori-ddd-5-aggregates` | `.ori/domain/aggregates.md`(H2 = Aggregate, `{#id}` 必須) |
| 6 | domain-events | `/ori-ddd-6-domain-events` | `.ori/domain/domain-events.md`(H3 = Event, `{#id}` 必須) |
| 7 | validation | `/ori-ddd-7-validation` | `.ori/domain/validation.md`(scenarios + auth rules) |
| 8 | glossary | `/ori-ddd-8-glossary` | `.ori/domain/glossary.md` |
| 9 | workflows | `/ori-ddd-9-workflows` | `.ori/domain/workflows/<id>.md`(1:1 で分割) |
| 10 | types | `/ori-ddd-10-types` | `<bc>/domain/`, `<bc>/shared/contracts/events/`(generated) |
| 11a | ui-fields | `/ori-ddd-11a-ui-fields` | `.ori/domain/ui-fields/screen-N.md` |
| 11b | page-grouping | `/ori-ddd-11b-ui-grouping` | `.ori/architecture.md` の `## Page Map` section + `.ori/pages/<id>/manifest.yaml`(planned) |

### Phase 10 の特殊性

- 出力は **DDD doc ではなく code**(Phase 10 = types generation)
- 出力先: `<bc>/domain/<Aggregate>.{ts,rs}`, `<bc>/shared/contracts/events/<Event>.{ts,rs}`
- 生成内容: **型定義 + 操作シグネチャ + stub body**
  - Body 実装は /ori-flow の各 slice が impl-green で行う
  - `@ori-stub` marker で「未実装」明示
  - `@ori-operation: <name>` + `@ori-status: implemented` で operation 単位の SSoT 保護
- Tech bridge(tauri-specta 等)は phase_hooks で別 step として実行

### Frontmatter 規約

各 doc / generated node に統一 frontmatter:

```yaml
---
ori:
  node_id: <type>:<name>             # 必須、globally unique
  type: <controlled-vocabulary>      # 必須
  depends_on:                        # 上流 node の node_id リスト
    - <node-id>
  modules:                           # 任意、code との関連
    - <module-path>
---
```

主要 doc-type と node_id 規約:

| Phase | Type | node_id 例 |
|---|---|---|
| 1 | `discovery`, `persona` | `discovery:overview`, `persona:end-user` |
| 2 | `event-storming` | `event-storming:timeline` |
| 3 | `bounded-context` | `bounded-context:user-management` |
| 4 | `context-map`, `relationship` | `context-map:map`, `relationship:user-to-order` |
| 5 | `aggregate` | `aggregate:User` |
| 6 | `event` | `event:UserRegistered` |
| 7 | `scenario` | `scenario:registration-happy-path` |
| 8 | `glossary-term` | `glossary-term:User` |
| 9 | `workflow` | `workflow:user-registration` |
| 11a | `ui-field` | `ui-field:registration-form` |
| 11b | `page-grouping` | `page-grouping:registration` |
| curated | `pattern`, `tech` | `pattern:ddd-vsa-hex`, `tech:tauri` |

---

## 6. Architecture pattern

MVP は **`ddd-vsa-hex` 1 個** のみ curated。複数 pattern は v0.2+。

### Pattern 構成

```
.apm/skills/ori-arch/patterns/ddd-vsa-hex/
├── pattern.md                       # stack-agnostic 概念定義(Summary, When, Tradeoffs, Layer, Dependency, Naming, Cross-cutting placement)
├── ai-notes.md                      # AI 行動指示(AI considerations, Test strategy, Migration)
└── stacks/                          # pattern × stack の実現形(MVP は pre-bake、将来 axes dynamic 化時に生成へ移行)
    ├── typescript/
    │   ├── architecture.md.tpl      # → target の .ori/architecture.md ソース
    │   └── example-slice/           # AI が新 slice 生成時に on-demand 参照する worked code(study material)
    └── typescript-tauri/
        ├── architecture.md.tpl
        └── example-slice/           # TS + Rust mirror
```

- **stack-agnostic な pattern.md / ai-notes.md** と **stack-specific な stacks/<stack>/** を物理パスで階層分け
- **example-slice/ は study material**(target にコピーしない): AI が `/ori-flow new-slice` 等で参照、`package.json` 等 bootstrap ファイルは含めない(upstream の framework init が担当)
- **target に書き出すのは `.ori/architecture.md` のみ**: 空 skeleton や worked slice の物理コピーは行わない(ori 責務は「upstream 出力に設定を加える」)
- **architecture.md.tpl の placeholder**: app 名等は `/ori-arch` 実行時に config から解決して埋め込む

### Pattern.md の必須 sections

```
## Summary
## When to use
## When NOT to use
## Tradeoffs
## Conceptual structure       (stack-agnostic ディレクトリ構成図)
## Layer responsibilities
## Dependency rules           (machine-checkable に変換可能)
## Naming conventions
## Cross-cutting concerns placement
```

### Pattern.md frontmatter

```yaml
---
ori:
  node_id: pattern:ddd-vsa-hex
  type: pattern
  version: 1.0.0
  applicable_when:
    - "domain complexity: medium-high"
    - "bounded contexts: multiple"
    - "test-first development desired"
  not_applicable_when:
    - "domain complexity: trivial (CRUD only)"
    - "single-developer prototype"
  default_layer_set: ddd-vsa-hex-ts
  alternate_layer_sets: [ddd-vsa-hex-rs]
  cross_cutting_concerns: [auth, error-handling, logging]
---
```

### Layer 構造(概略、詳細は `.apm/skills/ori-arch/architecture-md-schema.md`)

Top-level layers:
- `shared`(kind: shared)
- `domain`(kind: slice — each child is a slice)
- `ui-widget`(kind: ui-layer, order: 1) — cross-slice composition、optional
- `ui-page`(kind: ui-layer, order: 2) — page = N slice 宿主

Slice-internal sub-layers: `[domain, application, infrastructure, presentation, tests]`

Cross-slice rules:
- `prohibited_direct: true`
- `via: [shared/contracts, shared/events]`

---

## 7. Stack — dynamic axes と tech catalog

### Axes は固定でなく動的

/ori-arch が DDD docs を読んで project 性質を推論し、必要な axes 群を **proposal-confirmation** で確定。

### Curated vocabulary

axes 名 / tech catalog は `.apm/skills/ori-arch/references/tech/` 配下に集約 (controlled vocabulary)。

**Core axes(頻出)**:
- `host` — デプロイ・実行先
- `frontend` — UI render lib
- `framework` — meta-framework
- `backend` — API layer
- `datastore` — 永続化

**Optional axes(必要時のみ提案)**:
- `runtime`(node / bun / deno)
- `type-bridge`(tauri-specta / trpc / openapi-codegen)
- `auth`(auth0 / clerk / supabase-auth / lucia / custom)
- `api-protocol`(rest / trpc / graphql / rpc)

### Tech catalog(初期 12)

```
.apm/skills/ori-arch/references/tech/
├── tauri.md            (variants: version v1|v2)
├── nextjs.md           (variants: rendering, router, runtime)
├── sveltekit.md        (variants: adapter)
├── nuxt.md             (variants: rendering)
├── vite-react.md
├── hono.md             (variants: runtime)
├── axum.md
├── supabase.md         (features: auth, realtime, storage, vector)
├── cloudflare-pages.md
├── sqlite.md           (driver variants)
├── postgresql.md       (version + extensions)
├── prisma.md           (engine variants)
└── drizzle.md
```

### tech/<tech>.md schema

```yaml
---
ori:
  tech_id: <id>
  axes:                          # この tech がカバーする axis 群
    <axis>: <value>
  variants:                      # variant 定義
    <name>:
      type: enum
      values: [...]
      default: <value>
      affects: [...]
      description: "..."
      incompatibilities:
        <variant-value>:
          - <other-axis>: <value>  # 組合せ不可
  variant_inference_hints:       # /ori-arch AI 推論用
    <variant-name>:
      - "<hint>"
  phase_hooks:                   # phase 後処理 hook
    - phase: <phase-name>
      timing: pre | post
      description: "..."
      command: "<bash>"
      verify:
        type: file-exists | exit-code | grep | regex
        ...
      on_failure: stop | continue-with-warning
      applicable_when:
        variants:
          <name>: [<value>, ...]
---
```

### 実行 flow(/ori-arch)

```
1. DDD docs を読む(discovery, workflows, ui-fields)
2. AI が project 性質を推論
3. tech/ から関連 tech をピック、proposal 構築
   "framework: tauri, frontend: tauri-react を推奨します"
4. ユーザーに proposal 提示 + 質問
5. Variant proposal(tech が variants 持つ場合)
   "tauri の version は v2(default)で良いですか?"
6. ユーザー確定後、各 tech の手順を実行
   tech/<id>.md の reference に従って bash 実行
7. stack.md 書き出し(動的 N フィールド + variants)
8. pattern.md 書き出し(decision record)
9. .ori/architecture.md update(layer 構造 = pattern + tech から導出)
```

---

## 8. Skill inventory

MVP v0.1 = **32 skills**、3-tier 分類で組織(tier 詳細は実装時に確定)。

### 概略 tier 分類

**Tier 1 — Core(必須)**:
- `ori-init`(setup)
- `ori-ddd-{1..11b}`(12 個)
- `ori-arch`
- `ori-flow`
- `ori-sync`

**Tier 2 — Workflow components(`/ori-flow` から呼ばれる)**:
- `ori-derive`(現名、verify に rename) `ori-plan`, `ori-test-red`, `ori-impl-green`, `ori-refactor`, `ori-review`, `ori-finalize`

**Tier 3 — Utility(随時実行)**:
- `ori-feature-status`, `ori-doctor`, `ori-graph`, `ori-model`
- `ori-propose`, `ori-review-proposals`
- `ori-bug`, `ori-migrate`, `ori-distill`

詳細は `.apm/skills/<name>/SKILL.md` 参照。

---

## 9. /ori-flow — 7-phase slice/page 実装

### Phase 一覧

| # | Phase | output | model role | failure 時 |
|---|---|---|---|---|
| 1 | **verify** | (なし、`notes.md` ログのみ任意) | deep | derives_from 不完全 → `.ori/proposals/` 生成 + 停止 |
| 2 | plan | beads issue 起票 | deep | retry 1 回、fail なら停止 |
| 3 | test-red | `tests/`(slice は unit、page は E2E + smoke + a11y) | deep | self-fix 1 回、fail なら停止 |
| 4 | impl-green | source code | deep | self-fix 1 回、fail なら停止(test green になるまで) |
| 5 | refactor | source diffs | fast | rollback、skip 扱い |
| 6 | review | beads comments | **reasoning (fresh)** | critical → 停止、minor → continue |
| 7 | finalize | manifest hash 更新 + dirty 解除 + proposals | fast | retry 3 回 |

### 共通ルール

- 各 phase 内で失敗時 **1 回 self-fix** → それでも失敗なら停止
- Subtask は impl-green issue 内の `- [ ]` checklist(別 issue 作らない)
- 停止時の責務 5 項目:
  1. 明示的 stop(silent skip しない)
  2. bd issue に状態反映(`bd update <id> --notes`)
  3. manifest `flow_state` 更新
  4. user に明確な next action 提示
  5. flow-lock 保持(stale 検出可能)

### Slice と page で content が異なる

| Phase | Slice 文脈 | Page 文脈 |
|---|---|---|
| verify | derives_from(workflow step, aggregate, ui-field)の completeness | hosted slices が全部 generated + page-grouping doc 完全 + scenario doc 解決可能 |
| plan | bd issue: handler 実装、unit test | bd issue: layout 実装、UI tests、E2E from scenarios |
| test-red | handler の unit/integration test | UI tests + a11y + scenario 駆動 E2E |
| impl-green | handler 実装 | layout + slice composition + routing wiring |
| refactor | handler refactor | layout refactor、styles 整理 |
| review | handler logic review | UX review、a11y 監査、scenario カバレッジ |
| finalize | dirty 解除 | dirty 解除 + 上流提案(scenario 不完全時) |

### Test 生成の責務分担

- **決定論的(template から)**: smoke, composition, a11y, visual baseline
- **AI 駆動(scenario から)**: E2E, integration test
- test-red phase で **両方生成**(template 起動 + AI による scenario→test 変換)

### Tech phase_hooks

各 phase の `post` timing で、stack.md の tech 群について tech/<tech>.md の `phase_hooks` を discover & 実行:
- `flow-impl-green-post` → `cargo check`, `pnpm build` 等
- `ddd-10-types-post` → `tauri-specta build`, `prisma generate` 等

### Resume と smart skip

詳細は §14。基本:
- `flow_state.history` に全 transition を記録
- Re-entry 時に file hash 比較 → 手動修正検出時はユーザーに 4 択提示
- Phase の **success criteria** を満たせば smart skip(`manually completed`)

---

## 10. 変更伝播 — hook と queue と /ori-sync

### Hook(APM 自動配備)

```
.apm/hooks/sync-trigger.json     # APM standard 形式
.apm/hooks/scripts/sync-trigger.js  # Node self-contained ~30 行
```

APM が各 harness の settings に **自動 merge**(`.claude/settings.json`, `.cursor/hooks.json`, etc.)。OpenCode は silent skip。

### Hook script の責務

```javascript
// SSoT 対象ファイル(.ori/domain/*.md 等)を編集 → queue 追記のみ
// .ori/state/sync-queue.jsonl に { ts, file } append
// 常に exit 0(agent flow を止めない)
```

### /ori-sync の責務(APM skill)

```
1. queue を drain(.ori/state/sync-queue.jsonl 読み込み + 処理 + truncate)
2. 各 file の hash 比較 → 変化検知
3. derives_from の reverse 参照を辿り、影響 slice/page を dirty マーク
4. dirty slice/page の beads issue 起票
5. 全 manifest の hash 整合性 fail-safe check
6. `--force` 編集された SSoT の `.ori/proposals/` 生成
```

### Fail-safe path

| 経路 | 詳細 |
|---|---|
| Hook(primary) | 編集即時 queue 追記、低レイテンシ |
| /ori-flow verify phase | 全 phase 開始時に /ori-sync 呼び出し、hook なしの harness も catch |
| /ori-sync 手動 | troubleshoot 用 |
| /ori-doctor | 「hook 動いていない可能性」を warning |

---

## 11. Manifest schema(slice + page)

### 共通 schema(type discriminator で slice/page を弁別)

```yaml
slice_id: register-user                       # または page_id
bc: user-management
app: frontend                                 # 配置先 app(single-app では省略可、N-app では必須)
type: command                                 # command | query | page
status: generated                             # planned | generated | dirty | stale | manually_edited

# slice 固有
workflow: user-registration                   # 派生元 workflow
use_case: register-user
page: registration                            # 任意、宿主 page
trigger:                                      # event-driven slice の場合
  - type: api
    route: /commands/register-user
  - type: event-subscription
    event: event:UserRegistered
emits:
  - event:UserRegistered

# page 固有
route: /register                              # 任意
slices: [register-user, check-username]       # 宿主する slice 群
layout:
  type: form-with-validation

# 共通(SSoT 派生)
derives_from:
  - workflow:user-registration#step-1
  - aggregate:User
  - ui-field:registration-form

# 共通(change detection 用 hash)
inputs:
  - {node: workflow:user-registration, step: 1, hash: sha256:...}
  - {node: aggregate:User, hash: sha256:...}
  - {node: pattern:ddd-vsa-hex, hash: sha256:...}
  - {node: architecture:stack, hash: sha256:...}

outputs:
  - {path: apps/<app>/src/<bc>/slices/register-user/application/handler.ts, hash: sha256:...}

timestamps:
  generated_at: 2026-05-17T10:30:00Z
  last_modified_at: 2026-05-17T10:30:00Z

implementation:
  bd_issues: [bd-a1b2, bd-c3d4]

flow_state:                                   # 7-phase 進行状況
  current: refactor
  current_since: 2026-05-17T22:00:30Z
  history:
    - {from: null, to: verify, timestamp: "..."}
    - {from: verify, to: plan, timestamp: "..."}
    - {from: plan, to: test-red, timestamp: "...", bd_issue: "bd-x"}
    - ...
  flow_lock:                                  # 進行中のみ
    pid: 12345
    acquired_at: "..."
    last_heartbeat: "..."
```

### State 命名規約(`flow_state.history.to`)

| 種別 | State 名 |
|---|---|
| Phase 名 | `verify`, `plan`, `test-red`, `impl-green`, `refactor`, `review`, `finalize` |
| Initial | `null`(history 1 番目の from のみ) |
| 終了 | `done` |
| 異常 | `failed`, `aborted` |

### Hash 計算

- Inputs: doc 本体(frontmatter 除く)の SHA-256
- Outputs: ファイル全体の SHA-256

### Status 遷移

- `planned` — workflow/page-grouping から auto-generated 未着手
- `generated` — /ori-flow 完走
- `dirty` — inputs.hash 変化、再生成候補
- `stale` — dirty 長期放置
- `manually_edited` — outputs.hash 不一致(手動編集)

### `app:` field の解決ロジック(skill 共通)

slice/page manifest の `app:` field を skill が解決する順序:

1. manifest に `app:` field があれば優先採用
2. なければ `.ori/config.yaml` の `workspace.apps:` を参照
   - **要素 1 個**(single-app: 最頻ケース) → その entry を使用、`app:` 省略可
   - **要素 N 個**(monorepo) → manifest に `app:` 必須、なければ skill 停止 + bd issue にエラー記録
3. config なし → `/ori-init` 未実行エラー

slice 出力 path は `apps/<app>/src/<bc>/slices/<slice-id>/...`(BC top-level の `domain/` と `shared/contracts/events/` も `apps/<app>/src/<bc>/` 配下)。

---

## 12. .ori/architecture.md schema(v1)

詳細は `.apm/skills/ori-arch/architecture-md-schema.md` 参照。要点:

### Top-level

```yaml
---
version: 1
workspace:
  apps_root: apps                              # project root から見た apps directory
  apps:                                        # /ori-init が repo folder 名から自動導出
    - name: <project-folder>                   # 例: promptnotes
      path: apps/<project-folder>              # apps_root/name
default_root: ts                               # roots[].id を指定
roots:
  - id: ts
    app: <project-folder>                      # この root がどの app に属するか
    path: apps/<project-folder>/src            # slice は apps/<app>/src/<bc>/slices/<id>/
    language: typescript
    layer_set: ddd-vsa-hex-ts
    adapter: eslint
    slice_root: <bc>
    public_entry: index.ts
  - id: rs
    app: <project-folder>                      # Tauri は同一 app 内の言語境界
    path: apps/<project-folder>/src-tauri/src
    language: rust
    layer_set: ddd-vsa-hex-rs
    adapter: rust
    slice_root: <bc>
    public_entry: mod.rs
cross_root:                                    # Tauri 言語境界(同一 app 内)
  - from: { root: rs, path: shared/contracts }
    to:   { root: ts, path: <bc>/types }
    generator: tauri-specta
    auto_generated: true
layer_sets: { ... }
slice_internal: { ... }
cross_slice:
  prohibited_direct: true
  via: [shared/contracts, shared/events]
cross_bc:                                      # cross-BC bridge(app 内)
  via: [apps/<app>/src/shared/contracts, apps/<app>/src/shared/events]
  same_event_bus: true                         # MVP は単一 bus(app 内)
cross_app:                                     # monorepo の app 間契約
  via: [contracts-package, shared-events-bus]  # publish/subscribe またはコード共有
page_map_marker: phase-11b                     # phase 11b auto-managed section
---
```

### Monorepo の場合(N-app)

`workspace.apps:` と `roots:` を app 単位で複数 declare:

```yaml
workspace:
  apps_root: apps
  apps:
    - {name: frontend, path: apps/frontend}
    - {name: backend,  path: apps/backend}
roots:
  - id: ts-frontend
    app: frontend
    path: apps/frontend/src
    language: typescript
    layer_set: ddd-vsa-hex-ts
    slice_root: <bc>
    public_entry: index.ts
  - id: ts-backend
    app: backend
    path: apps/backend/src
    language: typescript
    layer_set: ddd-vsa-hex-ts
    slice_root: <bc>
    public_entry: index.ts
cross_app:                                     # frontend↔backend の event/contract 同期
  - from: { app: backend,  path: src/<bc>/shared/contracts/events }
    to:   { app: frontend, path: src/<bc>/shared/contracts/events }
    generator: copy-or-publish
    auto_generated: true
```

`.ori/domain/` は **1 set** で全 app 共有(monorepo = 1 DDD doc)。各 BC がどの app に住むかは `bounded-contexts.md` frontmatter または architecture.md `roots[].bc_assignments:` で declare(詳細は §13 検討中)。

### Layer set 例(ddd-vsa-hex-ts)

```yaml
layer_sets:
  ddd-vsa-hex-ts:
    layers:
      - { id: shared,    kind: shared }
      - { id: domain,    kind: slice, slice_internal: slice-internal-ts }
      - { id: ui-widget, kind: ui-layer, order: 1 }
      - { id: ui-page,   kind: ui-layer, order: 2 }
    rules:
      cross_layer:
        - { from: ui-page,    allow: [ui-widget, shared, domain] }
        - { from: ui-widget,  allow: [shared, domain] }
        - { from: domain,     allow: [shared] }
        - { from: shared,     allow: [] }
      same_layer: prohibited
      public_entry_required: true

slice_internal:
  slice-internal-ts:
    sub_layers: [domain, application, infrastructure, presentation, tests]
    rules:
      - { from: presentation,   allow: [application, domain] }
      - { from: application,    allow: [domain] }
      - { from: infrastructure, allow: [domain] }
      - { from: domain,         allow: [] }
      - { from: tests,          allow: [domain, application, infrastructure, presentation] }
```

### Page Map(phase 11b auto-managed)

```markdown
## Page Map

<!-- BEGIN ori-distill phase-11b auto-generated; do not edit between markers -->
- ui-widget:
  - prompt-workspace (depends_on: [prompt-list-slice, prompt-editor-slice])
- ui-page:
  - registration (depends_on: [register-user, check-username])
- ui-page:
  - home (depends_on: [prompt-workspace])
<!-- END ori-distill phase-11b auto-generated -->
```

### Adapter

| Adapter ID | Language(s) | Output |
|---|---|---|
| eslint | TS / JS | `eslint.config.ori.js`(eslint-plugin-boundaries) |
| rust | Rust | `tests/arch.rs` または `cargo-modules` config |
| generic | any | `.ori/arch-rules.json` + tiny CLI checker(regex) |

Adapter は APM bundle 内に統合(`.apm/skills/ori-arch/adapters/<name>/index.js`、template + JSON injection 分離構造)。`@ori-ori/arch-adapter-*` npm package は v0.3-J で publish 停止(`packages/arch-adapter-*/` 物理撤去)。Phase K1 (`ori-6kd.2`) で adapter bundle を `.apm/skills/ori-arch/adapters/` に co-locate し、runtime artifact を消費 skill bundle と同 tree に常駐させる構造に整理した。ori-arch skill が dynamic import で skill 隣接の bundle を解決する。

---

## 13. Cross-cutting concerns

### 2 分類

| 分類 | Concerns | 性質 |
|---|---|---|
| **Always-on** | error handling, logging, trace ID | DDD doc 言及不要、ori default 生成 |
| **DDD-driven** | auth(MVP)、rate limiting / audit trail / i18n / metrics(v0.2+) | DDD doc に declare されたら生成、空なら code ゼロ |

### Always-on

#### Error handling
- Layer 別:
  - `<bc>/domain/`: `Result<T, DomainError>`
  - `<bc>/slices/<slice>/application/`: `Result<T, AppError>`
  - `<bc>/slices/<slice>/infrastructure/`: `throw InfraError`(handler が catch & convert)
  - `<bc>/slices/<slice>/presentation/`: UI 用 message 変換
- DomainError は Phase 5 invariants から、AppError は Phase 9 step error case から派生
- Error 型: `src/shared/errors/`(`@ori-generated`)

#### Logging
- Auto-log: handler entry / success / error、domain event emit
- Logger interface: `src/shared/logger.ts`(`@ori-generated`)、tech 依存実装
- Manual log は user が補助的に追加可能

#### Trace ID
- Handler context で auto-attach、log child binding に含む
- Distributed tracing は v0.2+

### DDD-driven(auth)

`.ori/domain/validation.md` の `## Authorization rules` section に declare:

```markdown
## Authorization rules

### slice:register-user
- access: anonymous

### slice:change-email
- access: authenticated
- require-role: user
- ownership-check: user.id == ctx.userId
```

- 空 / 「認証を必要としません」 → guard code 一切生成なし
- declare あり → handler 冒頭に `ensureAuthenticated` / `ensureRole` / `ensureOwnership` 注入
- Helpers: `src/shared/guards/`(`@ori-generated`、declare あり時のみ存在)

### 方針変更時の自動追従

```
validation.md 編集 → /ori-sync 検出 → 全 slice dirty → /ori-flow --regenerate で auth 適用
```

---

## 14. 失敗モードと resume

### Manifest `flow_state.history` SSoT

全 phase transition を `from`/`to`/`timestamp` で記録。`completed_phases` / `failed_phases` 等は history から導出。

### Entry schema

| Field | 必須? | 説明 |
|---|---|---|
| `from` | ✅ | 直前 state(初回のみ `null`) |
| `to` | ✅ | 新 state |
| `timestamp` | ✅ | ISO8601 UTC |
| `event` | optional | 補助 event type |
| `reason` | optional | failed/aborted 理由 |
| `note` | optional | 人間向け補足 |
| `failed_phase` | optional | `to: failed` の時の失敗 phase |
| `bd_issue` | optional | 関連 bd issue ID |
| `files_written` | optional | 書かれた file path |
| `files_user_modified` | optional | 手動編集を検出した file path |
| `criteria_check` | optional | smart skip 時の結果 |

### Re-entry 判定 4 path

| Path | 条件 | 挙動 |
|---|---|---|
| **Fresh** | history なし or `to: done` | phase 1 から通常起動 |
| **Clean resume** | 失敗 phase あり + 全 file hash match | 「resume / restart?」(default: resume) |
| **Manual fix detected** | file hash mismatch | 4 択(Skip / Re-generate / Proposal / Abort)、default = **Skip**(ユーザー意思尊重) |
| **Stale lock** | flow-lock heartbeat > 30 min | 「Continue / Restart / Abort」 |

### Smart skip(success criteria check)

各 phase は success criteria 持つ。Resume 時に criteria 既に満たせば re-run せず skip:
- verify: derives_from resolve 可 + DDD doc complete
- plan: bd issue 存在
- test-red: 期待された assertion で fail
- impl-green: all green
- refactor: type check + green 維持
- review: critical issue なし
- finalize: hash 整合 + dirty 解除済

### `--regenerate` フラグ

`/ori-flow <id>` 中断 resume(default)
`/ori-flow <id> --restart` phase 1 から
`/ori-flow <id> --from=<phase>` 指定 phase から
`/ori-flow <id> --regenerate` input 変更時の re-run(全 phase)

### Scenario B(dirty + manually_edited 衝突)

両 status 並列保持。`/ori-flow --regenerate` 時に default = **Proposal**(`.ori/proposals/` に AI 版書き、user 手動 merge)。

### 人間先行 file(Scenario D)

`/ori-flow` 初回起動時、target file が存在 + `@ori-generated` marker なし →
「Import / Overwrite / Abort」を提示。Import 選択 → `@ori-imported` marker 追加。

### Concurrent /ori-flow

MVP は flow-lock で禁止。v0.2+ で aggregate-level lock 検討。

---

## 15. 配布 — APM single package

### 構造

```
ori/                               # APM package source
├── apm.yml
├── README.md
├── LICENSE
├── .apm/
│   ├── hooks/
│   │   ├── sync-trigger.json
│   │   └── scripts/sync-trigger.js
│   ├── skills/
│   │   ├── ori-init/SKILL.md
│   │   ├── ori-ddd-1-discovery/SKILL.md
│   │   ├── ...(32 個)
│   │   ├── ori-flow/
│   │   │   ├── SKILL.md
│   │   │   ├── scripts/                  # esbuild bundle(per-skill)
│   │   │   └── templates/                # Phase K3: skill 同梱化
│   │   │       ├── slice-manifest.yaml.tpl
│   │   │       └── page-manifest.yaml.tpl
│   │   └── ori-arch/
│   │       ├── SKILL.md
│   │       ├── scripts/                  # esbuild bundle(per-skill)
│   │       ├── adapters/                 # Phase K1: per-skill artifact co-locate
│   │       ├── architecture-md-schema.md # Phase K2: skill 同梱化
│   │       ├── patterns/                 # Phase K2: skill 同梱化
│   │       │   └── ddd-vsa-hex/
│   │       │       ├── pattern.md        # stack-agnostic
│   │       │       ├── ai-notes.md
│   │       │       └── stacks/
│   │       │           ├── typescript/
│   │       │           │   ├── architecture.md.tpl
│   │       │           │   └── example-slice/   # AI 参照用 study material
│   │       │           └── typescript-tauri/
│   │       │               ├── architecture.md.tpl
│   │       │               └── example-slice/
│   │       └── references/
│   │           └── tech/                 # 12 tech catalog
│   └── agents/                           # cross-harness subagents(Layer 1)
└── docs/                        # ori repo 内部 doc(deploy 対象外)
    ├── design.md                # ★ 本ファイル
    └── contributing/
        ├── adding-pattern.md
        ├── adding-tech.md
        ├── adding-adapter.md
        └── adding-task-adapter.md
```

### 開発 source は別 directory monorepo

```
packages/                        # TS monorepo(開発時 SSoT)
├── parser/
├── coherence/
├── arch-adapters/               # adapter source(template + JSON injection 分離)
│   ├── eslint/                  # → .apm/skills/ori-arch/adapters/eslint/index.js に bundle
│   ├── generic/                 # → .apm/skills/ori-arch/adapters/generic/index.js に bundle
│   └── rust/                    # → .apm/skills/ori-arch/adapters/rust/index.js に bundle
├── slice-runner/                # slice/page 生成本体
└── skills/                      # skill ごとの bundle entry
    ├── ori-arch/src/export.ts
    ├── ori-sync/src/sync.ts
    └── ...
```

ビルド時に esbuild が各 skill bundle を `.apm/skills/<name>/scripts/` に書き出し、各 adapter bundle を `.apm/skills/ori-arch/adapters/<name>/index.js` に書き出す (Phase K1: `templates/*.tpl` も `packages/arch-adapters/<name>/templates/` から同 dir にコピーされる)。CI で `pnpm build && git diff --exit-code .apm/` で stale check。

> v0.3-J で `packages/arch-adapter-{eslint,rust,generic}/` (旧 publishable npm package) は物理撤去。配布は APM 単独 (`apm install dev-komenzar/ori`) に一本化、`@ori-ori/arch-adapter-*` の npm publish は停止。
>
> v0.3-L (`ori-7dx`、2026-06-11) で `packages/cli/` も物理撤去。`@ori-ori/cli` の bin は deprecate stub のため `dist/` だけ npm registry に残り、source / workspace package は repo から消滅した。配布は APM 単独。

### npm package 戦略

- **`@ori-ori/cli` および `@ori-ori/arch-adapter-*` 系を deprecate**
  - placeholder package (publish 名前温存目的、機能なし) — `@ori-ori/templates` 等
    ```bash
    npm deprecate @ori-ori/<name>@'*' \
      "Reserved for future use. Currently distributed via APM: apm install dev-komenzar/ori"
    ```
  - 実体ありで bundled に移行済 package — `@ori-ori/arch-adapter-{eslint,rust,generic}` (v0.3-J で APM bundle に embed、新規 publish 停止)
    ```bash
    npm deprecate @ori-ori/arch-adapter-eslint@'<=0.2.0' \
      "Now bundled into .apm/skills/ori-arch/adapters/eslint via APM. Use 'apm install dev-komenzar/ori' instead. See https://github.com/dev-komenzar/ori"
    ```
- 配布は APM 単独
- CI 用途: APM-installed skill scripts を直接 node で実行
  ```bash
  node <APM-installed-path>/.apm/skills/ori-sync/scripts/drain-queue.js --check-only
  ```

### Harness 対応

| Harness | Skills | Hooks | Agents |
|---|---|---|---|
| Claude Code | ✅ | ✅ | ✅ |
| OpenCode | ✅ | ✗(手動 /ori-sync) | ✅ |
| Cursor | ✅ | ✅ | ✅ |
| Gemini | ✅ | ✅ | ✗ |
| Copilot | ✅ | ✅ | ✅ |
| Codex | ✅ | ✅(TOML) | ✅ |
| Windsurf | ✅ | partial | partial |

---

## 16. Curated content の置き場

| 種別 | 場所 | 用途 |
|---|---|---|
| Architecture schema | `.apm/skills/ori-arch/architecture-md-schema.md` | `.ori/architecture.md` の形式 (Phase K2 で `ori-arch` 配下に co-locate) |
| Pattern | `.apm/skills/ori-arch/patterns/<name>/{pattern.md, ai-notes.md, stacks/<stack>/...}` | cross-skill(arch, types, flow, impl-green が参照)。stack-agnostic / stack-specific を階層分け |
| Tech catalog | `.apm/skills/ori-arch/references/tech/<id>.md` | ori-arch 専属 |
| Slice / Page manifest templates | `.apm/skills/ori-flow/templates/{slice,page}-manifest.yaml.tpl` | `/ori-flow new-slice` / `new-page` が bundle 隣接で参照 (Phase K3) |
| Hook scripts | `.apm/hooks/scripts/` | APM auto-deploy |
| Skill scripts | `.apm/skills/<name>/scripts/` | per-skill esbuild bundle |
| Adapter | `.apm/skills/ori-arch/adapters/<name>/` | adapter 統合 (Phase K1) |
| Contributor docs | `docs/contributing/*.md` | ori 開発者向け |

### Phase K co-location map

Phase K (2026-06-10) で旧 `.apm/contexts/` (cross-skill 共有 SSoT) を全廃し、runtime artifact を consuming skill bundle と co-locate した。

| 旧 path | 新 path | 移動 PR |
|---|---|---|
| `.apm/contexts/adapters/<name>/` | `.apm/skills/ori-arch/adapters/<name>/` | K1 (`ori-6kd.2`) |
| `.apm/contexts/architecture-md-schema.md` | `.apm/skills/ori-arch/architecture-md-schema.md` | K2 (`ori-6kd.4`) |
| `.apm/contexts/patterns/` | `.apm/skills/ori-arch/patterns/` | K2 (`ori-6kd.4`) |
| `.apm/contexts/templates/{slice,page}-manifest.yaml.tpl` | `.apm/skills/ori-flow/templates/...` | K3 (`ori-6kd.3`) |
| `.apm/contexts/skill-scripts-build.md` | `docs/skill-scripts-build.md` | K3 (`ori-6kd.3`) |

```
.apm/skills/ori-arch/
├── architecture-md-schema.md          # .ori/architecture.md の形式 (Phase K2)
├── adapters/                          # (Phase K1) per-adapter bundle + templates
└── patterns/                          # (Phase K2)
    └── ddd-vsa-hex/
        ├── pattern.md                       # stack-agnostic
        ├── ai-notes.md
        └── stacks/
            ├── typescript/
            │   ├── architecture.md.tpl
            │   └── example-slice/           # AI on-demand study material
            └── typescript-tauri/
                ├── architecture.md.tpl
                └── example-slice/

.apm/skills/ori-flow/
├── scripts/                           # esbuild bundle
└── templates/                         # (Phase K3) bundle 隣接の manifest テンプレ
    ├── slice-manifest.yaml.tpl
    └── page-manifest.yaml.tpl
```

---

## 17. Repository layout

### 原則: project root はメタ artifact 専用、code は `apps/<app>/` 配下

Project root には ori / harness / contributor 向けメタ artifact(`.ori/`, `.claude/`, `README.md` 等)のみ置き、実行 code は `apps/<app>/src/...` 配下に集約する。これにより:

- single-app: `apps/<project-folder>/` 1 個(`/ori-init` が repo folder 名から自動導出)
- monorepo(N-app): `apps/frontend/`, `apps/backend/` 等を user が `.ori/config.yaml` `workspace.apps:` に追加
- Tauri 等の言語境界 cross-root は **同一 app 内**(`apps/<app>/{src,src-tauri}/`)で扱い、app 境界とは直交

### Per-project(対象プロジェクト側、/ori-init が作る最小構成)

```
<project>/
├── .ori/
│   ├── config.yaml                         # ori_version, workspace.apps, task_manager, models
│   ├── domain/                             # DDD phase 出力(空、phase 進行で populate)
│   │   └── .gitkeep
│   ├── slices/                             # /ori-flow 出力(全 app 共通)
│   │   └── .gitkeep
│   ├── pages/                              # /ori-flow + page-grouping 出力
│   │   └── .gitkeep
│   ├── proposals/                          # SSoT 違反時 auto-generated
│   │   └── .gitkeep
│   ├── state/                              # snapshot + queue(gitignore)
│   │   └── .gitignore
│   └── architecture.md                     # /ori-arch で populate
├── .gitignore
├── README.md
└── AGENTS.md                               # AI-aware conventions stub
```

`/ori-init` は **silent** で .ori/ skeleton のみ作成。`apps/` directory も生成 **しない**(/ori-arch の framework init が apps/<app>/ を populate)。`.ori/config.yaml` には repo folder 名から導出した default app entry を書き込む。

### `/ori-arch` の責務分担(2026-06-07 確定)

`/ori-arch` は次の 3 ステップで動く。**worked example の物理コピーは行わない**:

1. **decide**: pattern (DDD-VSA-Hex 等) と stack (typescript / typescript-tauri 等) をユーザと対話で確定
2. **upstream framework init**: `pnpm create vite@latest`, `pnpm create tauri-app`, `cargo new` 等を実行(各 tech catalog の bash 手順)。bootstrap 系ファイル(`package.json`, `tsconfig.json`, `eslint.config.js`, `vitest.config.ts`, `.gitignore`, `README.md` 等)はここで生まれる
3. **ori artifact 追加**: `.apm/skills/ori-arch/patterns/<pattern>/stacks/<stack>/architecture.md.tpl` を読み、app 名等の placeholder を解決して target の `.ori/architecture.md` を書き出す。これ以外 ori はファイルを足さない

`example-slice/` (`.apm/skills/ori-arch/patterns/<pattern>/stacks/<stack>/example-slice/`) は AI 専用の study material で、target にコピーされない。AI は `/ori-flow new-slice <id>` 等で初回 slice を生成する際に on-demand で参照し、ユーザーの実ドメインに沿った slice を直接生成する。これにより「他人の `task-management` example を消して自分のものを書く」工数が消え、ユーザー固有の domain を最初から扱える。

### /ori-arch 後の構造(single-app + Tauri 例)

```
<project>/
├── .ori/                                    # SSoT(上記)
├── docs/architecture/
│   ├── pattern.md                          # /ori-arch 決定記録
│   └── stack.md                            # /ori-arch interview 結果
└── apps/
    └── <app>/                              # /ori-init が repo folder 名から導出
        ├── src-tauri/src/                  # Rust(framework init 出力 + ori overlay)
        │   └── <bc>/
        │       ├── domain/                 # Phase 10 types(BC 共有)
        │       ├── shared/contracts/events/ # Phase 6 events
        │       ├── shared/events/event-bus.rs  # @ori-generated
        │       ├── slices/
        │       │   └── <slice-id>/
        │       │       ├── domain/         # slice 固有(command DTO)
        │       │       ├── application/handler.rs
        │       │       ├── infrastructure/
        │       │       └── tests/
        │       └── mod.rs
        ├── src/                            # TS frontend
        │   ├── <bc>/
        │   │   ├── types/                  # tauri-specta auto-generated
        │   │   └── slices/<slice-id>/presentation/
        │   ├── pages/
        │   │   └── <page-id>/
        │   │       ├── Page.tsx
        │   │       ├── route.ts
        │   │       └── e2e/<scenario>.spec.ts
        │   └── shared/
        │       ├── errors/                 # @ori-generated
        │       ├── logger.ts               # @ori-generated
        │       ├── guards/                 # @ori-generated(auth declare 時)
        │       ├── contracts/events/       # cross-BC events
        │       └── events/global-event-bus.ts  # @ori-generated
        └── package.json                    # app 固有 manifest
```

### /ori-arch 後の構造(monorepo: frontend + backend 例)

```
<project>/
├── .ori/                                    # SSoT(1 set、全 app 共通)
│   ├── domain/                             # 1 DDD doc set
│   ├── slices/                             # slice manifest が app: で配置先を指定
│   └── architecture.md                     # roots を app 単位で複数 declare
├── apps/
│   ├── frontend/
│   │   ├── src/
│   │   │   ├── <bc>/                       # BC が frontend に住む場合
│   │   │   │   ├── domain/
│   │   │   │   ├── shared/contracts/events/
│   │   │   │   └── slices/<slice-id>/...   # slice.app: frontend
│   │   │   ├── pages/<page-id>/
│   │   │   └── shared/...
│   │   └── package.json
│   └── backend/
│       ├── src/
│       │   ├── <bc>/                       # 同じ BC が backend にも住みうる(別 slice 群)
│       │   │   ├── domain/
│       │   │   ├── shared/contracts/events/
│       │   │   └── slices/<slice-id>/...   # slice.app: backend
│       │   └── shared/...
│       └── package.json
└── package.json                            # workspace root(pnpm-workspaces 等)
```

monorepo では:
- `.ori/domain/` は **1 set** で全 app 共有(BC は domain 概念であり deployment 単位ではないため)
- 同じ BC が複数 app に住みうる(frontend の UI workflow と backend の handler が同じ `order` BC を共有)
- slice manifest の `app:` field で配置先 app を明示(N-app では必須)
- cross-app の event/contract 同期は `architecture.md` の `cross_app:` で declare

---

## 18. 用語集

| 用語 | 説明 |
|---|---|
| **slice** | 1 use case = 1 handler = 1 vertical slice。`.ori/slices/<id>/` に manifest。 |
| **page** | N slice の宿主(UI composition unit)。`.ori/pages/<id>/`。Phase 11b 由来。 |
| **BC** | Bounded Context。DDD strategic 概念。code 上の top-level module。 |
| **DDD-VSA-Hex** | DDD + Vertical Slice + Hexagonal pattern。MVP 唯一の curated pattern。 |
| **node** | graph 上のノード(doc または code file)。`<type>:<name>` 形式の node_id。 |
| **node_id** | グローバルユニーク識別子(例: `aggregate:User`, `scenario:registration-happy-path`)。 |
| **manifest** | slice/page の generation メタデータ。`.ori/{slices,pages}/<id>/manifest.yaml`。 |
| **derives_from** | manifest の論理依存宣言(SSoT 保護対象)。 |
| **inputs** | manifest の物理依存 + hash(change detection 用)。 |
| **flow_state** | manifest 内の 7-phase 進行状況(history-based)。 |
| **Confidence bands** | edge 信頼度。Green (≥0.90) / Amber (≥0.50) / Gray (<0.50)。MVP は Green declared edge のみ。 |
| **status** | slice/page status。`planned | generated | dirty | stale | manually_edited`。 |
| **@ori-generated** | ori が生成した file の marker(手動編集検出用)。 |
| **@ori-imported** | 人間先行 file を ori 管理下に取り込んだ marker。 |
| **@ori-stub** | 操作 signature 宣言済、body 未実装の marker。 |
| **@ori-operation / @ori-status** | aggregate 内 operation 単位の SSoT 保護 marker。 |
| **tech catalog** | curated tech 集合(`.apm/skills/ori-arch/references/tech/<id>.md`)。 |
| **variants** | tech doc 内の sub-選択肢(例: nextjs の rendering: ssr/ssg/isr)。 |
| **phase_hooks** | tech doc 内の phase 後処理 hook 宣言。 |
| **axes-vocabulary** | stack axis 名の controlled vocabulary。 |
| **dynamic axes** | /ori-arch が DDD docs から推論して、必要な axis 群を proposal する方式。 |
| **APM** | Microsoft Agent Package Manager。ori の配布手段。 |
| **Beads** | 分散グラフ issue tracker。ori MVP の task management。 |
| **harness** | AI ハーネス(Claude Code, OpenCode, etc.)。 |
| **curated** | ori repo で contributor が PR で追加するリソース。 |
| **always-on / DDD-driven** | cross-cutting concerns の 2 分類(default 生成 vs DDD doc declare で生成)。 |

---

## 19. ロードマップ

### v0.2 — close the /ori-flow execution gap(epic = `ori-5mi`)

Phase B(MVP v0.1 dogfooding on promptnotes-vcsdd, epic = `ori-qzq`)で 2 slice(capture-auto-save / edit-past-note)を /ori-flow で完走させた結果、最大 friction は「`/ori-flow` が skill 内手動代替なしでは動かない」と判明。v0.2 は **execution gap close** に絞る。

採用済み:

- ✓ APM package 配布(`apm install dev-komenzar/ori` で skill scripts が target に展開、`ori-ix4`)
- ✓ `ori slice run` MVP 実装(7-phase runner stub の解消、`ori-bdx`)
- `/ori-plan` SKILL.md 改訂 — AI が下流 beads issue を idempotent に bd create(`ori-zds`、進行中)

v0.2 スコープ外として deferred(2026-06-03 決定):

- F2 / `ori-29p` test infra auto-scaffold — 起点が brownfield(既存 project の package.json / test stack 尊重)。greenfield では `/ori-arch` の framework_init が test runner install を担うため不要
- F5 / `ori-5wv` brownfield migration helper(`/ori-migrate-domain`) — v0.2 acceptance は greenfield で PASS、brownfield ケースを v0.2 blocker とする根拠なし。連動で `ori-6us`(移行ロス gaps)も同時 defer
- `ori-100` `--setup-issues` CLI feature — CLI 廃止方針(v0.3)で不要。代替として AI が直接 `bd create` を行う方向に置換(`ori-zds`)

### v0.3 — CLI 廃止 → skill + scripts ベース実行モデル(epic = `ori-1ny`)

`ori-execution-model-shift-2026-06-03` で確定した方針を全面実施する。配布を APM single package に一本化し、`@ori-ori/cli` を含む `@ori-ori/*` 4 packages を npm deprecate。共通 TS logic は `packages/` source + esbuild で `.apm/skills/<name>/scripts/` に per-skill bundle する。

主要スコープ:

- 実行モデル明文化(`docs/skill-scripts-build.md`、Phase K3 で旧 `.apm/contexts/` から移管)— pure bash で書ける I/O 系は `scripts/*.sh`、JS が必要(yaml / zod / parser / coherence 依存等)は `packages/skills/<name>/index.ts` を esbuild → ESM single-file bundle
- `packages/cli/src/commands/` の 7 サブコマンド(arch / sync / slice / page / lint / proposals / model)を skill scripts に移植
- templates / docs / SKILL.md の CLI 言及を skill ベースに書き換え
- ✓ `packages/cli` 撤去(`ori-7dx`、2026-06-11) + `@ori-ori/*` 4 packages を npm deprecate
- pre-commit hook で `build:skills` stale check + contributing docs 整備
- **テンプレート方式の根本見直し**(`ori-5er`、2026-06-07 追加): `packages/templates/` 全廃 → `.apm/skills/ori-arch/patterns/<name>/stacks/<stack>/` 構造へ。target には `.ori/architecture.md` のみ書き、bootstrap は upstream の framework init に委譲、worked example は AI 専用 study material として skill 側保持

採用済み(2026-06-04 時点):

- ✓ Phase A(`ori-rem`): `packages/skills/` 足場 + esbuild `build:skills` + CI stale check
- ✓ Phase B(`ori-2y2`, `ori-s3o`, `ori-ezc`, `ori-539`, `ori-4gp`): CLI 7 コマンドを skill scripts に移植
- ✓ Phase E(`ori-ju9`): `.apm/skills/` 内 SKILL.md / scripts コメントの CLI 言及書き換え
- ◐ Phase C(`ori-wuf`): `packages/templates/` の CLI 言及を skill scripts ベースに書き換え → Phase H で対象自体が消滅したため自然解消
- ◐ Phase D(`ori-csa`): ドキュメント(README / docs/start / design §15)の CLI 動線書き換え(進行中)
- ✓ Phase H1(`ori-p2f`): `.apm/skills/ori-arch/patterns/ddd-vsa-hex/` 新構造作成(pattern.md / ai-notes.md / stacks/typescript/{architecture.md.tpl, example-slice/} / stacks/typescript-tauri/...)
- ✓ Phase H2(`ori-62h`): `/ori-arch` SKILL.md 改修 + scripts/ 再設計(`copy-template.sh` 廃止、`render-architecture.js` 新設)
- ✓ Phase H3(`ori-27a`): `packages/templates/` 物理撤去 + `resolve-upstream.test.ts` を `packages/skills/ori-derive/` に移管、生きた SSoT は `.apm/skills/ori-arch/patterns/` に一本化

未着手(2026-06-07 計画):

- ○ Phase H4(`ori-s44`): 受け入れテスト — greenfield で `apm install` → `/ori-init` → upstream init → `/ori-arch` → `render-architecture` の通しテスト

(Phase H 全体の動機 — 2026-06-07 確定): APM 配布経由で `packages/templates/` が lookup path から外れ `copy-template.sh` が失敗する障害が判明し(greenfield 検証)、同時に「target に worked example を物理コピーする方式」自体が ori 責務(設計原則 1「DDD ドキュメント = SSoT、コードは派生」)と整合しないことが明確化したため、テンプレート方式を全廃。詳細決定は §6 / §17 参照。

#### Phase J — adapter を skill bundle に取り込み + npm package 廃止(epic = `ori-c4w`)

動機: 旧 `packages/arch-adapter-*` は TS file 内に大 template literal で Rust/JS syntax を書く「string-concat code generation」の業界 anti-pattern (Prisma / OpenAPI Generator / sqlc / GraphQL codegen が template-based 分離で解決している領域)。加えて consumer が `pnpm add -D @ori-ori/arch-adapter-eslint` を要求される構造は skill-only 実行モデル(`ori-execution-model-shift-2026-06-03`)と不整合 (`ori-s44` acceptance §F-1)。

スコープ:

- ✓ Phase J1(`ori-apv`、PR #34): adapter を template + JSON injection 分離構造に再設計、当時は `.apm/contexts/adapters/<name>/{templates,index.js}` に bundle、ori-arch skill は dynamic import で skill 隣接から解決(`ori-0ok` 内包) — Phase K1 で `.apm/skills/ori-arch/adapters/` に移動
- ✓ Phase J2(`ori-osm`): 旧 `packages/arch-adapter-{eslint,rust,generic}/` を物理撤去 + `@ori-ori/arch-adapter-*@<=0.2.0` を npm deprecate 強化(`ori-u5d` 内包、`scripts/npm-deprecate-adapters.sh` 参照)
- ○ Phase J3(未起票、J2 merge 後): greenfield acceptance retry — `/tmp/ori-acceptance-j/` で `apm install` → 追加 `pnpm add` 無しで adapter 動作確認

#### Phase K — runtime artifact を consuming skill bundle に co-locate(epic = `ori-6kd`)

動機: 旧 `.apm/contexts/` は「cross-skill 共有 SSoT」として運用してきたが、ほぼ全 entry が 1 つの consuming skill (`ori-arch` か `ori-flow`) しか参照しておらず、共有の事実が成立していない。runtime artifact が skill bundle と別 tree にあると (1) APM install 後の解決 path が複雑化し、(2) `apm_modules/<owner>/<repo>/.apm/contexts/...` walk が必要になり、(3) "どの skill が壊れたら artifact が stale になるか" の責務帰属が曖昧になる。Phase J1 の `.apm/contexts/adapters/` 構造で同じ問題が顕在化したため、全 runtime artifact を consuming skill bundle と co-locate に揃える。

スコープ:

- ✓ Phase K1(`ori-6kd.2`): adapter bundle を `.apm/skills/ori-arch/adapters/<name>/` に co-locate、templates SSoT を `packages/arch-adapters/<name>/templates/` に格上げ、`resolveAdaptersDir` を `--adapters-dir` + bundle-adjacent の 2 候補のみに簡略化 (apm_modules walk / `$ORI_ADAPTERS_DIR` env / legacy parent-of-repo fallback を削除)
- ✓ Phase K2(`ori-6kd.4`): `architecture-md-schema.md` と `patterns/` を `.apm/skills/ori-arch/` 配下に co-locate、`resolvePatternsDir` を bundle-adjacent 1 候補に簡略化
- ✓ Phase K3(`ori-6kd.3`): `.apm/contexts/templates/{slice,page}-manifest.yaml.tpl` を `.apm/skills/ori-flow/templates/` に co-locate、`loadTemplate` を bundle-adjacent (`dirname(import.meta.url)/../templates`) に変更、`skill-scripts-build.md` を `docs/skill-scripts-build.md` に移管、`.apm/contexts/` を物理撤去
- ○ Phase K4(`ori-6kd.1`): Phase K greenfield acceptance retry — `apm install dev-komenzar/ori` 後の skill bundle で `/ori-flow new-slice` / `new-page` / `/ori-arch render-architecture` が動作することを 2-session pattern で確認

得られた pattern: **「runtime artifact は常に consuming skill bundle 隣に置く」** — esbuild bundle output (`scripts/*.js`)、template/asset (`templates/`, `patterns/`)、adapter (`adapters/`) いずれも `import.meta.url` 基準で bundle-adjacent に解決する。`.apm/<top-level>/` (旧 `contexts/`) のような cross-skill 共有 dir は導入しない — 共有が必要なら最も依存度の高い skill に co-locate し、他 skill は path 参照のみで再利用する。

### v0.4 以降(将来想定)

- **ブラウンフィールド対応** — 既存プロジェクトの `docs/domain` を `.ori/domain` 規約に持ち上げる migration helper(`/ori-migrate-domain`、`ori-5wv` / `ori-6us` deferred)。あわせて test infra auto-scaffold(`ori-29p`)も brownfield 起点として再開
- 追加 pattern(2 個目を入れて pluggability 実証)
- 追加 template(Python / Go / Rust / Kotlin / Next.js / Django 等 — 詳細は README「init テンプレートを募集しています」参照)
- 追加 arch adapter(import-linter / ArchUnit / depguard 等)
- 追加 task manager adapter(Linear / GitHub Issues / Jira)
- `/ori-rules`(machine-checkable invariants 生成)
- Static analysis による code-to-code edge 自動検出
- 分散 event bus / Concurrent /ori-flow(aggregate-level lock)

### 検討中

- DDD-driven concerns: rate limiting / audit trail / i18n / caching / metrics
- AI 自動 polling(`/ori-work --auto`)
- frontmatter `confidence:` field の手動指定許可
- Aggregate-level vs slice-level lock 戦略
- Distributed tracing(OpenTelemetry)

---

## 補足: 設計プロセス記録

- 旧設計 doc: `ori-design.md`(2026-05-17 sketch、本ファイルに merge 後削除)
- grill-me セッション: Q1-Q20(2026-05-19)で確定した決定を本ファイルに反映
- 議論言語: 日本語
- 議論スタイル: 1 質問ずつ、推奨つき、最終決定はユーザー
