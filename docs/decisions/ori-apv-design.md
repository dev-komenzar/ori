# ori-apv (Phase J1) — adapter を template + injection 構造で再設計

> **2026-06-10 後注**: 本 doc 内の adapter bundle path (`.apm/contexts/adapters/<name>/`) は J1 時点の決定。Phase K1 (`ori-6kd.2`) で `.apm/skills/ori-arch/adapters/<name>/` に再 co-locate、Phase K3 (`ori-6kd.3`) で `.apm/contexts/` dir 自体を物理撤去。現行の path は [CHANGELOG.md](../../CHANGELOG.md) v0.3-K / [docs/design.md §15-16](../design.md) 参照。

- **Issue**: ori-apv (Phase J epic = ori-c4w)
- **内包**: ori-0ok (eslint.config.ori.js ヘッダの旧 CLI 案内修正)
- **後続**: ori-osm (J2: 旧 packages/arch-adapter-* 撤去 + npm deprecate)、ori-XXX (J3: greenfield acceptance retry、別途起票)
- **Status**: 2026-06-09 grill 確定 (6 論点) → 実装中

## 背景

現状 `packages/arch-adapter-{eslint,rust,generic}/` は TS file 内に大 template literal で Rust/JS の syntax を書く「string-concat code generation」の業界 anti-pattern。同時に `export.js` が `require('@ori-ori/arch-adapter-eslint')` で npm package を user cwd から動的解決する構造で、consumer 側で `pnpm add -D` が要求される (skill-only モデルと不整合)。

業界標準解: **template language + data injection の分離** (Prisma / OpenAPI Generator / sqlc / GraphQL codegen で確立)。本 PR はこのパターンを採用し、加えて adapter の解決経路を skill bundle 隣接 (`.apm/contexts/adapters/`) に統一する。

## 設計判断 (grill 6 論点)

### Q1. Placeholder 形式

**確定**: uniform `__ORI_<NAME>__` stub identifier convention。

- 文字列スカラ: `"__ORI_FOO__"` (有効な string literal、rustfmt/prettier PASS、IDE は string highlight)
- bool / 配列スカラ: bare `__ORI_FOO__` (有効な identifier、formatter PASS、IDE は normal identifier highlight)
- JS 可変長配列 (forbidden blocks 等): `const __ORI_EXTRA_BLOCKS__ = [];` を定義、spread (`...__ORI_EXTRA_BLOCKS__`) で展開
- 配列 body の組み立て (Matcher[] → Rust struct literal string 等) は adapter 側の言語別 lowering function に閉じる (10-20 行/adapter)

**判定基準**:
- (a) formatter (rustfmt / prettier) PASS: ✅ stub identifier も string literal も valid syntax
- (b) IDE 構文ハイライト保持: ✅ identifier / string として認識される
- (c) adapter index.ts の複雑化: ✅ `Object.entries(subs).forEach(([k,v]) => out.replaceAll(\`__ORI_${k}__\`, v))` で完結

**棄却案**:
- Mustache `{{X}}`: rustfmt が parse error → 判定基準 (a) 違反
- Comment-marker `// ORI_INJECT: <name>`: スカラと配列で形式が分かれて一貫性欠ける、line-level replace の実装も脆弱

**判定基準外として明示**: template は `cargo check` は通らない (`__ORI_MATCHERS__` 等は型不一致)、`rustfmt --check` のみが通る。

### Q2. dist commit + build pipeline

**確定**: 既存 skill pattern (`packages/skills/<name>/src/` → `.apm/skills/<name>/scripts/`) を踏襲。

```
packages/arch-adapters/<name>/src/
  index.ts                 ← TS source (~30 行の JSON 注入 engine)
  index.test.ts            ← adapter unit test
  integration.test.ts      ← template + injection integration test
  __snapshots__/           ← full output snapshot

       ↓ scripts/build-adapters.mjs (esbuild)

.apm/contexts/adapters/<name>/
  index.js                 ← build output (commit、APM 配布)
  templates/
    <name>.tpl             ← static asset (SSoT、APM 配布)
```

