---
name: ori-sync
description: ドメイン文書と派生文書 (slice / page / scenario) の変更を検知し、dirty マークを伝播する
---

`/ori-sync` を実行して変更を検知・伝播します。AI agent が文書編集後に呼ぶか、post-write hook が自動起動します。

## スクリプト

```bash
node ./scripts/sync.js [--file=<path>] [--since=<ref>] [--check]
```

- `--file=<path>` — 単一ファイルに限定して変更検知
- `--since=<ref>` — HEAD の代わりに指定 git ref と比較（`.ori/` 配下の差分 + 未追跡ファイルが対象）
- `--check` — dirty マーク残存時に非ゼロ終了（CI モード）

## 手順

1. **変更検知**：
   ```bash
   node ./scripts/sync.js
   ```
   - `.ori/` 配下の変更ファイルと、影響を受ける slice / page / scenario を検出
2. 次の規則で `status.yaml.dirty[]` に追加する（`affected_phase` = やり直す phase）

   | 変更 | dirty になる doc | affected_phase |
   |---|---|---|
   | domain 文書の section | その section を `derives_from` に持つ slice / page / scenario | derive |
   | doc の `manifest.yaml` | その doc 自身 | derive |
   | scenario の `spec.md` | その scenario | generate |
   | scenario の `tests/**`・runner config（`wdio.conf.ts` / `playwright.config.ts` / `docker-compose.yml` / `tsconfig.json` / `teardown.mjs` / `validation.md`） | その scenario | review |
   | page の `spec.md` / `testids.yaml` | その page を `pages:` に持つ scenario | generate |

   - **domain は section 単位**：`derives_from` の `#anchor` が H2/H3 の `{#id}` なら、その節（見出し + 子節を含む本文）が変わったときだけ dirty にする。次の場合はファイル単位で判定する：anchor なし・H1 の anchor・存在しない anchor・同じ anchor が複数ある・比較元の版が無い（新規 / 削除 / rename されたファイル、git 外）・`--file` / `--force` で明示指定したとき
   - **derived 内の変更は review 済みの doc だけ、review.md より新しいものだけ**：doc の `review.md` より後に変わったファイルだけを dirty にする（flow を回して review 済みの変更を HEAD との差分として再び dirty にしないため）。`review.md` が無い doc（初回の flow 中）には付けない
     - 判定は mtime（秒単位、同秒は review 済み扱い）で、`/ori-doctor` の `check-scenario-staleness.sh` と同じ。clone / checkout 直後は mtime が揃わないため、誤検知・見落としがありうる
     - domain → derived の伝播にはこの判定は無い。domain の編集は finalize 前に commit する（未 commit のまま finalize すると、次の `/ori-sync` が同じ dirty を付け直す）
   - `--since` に解決できない ref を渡すと exit 2（shallow clone で `--check` が素通りしないため）
   - `manifest.yaml` / `status.yaml` が YAML として不正なら、該当箇所（`path:line:col`）を報告して exit 1
3. dirty な slice / page / scenario ごとに：
   - 該当 phase の beads issue を reopen（手動 or `bd update --status=open`）
   - ユーザに「これらの slice の再 derive が必要です」と通知
4. 派生文書（spec.md）の直接編集は SSoT 違反のため不可。spec に不備がある場合は domain 文書を修正し `/ori-sync` を再実行するか、`/ori-propose` で upstream 修正提案を作成してください

## 次のアクション

`/ori-sync` 実行後、状況に応じて以下を提示：

- **dirty slice がある場合**：影響を受けた slice ごとに `/ori-flow <slice-id>` を**必須**で提案（最も影響が大きい順に）。dirty の手動解除は禁止されており、`/ori-finalize` の `clear-dirty.js` は review PASS なしで解除を拒否する
- **dirty なし**：通常終了。次の作業（新 slice `/ori-flow` or DDD `/ori-distill`）へ
- **整合性エラー検出時**：`/ori-doctor` で詳細診断 → 修復方針をユーザと相談
- **scope 1 slice を締めたい場合**：`/ori-finalize <slice-id>` を呼ぶ（/ori-sync は全体伝播、/ori-finalize は単一 slice 終了）
