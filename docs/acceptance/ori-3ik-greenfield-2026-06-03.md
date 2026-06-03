# ori-3ik: Greenfield Acceptance Log (2026-06-03)

## 目的

v0.2 epic (ori-5mi) のキー検証ステップとして、greenfield 新規 repo 上で
`ori init` → template scaffold → `/ori-flow <slice>` までが end-to-end に
回るかを確認する。

## セットアップ

```bash
mkdir -p /tmp/ori-acceptance-greenfield && cd /tmp/ori-acceptance-greenfield
git init -q
# build CLI fresh (dist は古い可能性あり)
pnpm --filter @ori-ori/cli build   # from monorepo root
# greenfield 内で ori CLI 実行 (global install されていないので絶対パス)
node /path/to/ori/packages/cli/dist/bin.js init
```

## 結果

### ✅ 動いたもの

- `ori init` が `.ori/{config.yaml,domain,slices,pages,proposals,state}/` を生成
- config.yaml の `workspace.apps_root: apps` + `apps[0]` 自動導出 (ori-nwb 反映済)
- `.ori/domain/*` に 12 個の scaffold (discovery.md, bounded-contexts.md, ...) seed
- `ori slice new test-slice` で `.ori/slices/test-slice/{manifest.yaml,spec.md,notes.md,status.yaml,tests/}` 生成
- `ori lint` (空 .ori 配下) → No issues
- `ori arch export` は `.ori/architecture.md` 不在で error (期待動作)

### ❌ ブロッカー (greenfield path が成立しない原因)

| ID | 概要 | P |
|---|---|---|
| **ori-9gy** | `/ori-arch` skill 不在: ori init next-steps が `/ori-arch` を案内するが skill 実体無し | P1 |
| **ori-ap7** | greenfield 用 `ori scaffold` (template copy) CLI 不在 — `apps/<app>/src/` を立ち上げる手段が手動 copy のみ | P1 |
| **ori-3ju** | `docs/start/typescript-web.md §2` が `ori init --template <name>` と `package.json` 生成を主張 (実装と乖離) | P1 |
| ori-05r | `/ori-init` skill が存在しない `scripts/create-skeleton.sh` を参照 (CLI 置換漏れ) | P2 |
| ori-ulh | CLI version が `src/index.ts:14` に hardcode され package.json と drift (0.0.1 vs 0.1.0) | P2 |
| ori-8tx | `ori slice new` が `.ori/slices/<id>/tests/` 作成 (新 apps/ layout と二重) | P3 |

### ⚠ 未検証 (ブロッカー解消後にリトライ)

- `/ori-flow <slice>` 7-phase end-to-end (derive → plan → test-red → impl-green → refactor → review → finalize)
- 生成 code が `apps/<app>/src/<bc>/slices/<id>/` に着地するか
- failing test → impl で GREEN になる test サイクル
- `status.yaml` 全 phase completed
- friction log を取り、痛みポイントを各 phase skill の修正 issue として起票

`ori slice run` も現状 stub (`Phase runner not wired yet. Coming in next milestone.`)。
phase 実行は AI harness (Claude Code 等) が SKILL.md instruction を踏襲する設計のため、
greenfield test dir に `apm install dev-komenzar/ori --target claude` で skills を
配って Claude Code session を立ち上げ直す必要がある。今 session の Claude Code は
このリポジトリの workspace を target にしているので、test dir では skill が見えない。

## 結論

greenfield acceptance は **3 つの P1 ブロッカー** (ori-9gy / ori-ap7 / ori-3ju) を
解消してから retry する。それまで ori-3ik は blocked。

最も影響が大きいのは ori-ap7 (template scaffold path 不在) で、これが解決すれば
greenfield user が `apps/<app>/src/` を持つ状態に到達できる。次に ori-9gy
(/ori-arch skill 作成) — pattern/framework 決定の対話 UX が立ち上がる。最後に
ori-3ju (docs 整合) で新動線を案内する。