- **src 配置**: `packages/arch-adapters/<name>/src/` (workspace 内、`packages/arch-adapter-*` 旧 package と物理 swap 可能)
- **build output 命名**: `.apm/contexts/adapters/<name>/index.js` (フラット)。`dist/` は `.gitignore` の global pattern と衝突するため避ける (skill 側も `scripts/` で同種の回避)
- **templates 配置**: `.apm/contexts/adapters/<name>/templates/*.tpl` (static asset、APM 配布、production と test で同一 SSoT)
- **build pipeline**: `scripts/build-adapters.mjs` 新設、`scripts/build-skills.mjs` の esbuild config を踏襲 (`createRequire` banner inject、format: esm、platform: node、target: node20)、`#!/usr/bin/env node` shebang は省略 (adapter は library)
- **命名**: `packages/arch-adapters/<name>/` (複数形・グループ化)。旧 `packages/arch-adapter-{eslint,rust,generic}/` 個別 package との衝突回避、J2 で旧撤去後も命名一貫
- **package.json scripts**: root に `build:adapters` 追加、aggregate `build` が `build:skills && build:adapters` を呼ぶ

**棄却案**:
- (B) tsx 直接 import: apm install 先で tsx peer dep 強制 → 「追加 tooling 0」違反
- (C) 初回 invocation で自動 build → `~/.cache/ori/adapters/`: consumer に esbuild 強制 + cache 管理複雑

**issue description との差分**:
- description: `.apm/contexts/adapters/<name>/{src,templates,dist}/`
- 確定: src は `packages/arch-adapters/<name>/src/`、`dist/` 名は使わず flat `index.js`、templates は `.apm/contexts/adapters/<name>/templates/`

### Q3. parser への責務分離

**確定**: parser package 内に新 file `architecture-ir.ts` を追加、IR 型と build* 関数を pure function として実装、index.ts から flat re-export。

```
packages/parser/src/
  architecture.ts          ← 既存: parse + types
  architecture-ir.ts       ← NEW: IR 型 + buildMatchers/buildRules/buildBridges
  architecture-ir.test.ts  ← NEW: 旧 adapter test の IR 計算ロジックを移植
  index.ts                 ← re-export 追加
```

IR 型:

```ts
export interface Matcher {
  layerId: string;
  kind: "shared" | "slice" | "ui-layer";
  prefix: string;
  slice: boolean;
}
export interface Rule {
  from: string;
  allow: string[];
}
export interface Bridge {
  from: string;
  via: string;
}

export function buildMatchers(spec: ArchitectureSpec, root: RootConfig): Matcher[];
export function buildRules(spec: ArchitectureSpec, root: RootConfig): Rule[];
export function buildBridges(spec: ArchitectureSpec, root: RootConfig): Bridge[];
```

**parser の責務再定義**: 「parser = architecture-md schema domain SSoT package」。markdown parse 共通機能 + arch spec 専用の型/zod + IR 構築まで同居。adapter は IR を受け取り、言語別 string lowering のみ実行。

**棄却案**:
- 新 package `packages/arch-ir/` (三層分離): workspace 過剰分割、現在規模に対して overkill
- parser 内 subpath exports (`@ori-ori/parser/arch-ir`): tsup build 設定の複雑化、認知負荷
- adapter 群の `_shared/`: workspace 内 sibling 依存が不自然

**判定基準**:
- parser の testability / 再利用性: ✅ `architecture-ir.ts` 独立 file、pure function、既存 `architecture.test.ts` に影響なし
- adapter の言語固有 lowering が IR の純粋関数に閉じる: ✅ adapter は `Matcher[]` → Rust struct literal string への変換のみ実装

### Q4. dynamic import path 解決

**確定**: `render-architecture.ts` の `resolvePatternsDir` パターンを複製して `resolveAdaptersDir` を新設。adapter は `<adaptersDir>/<name>/index.js` を dynamic import。

