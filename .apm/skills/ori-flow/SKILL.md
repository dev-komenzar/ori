---
name: ori-flow
description: 1 slice / page を 7 phase で自律的に実装する。bundled runner (scripts/flow.js) が状態遷移と self-fix 判定を担当し、各 phase の LLM 起動はこの orchestrator が行う。各 phase 1 回まで self-fix、それでも失敗時は人間に判断を委ねる
---

ユーザが `/ori-flow <id>` を呼んだ際、該当 slice / page の 7-phase workflow を自動的に最後まで進めます。**全 phase 手動コピペは廃止**。

## 引数

- `id`：実装する slice / page の id（`.ori/slices/<id>/` または `.ori/pages/<id>/` に存在するもの）
- `--kind`：`slice` (default) または `page`

## 設計

- **状態遷移 / self-fix 判定 / verdict 解釈は bundled runner が担当**：`scripts/flow.js` （esbuild bundle、`packages/slice-runner/` source）。pure logic + I/O のみで LLM 呼出しはしない。
- **各 phase の LLM 起動はこの orchestrator が担当**：phase skill (`/ori-derive` etc.) を順次呼び、終了時に runner にステータスを記録させる。
- **review phase だけ Task tool 経由で fresh-context spawn**：`.apm/agents/ori-reviewer.agent.md` を別 context で起動し、verdict.json を file 経由で受け取る。
- **log**：各 phase の log は `.ori/<slices|pages>/<id>/run/<phase>/` に保存。
- **CLI ではない**：`ori slice run` のような CLI コマンドは作らない（design.md §15、@ori-ori/cli soft-deprecate）。

## bundled runner の呼び出し

`scripts/flow.js` のパスは harness によって異なる：
- Claude Code (APM install 後)：`.claude/skills/ori-flow/scripts/flow.js`
- ori repo 内 dev / monorepo：`.apm/skills/ori-flow/scripts/flow.js`

以下のコマンドは「project root を cwd として」`node <path>/flow.js <subcommand> [...]` を実行する。**stdout は単一 JSON object**、`ok: true|false` フィールドで成否判定する。

| subcommand | 用途 |
|---|---|
| `init --id <id> [--kind page]` | manifest 存在確認 + run dir scaffold + status.json 初期化（resume 検出） |
| `start --id <id> --phase <p>` | phase 開始記録 |
| `end --id <id> --phase <p> --result done\|failed [--notes "..."]` | phase 終了記録 + next_phase / allow_self_fix を返す |
| `record-fix --id <id> --phase <p>` | self-fix 試行を +1（再実行前に必ず呼ぶ） |
| `review-prep --id <id>` | reviewer agent spawn 用の prompt / capability / verdict_path を返す |
| `review-verdict --id <id>` | review/verdict.json を parse し PASS/NEEDS_FIX/REJECT + next_action を返す |
| `report --id <id>` | 現在の run state 全量を返す |

## 手順

### 0. 前提

- `init` を呼ぶ前に「slice / page が既存か」をユーザに対して fuzzy match 確認する：`ls .ori/slices/` (または pages) を見て、id 不在なら近い候補を提示し、ユーザに「これですか？ それとも新規作成しますか？」と尋ねる。**勝手に scaffold しない**。
- epic issue `ori-<kind>-<id>` の存在は warning（無くても続行可、ユーザに通知のみ）。

### 1. init

```
node <path>/flow.js init --kind <slice|page> --id <id>
```

- `ok: false, error: "manifest_missing"` → 停止して上記の fuzzy match に戻る。
- `ok: true, resumed: true` → 途中再開。`next_phase` から再開する。
- `ok: true, resumed: false` → 新規実行。`next_phase` (= `derive`) から開始。

### 2. 各 phase の実行ループ

`next_phase` が `null` になるまで以下を繰り返す。`phase = next_phase`。

1. **start**：`flow.js start --id <id> --phase <phase>` で開始記録。
2. **phase 本体実行**：phase に対応する skill を起動する：
   - derive → `/ori-derive <id>`
   - plan → `/ori-plan <id>`
   - test-red → `/ori-test-red <id>`
   - impl-green → `/ori-impl-green <id>`
   - refactor → `/ori-refactor <id>`
   - review → **§3 review 専用フロー**を参照
   - finalize → `/ori-finalize <id>`
