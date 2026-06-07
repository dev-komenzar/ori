# Acceptance テストの進め方ガイド

`/ori-flow` を含む skill 群を greenfield プロジェクトに対して走らせる際の
受け入れテスト (acceptance) の流儀をまとめたドキュメント。各 retry の
記録 (`ori-3ik-greenfield-*.md`) は履歴として残し、本 README は
**繰り返し参照する手順** のみを保持する。

## 1. 2-session 構成 (prep + run)

経験則として `/ori-flow` の自動回しは prep と run を別 session に分けると
clean に進む。skill registry の load timing 問題 (run session で初めて新
skill が visible になる) を回避するため。

| Session | 目的 | 終了条件 |
|---|---|---|
| **prep** | scaffold + manifest 整備 + bd issue 起票 + greenfield 環境準備 | `ori slice new <id>` で manifest skeleton 完成、bd ready で対象 epic + slice issue が見える、`pnpm test` で worked example PASS |
| **run** | `/ori-flow <id>` で 7 phase (derive → plan → test-red → impl-green → refactor → review → finalize) 自動実行 | 全 phase closed、acceptance criteria 全 PASS、friction を bd 起票 |

prep の進め方 (design.md §17 三段構え):

1. test 用 dir を作成 (`/tmp/ori-acceptance-greenfield-<n>`)
2. `bash <ori-repo>/.apm/skills/ori-init/scripts/create-skeleton.sh --dest <test-dir>` で `.ori/` scaffold (ori-ks7 fix 後は bd init も自動)
3. **upstream framework init**: `cd <test-dir> && mkdir -p apps/<app> && cd apps/<app> && pnpm create vite@latest . --template vanilla-ts` (Tauri 併用なら `pnpm add -D @tauri-apps/cli && pnpm tauri init` も)。`package.json` / `tsconfig.json` / `vitest.config.ts` 等 bootstrap 系はここで揃う
4. `<test-dir>` で `node <ori-repo>/.apm/skills/ori-arch/scripts/render-architecture.js --pattern ddd-vsa-hex --stack typescript --bc <bc-name>` → `.ori/architecture.md` が書き出される
5. test dir で `pnpm install && pnpm test` を走らせて upstream init 出力 (sample test 含む) の sanity check
6. `node <ori-repo>/.apm/skills/ori-flow/scripts/new-slice.js <slice-id>` → manifest.yaml の `derives_from:` を埋める (AI は `.apm/contexts/patterns/ddd-vsa-hex/stacks/typescript/example-slice/` を参照して slice を生成)
7. 関連 domain 文書を `.ori/domain/` に置く
8. prep session を **終了**して、新規 session で run

## 2. bd workspace の扱い (重要 / ori-cvv 該当箇所)

acceptance 中に phase skill が起票する bd issue は **test dir 側の
`.beads/` workspace に閉じる**。main ori repo の `.beads/` には sync
されないため、carry-over (acceptance 中に検出した friction) を main
repo に転記しないと acceptance 完了後に履歴を失う。

ori-3ik retry (2026-06-03) の §Friction F-7 を参照。

### 選択肢比較

| 方法 | コスト | trade-off | 推奨ユースケース |
|---|---|---|---|
| **(a) symlink** | 低 (1 コマンド) | test dir と main repo が同一 bd db を共有 → acceptance 中の issue が main repo にも見える / 一方で test dir 削除時の整合性に注意 | 1 session で完結する短期 acceptance |
| **(b) shared dolt remote** | 中 (remote 設定) | 両 workspace を別 db のまま並走し、定期 `bd dolt push` で remote 経由 mirror。test dir 消失でも remote に残る | 複数日に跨る長期 acceptance / 複数 acceptance を並列実行 |
| **(c) 手動 carry-over 再起票** | 高 (人手仕事) | acceptance 完了時に test dir bd issue を `bd list --status=closed` で吐き出し、main repo 側で `bd create` で再起票 (closed/open 維持判断付き) | 単発 acceptance + lessons の整理を兼ねたい場合 (ori-3ik retry が採用) |

### (a) symlink 手順

```bash
# test dir 作成前 or 直後
mkdir -p /tmp/ori-acceptance-greenfield-<n>
ln -s <ori-repo>/.beads /tmp/ori-acceptance-greenfield-<n>/.beads
```

注意:
- `.beads/` を共有するので、acceptance 中に発行された ori-<prefix>-<n> は
  main repo の prefix 空間に同居する。test dir prefix を別にしたい場合は
  この方法は使えない (b/c に倒す)
- test dir 削除前に symlink を解除しないと `.beads/` 本体まで rm される
  事故が起きる。`unlink` で symlink のみ消すこと
- bd v1.0.x の auto-export (`.beads/issues.jsonl`) も symlink 越しに
  動作することを `bd ready` で事前確認

### (b) shared dolt remote 手順

```bash
# main repo 側 (初回のみ)
cd <ori-repo>
bd dolt push   # 既存 remote (例: https://hosted.doltdb.com/owner/db) に push

# test dir 側 init
cd /tmp/ori-acceptance-greenfield-<n>
bd init -p ori- --non-interactive
# bd config に remote を pin
bd dolt remote add origin <main-remote-url>

# acceptance 進行中 / 完了時
bd dolt push     # test dir → remote
cd <ori-repo> && bd dolt pull    # remote → main repo
```

trade-off:
- 自動 conflict 解消は無いため、prefix 衝突 (test dir も main repo も `ori-`) を避けるため `ORI_BD_PREFIX=acc` 等で acceptance 用 prefix に切り替える運用がベター

### (c) 手動 carry-over 再起票手順 (ori-3ik retry 実績)

```bash
# acceptance 完了時、test dir で:
cd /tmp/ori-acceptance-greenfield-<n>
bd list --status=closed --json > /tmp/acceptance-issues.jsonl

# main repo 側で重要な carry-over を再起票:
cd <ori-repo>
# 例: F-1 を ori- 空間で再起票
bd create --title "..." --description "..." --type=bug --priority=2
```

trade-off:
- 全 issue を再起票するのは現実的でないため、acceptance log の
  Friction 表 (F-N / ori-XXX 行) に限定するのが慣習 (ori-3ik retry が採用)
- closed issue の関連 commit / dolt 履歴は test dir に閉じるため、
  acceptance log markdown が SSoT 化する

## 3. 推奨デフォルト

新規 acceptance を開始する際の推奨は以下:

- **1-session の小規模 PoC**: (a) symlink
- **複数 session に跨る通常 acceptance**: (c) 手動 carry-over (ori-3ik retry と同じ運用)
- **複数 acceptance 並列 / チーム共有**: (b) shared dolt remote

将来的に ori-ks7 の bd init 統合に `--share-with-main` flag が入れば
(a) を自動化できる予定 (本 README も追記する)。

## 4. 過去の acceptance log への参照

| Acceptance | 結論 | 主要 friction | 関連 issue |
|---|---|---|---|
| `ori-3ik-greenfield-2026-06-03.md` | (retry へ continued) | scaffold 動線整備 | PR #12 |
| `ori-3ik-greenfield-2026-06-03-retry-pre.md` | prep 完了 | F-1 (pnpm dlx 構文) | PR #14 |
| `ori-3ik-greenfield-2026-06-03-retry.md` | PASS (7 phase 完走) | F-1〜F-7 | PR #14 + 本 batch (#15-#18) |

新規 retry を行ったら本表を 1 行追加し、SSoT を 1 ファイルに集約する。