```ts
// In packages/skills/ori-arch/src/export.ts (bundle → .apm/skills/ori-arch/scripts/export.js)
async function resolveAdaptersDir(args: ParsedArgs): Promise<string> {
  const candidates: string[] = [];
  if (args.adaptersDir) candidates.push(args.adaptersDir);
  if (process.env.ORI_ADAPTERS_DIR) candidates.push(process.env.ORI_ADAPTERS_DIR);
  const here = dirname(fileURLToPath(import.meta.url));
  candidates.push(resolve(here, "..", "..", "..", "contexts", "adapters"));            // bundled (skill 隣接)
  candidates.push(resolve(here, "..", "..", "..", "..", "..", ".apm", "contexts", "adapters"));  // repo dev fallback
  for (const cand of candidates) if (await exists(cand)) return resolve(cand);
  process.exit(2);
}

async function loadAdapter(name: string, adaptersDir: string): Promise<OriArchAdapter> {
  const entry = join(adaptersDir, name, "index.js");
  if (!(await exists(entry))) { /* error */ }
  const mod = await import(pathToFileURL(entry).href);
  const adapter = ((mod as { default?: unknown }).default ?? mod) as OriArchAdapter;
  return adapter;
}
```

- 旧 `createRequire(cwd/package.json) + require.resolve('@ori-ori/arch-adapter-...')` を削除
- consumer 側 `pnpm add -D @ori-ori/arch-adapter-*` 不要に
- esbuild bundle 後の `import.meta.url` 挙動は `render-architecture.ts` で動作実証済 (memory: esbuild-bundle-format-esm-platform-node-cjs-dep)

**adapter 側の templates 解決**: adapter (`.apm/contexts/adapters/<name>/index.js`) は自身の `import.meta.url` 基準で隣接 `./templates/` を読む。test 時は `opts.templatesDir` で明示注入。

```ts
// In packages/arch-adapters/eslint/src/index.ts (build → .apm/contexts/adapters/eslint/index.js)
export default {
  name: "eslint",
  language: ["typescript", "javascript"],
  async export(spec, root, opts = {}) {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const tplDir = opts.templatesDir ?? path.join(here, "templates");
    const tpl = await fs.readFile(path.join(tplDir, "flat-config.js.tpl"), "utf-8");
    // ...
  },
};
```

**adapter interface 拡張** (parser `architecture.ts`):

```ts
export interface OriArchAdapter {
  name: string;
  language: string | string[];
  export(spec: ArchitectureSpec, root: RootConfig, opts?: { templatesDir?: string }): Promise<AdapterExportResult>;
  check?(spec: ArchitectureSpec, root: RootConfig, opts?: { templatesDir?: string }): Promise<AdapterCheckResult>;
}
```

**dev での build ordering**: root `package.json` の `pretest` hook で `pnpm run build:adapters` を実行、`packages/arch-adapters/<name>/src/integration.test.ts` が build 済 `index.js` の templates を読めるよう確保。

**棄却案**:
- adapters dir を `.apm/skills/ori-arch/adapters/` に置く: issue 確定済の `.apm/contexts/adapters/` を覆す理由なし
- `import.meta.resolve` (Node 22 native): apm install 先の Node version 保証なし

### Q5. test 移植戦略

**確定**: 旧 adapter test 17 件 (Rust 8 + ESLint 9) を責務別に三層分割。

| Layer | 配置 | 内容 |
|---|---|---|
| L1 parser IR | `packages/parser/src/architecture-ir.test.ts` | buildMatchers/Rules/Bridges の出力構造 (`toEqual` で IR 比較)、slice_subdir handling、order、language filter |
| L2 adapter unit | `packages/arch-adapters/<name>/src/index.test.ts` | adapter contract (name/language)、non-target language で files=[]+note、output path 計算 |
| L3 adapter integration + snapshot | `packages/arch-adapters/<name>/src/integration.test.ts` + `__snapshots__/integration.test.ts.snap` | templates 注入 → 主要特性 assertion (boundaries import、forbidden_imports block、Rust の `parent_module_dir` 等の regression marker) + 1 つの full-output snapshot |