3. **end**：phase の結果に応じて `flow.js end --id <id> --phase <phase> --result done|failed --notes "..."` を呼ぶ。
4. **end 出力の解釈**：
   - `result=done` → `next_phase` を取り出して loop の先頭に戻る。`next_phase` が `null` ならループ終了（= finalize 完了）。
   - `result=failed` かつ `allow_self_fix=true` →
     a. `flow.js record-fix --id <id> --phase <phase>` を呼ぶ
     b. phase 本体をもう一度実行（一手だけ修正を試みる）
     c. 結果に応じ再度 `end` を呼ぶ
   - `result=failed` かつ `allow_self_fix=false` → **停止**してユーザに hint を提示。

### 3. review phase 専用フロー（phase 6）

review は main session の文脈バイアスを排除するため**必ず fresh-context で別 session を spawn**する。

1. `flow.js start --id <id> --phase review`
2. `flow.js review-prep --id <id>` を呼んで spawn metadata を取得（`prompt`, `transcript_path`, `verdict_path`, `capability=reasoning`）。
3. **Task tool で fresh-context agent を spawn**：
   - `subagent_type` は harness で利用可能な reasoning capability の agent（Claude Code なら `general-purpose` でも可、`Plan` でも可、ori-reviewer.agent.md を読ませる）。
   - prompt として `review-prep` が返した `prompt` を渡す（fresh context なのでこの prompt が単独で完結する形になっている）。
4. spawn 完了後、`flow.js review-verdict --id <id>` を呼んで verdict.json を解釈する：
   - `verdict_missing` → reviewer がファイルを書かなかった。**spawn を 1 回まで再試行**。それでも無ければ停止。
   - `verdict=PASS` → `flow.js end --id <id> --phase review --result done` でループ続行。
   - `verdict=REJECT` → `flow.js end --id <id> --phase review --result failed --notes "REJECT"` を呼んだ後に **停止**してユーザ判断。
   - `verdict=NEEDS_FIX` かつ `allow_fix_round=true`：
     a. `flow.js record-fix --id <id> --phase review` を呼ぶ
     b. findings に従い impl-green / refactor を再実行（最も影響の大きい phase に戻る）
     c. その後 review を再度実行（**最大 1 回往復**）
   - `verdict=NEEDS_FIX` かつ `allow_fix_round=false` → 停止してユーザ判断。

### 4. test-red の GREEN-on-first 検出

`/ori-test-red` 実行後、テストが**最初から GREEN** なら仕様バグの可能性が高い。**強制停止**：
- `flow.js end --id <id> --phase test-red --result failed --notes "initial-green"` を呼ぶ
- ユーザに「spec の invariant がそもそも実装済みか / テストが弱すぎないか」を確認する
- self-fix で進めない

### 5. 完了

`next_phase=null`（= finalize 完了）に到達したら：

- `flow.js report --id <id>` で最終 status を取得し、各 phase の completed_at を要約してユーザに提示
- 次の選択肢を提示：
  - **次 slice / page パス**：`/ori-flow <next-id>` — 他に dirty / 未着手があれば続行
  - **proposal review パス**：`/ori-review-proposals`
  - **全体俯瞰パス**：`/ori-feature-status`
  - **session 締めパス**：CLAUDE.md の Session Completion 手順（`bd dolt push` / `git push`）

## エラー時のポリシー（要約）

- 各 phase 内で失敗：runner が `allow_self_fix=true/false` で許可判定する。**手動で勝手に retry しない**。
- self-fix 失敗 / REJECT / verdict_missing 再試行失敗 / initial-green：**全て停止**して human flag に渡す。
- 停止時は `bd update <epic> --notes "..."` で状態反映 + ユーザに next action を示すこと。

## 注意

- subtask は beads issue description 内 `- [ ]` checklist に追加（別 issue にしない）
- domain 文書を変更したくなった場合は `/ori-sync --force <path>` または `/ori-propose` で proposal 生成
- slice / page 不在時に勝手に新規作成しない（必ずユーザ確認）
- bundled runner (`scripts/flow.js`) を呼ぶ際、stdout JSON が parse できない / `ok=false` だった場合は **即停止**（harness 差異の可能性 - silent fallback しない）