**snapshot 配置**: vitest convention の test file 隣接 `__snapshots__/`。`.apm/` 配下には置かない (APM bundle は distributable、test artifact 流出回避)。

**assertion + snapshot 混合戦略**: 意味のある変更は assertion failure として明示、微細な変更 (空白・order) は snapshot diff として visible。snapshot 更新は `vitest -u` で意図的に、PR review で diff 確認。

**template formatter PASS check**: Step 3 (検証) で実施、`scripts/check-templates.sh` 等で `prettier --check` / `rustfmt --check` を CI gate として運用 (vitest 配下ではない)。

### Q6. ori-0ok 内包スコープ

**確定**: J1 PR で `flat-config.js.tpl` と `arch_test.rs.tpl` 両 template の AUTO-GENERATED ヘッダコメント、および adapter notes 内の CLI 案内を skill-based invocation 案内に書き換える。

**書き換え文言** (両 template 共通):
```
Regenerate via the /ori-arch skill (Claude Code) — see .apm/skills/ori-arch/SKILL.md
```

**J1 スコープ外として明示**:
- `.apm/skills/ori-arch/SKILL.md`: PR #33 (ori-1gs) が touch 中、merge 競合回避
- `docs/start/*.md` 群: docs gap は別 issue (ori-3ju 等) で起票済
- 旧 `packages/arch-adapter-*/src/index.ts`: J2 (ori-osm) で物理削除
- adapter notes の peer install hint (`pnpm add -D eslint-plugin-boundaries` 等): consumer 環境への正しい guidance、skill-only モデルと無関係

**検証** (Step 3 で実施):
```bash
grep -r 'ori arch export\|ori arch check\|@ori-ori/arch-adapter' .apm/contexts/adapters/ && echo "VIOLATION" || echo "OK"
grep -r '/ori-arch skill' .apm/contexts/adapters/ | wc -l  # 期待: 2 (rust + eslint)
```

## 実装順 (依存最小化)

1. `packages/parser/src/architecture-ir.ts` 追加 + `architecture-ir.test.ts` (IR 単体 test、旧 adapter test の IR 計算部分を移植)
2. `packages/arch-adapters/{eslint,rust,generic}/` 新規作成 (`package.json` + `tsconfig.json` + `src/index.ts` + tests)
3. `.apm/contexts/adapters/{eslint,rust,generic}/templates/*.tpl` 作成 (新 placeholder convention 適用)
4. `scripts/build-adapters.mjs` 新設 (esbuild config は build-skills.mjs 踏襲)
5. root `package.json` に `build:adapters` 追加、`pretest` で build を kick
6. `packages/skills/ori-arch/src/export.ts` / `check.ts` の `loadAdapter` を新方式に置換 (`resolveAdaptersDir` 追加、`createRequire` 削除)
7. `packages/skills/ori-arch/package.json` から旧 devDeps `@ori-ori/arch-adapter-*` 削除
8. 旧 `packages/arch-adapter-*/` は **本 PR では削除しない** (J2 ori-osm の所掌、重複は許容)
9. `pnpm test` 全 pass を確認、`pnpm typecheck` PASS、grep 検証 (旧 CLI 案内 / npm package 参照が残らない)、template formatter PASS

## 関連 memory

- `ori-execution-model-shift-2026-06-03-ori` — skill-only モデルへの移行方針
- `cli-cli-ori-ori-cli-ori-bin-npm` — CLI 拡張禁止 (新 bin も禁止) の射程
- `ori-apm-single-package-ori-ori-cli-ori` — APM single package 配布、npm 全 soft-deprecate
- `esbuild-bundle-format-esm-platform-node-cjs-dep` — esbuild bundle + CJS dep の罠と `createRequire` banner workaround
- `ori-architecture-enforcement-ssot-ori-architecture-md-plugga` — architecture enforcement の SSoT 構造
- `skill-registry-load-timing-2026-06-03` — skill registry の session-scoped load (本 PR 内では skill 実体修正なし、J3 acceptance は別 session)
