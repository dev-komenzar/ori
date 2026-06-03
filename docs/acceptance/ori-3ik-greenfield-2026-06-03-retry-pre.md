# ori-3ik greenfield acceptance retry (pre-`/ori-flow`) — 2026-06-03

前回 (`docs/acceptance/ori-3ik-greenfield-2026-06-03.md`) で blocked になった
3 件の P1 (ori-9gy, ori-ap7, ori-3ju) を含む 6 件の friction を PR #13 で
解消したのち、scaffold までの greenfield 動線を `/tmp/` で再走した記録。

## 環境

- 作業 dir: `/tmp/ori-acceptance-greenfield-2/`
- ori repo branch: `task/ori-9gy-ori-arch-skill` (PR #13, open)
- node 22.22.2, pnpm 10.33.4
- `@ori-ori/cli` registry version: 0.1.0 (本 retry の直前に publish 済み)

## 検証スコープ

skill が registry に load された session が必要な `/ori-distill` / `/ori-flow`
は本 retry では扱えない（新規作成した `/ori-arch` skill は **今 session の registry**
には未 load。次セッションで `apm install` 後に検証する）。

このため今回は **scaffold までの動線**（user が "Getting started" として手で
打つ部分）を検証した。

| 検証ポイント | 結果 |
|---|---|
| `bash .apm/skills/ori-init/scripts/create-skeleton.sh` で `.ori/` skeleton + config.yaml + domain scaffold seed (12 件) + `.gitignore` が一発で立つ | ✅ |
| `bash .apm/skills/ori-arch/scripts/copy-template.sh --template ddd-vsa-hex-typescript` で template が cwd に展開、`apps/template-app/` が `apps/<derived-app-name>/` に rename、root `package.json` の name も同期 | ✅ |
| `pnpm install` 成功（template 依存解決） | ✅ |
| `pnpm test` で template 同梱の sample テスト 11 件すべて PASS | ✅ |
| `apm install dev-komenzar/ori --target claude` → 新 session で `/ori-arch` / `/ori-flow` を呼べる | ⏸ 次セッション持ち越し |
| `/ori-flow <slice-id>` 7-phase end-to-end 完走、code が `apps/<app>/src/<bc>/slices/<id>/` に、tests が `apps/<app>/src/<bc>/slices/<id>/tests/` に出る | ⏸ 次セッション持ち越し |

## 観測された friction

### F-1 (fixed in this PR): `pnpm dlx` の `-p` flag misuse

**症状**: `bash .apm/skills/ori-init/scripts/create-skeleton.sh` を PATH に `ori`
が無い環境で実行すると、`Unknown command ori` が出て `ori init` が走らない。

**原因**: 修正前の skill script が `pnpm dlx -p @ori-ori/cli ori init` を組み立てて
いたが、`-p` は **npx 固有**の flag。pnpm dlx は「最初の non-flag arg を package」
として扱い、残りを bin (`ori`) に forward する仕様。結果 `pnpm dlx @ori-ori/cli ori init`
相当に解釈され → `ori ori init` になり、内側の `ori` を sub-command として
解釈できず unknown 扱いとなった。

**修正**: `pnpm dlx @ori-ori/cli init` に変更（同 PR commit `82e79b9`）。
`@ori-ori/cli` package が export している bin 名が `ori` のため、pnpm dlx は
これを実行し追加引数 `init` を受け取る。

**意義**: greenfield user は基本 `pnpm dlx` か `npx` で `ori init` を呼ぶケースが
多いため、本 fix が無いと greenfield 動線が start 直後で破綻していた。

### F-2 (resolved): scaffold 動線が 2-step (ori init silent + /ori-arch) で
完結

前回 (`ori-3ik-greenfield-2026-06-03.md`) で「`ori init` next-steps が `/ori-arch`
を案内するが skill 実体無し」と指摘された P1 ブロッカーが解消。今回の retry
では:

```
bash .apm/skills/ori-init/scripts/create-skeleton.sh      # ori init wrapper
bash .apm/skills/ori-arch/scripts/copy-template.sh ...    # template scaffold
pnpm install && pnpm test                                  # OK
```

の動線が回ることを確認。

### F-3 (deferred): skill 実行を skill 機構に乗せる検証は次セッション

本 session は ori-9gy / ori-ap7 で `/ori-arch` を**新規作成**した session であり、
skill registry にはまだ load されていない（Claude Code は session start 時に
`.apm/skills/` を scan して load する仕様のため）。したがって私 (assistant) が
`/ori-arch` を slash command として直接 invoke することはできない。

次セッションで `apm install dev-komenzar/ori --target claude` を回した後、
新規 claude.code session で `/ori-arch` / `/ori-flow` が問題なく invoke できることを
検証する必要がある。

### F-4 (no action): `.ori/architecture.md` を ori init は作らないが /ori-arch
の template が持って来る

`ori init` は `.ori/config.yaml` までで `.ori/architecture.md` は作らない
（次ステップ `/ori-arch` で template から copy される、というのが現行設計）。
この役割分担は新 docs/start で説明済み (ori-3ju の修正)。

## 次セッション持ち越し

- `apm install dev-komenzar/ori --target claude` 経由で skill load を検証
- 新 session で `/ori-arch` を invoke し、対話 flow (pattern / framework 選択) が
  期待通り進むこと
- minimal な DDD docs を `.ori/domain/` に投入 (1 BC, 2-3 workflow, 1 aggregate)
- `ori slice new <slice-id>` (tests/ 空 dir が作られないことの再確認 = ori-8tx)
- `/ori-flow <slice-id>` 7-phase end-to-end
  - 各 phase の `bd close ori-<phase>-<id>` が走ること
  - code が `apps/<app>/src/<bc>/slices/<id>/` に出ること
  - tests が `apps/<app>/src/<bc>/slices/<id>/tests/` に出ること
  - GREEN-on-first 検出が `/ori-test-red` で発火しないこと
- 完走できれば `bd close ori-3ik`、新たな痛みは個別 bd 起票

## 結論

PR #13 で解消した 6 件の friction (ori-9gy / ori-ap7 / ori-3ju / ori-05r /
ori-8tx / ori-ulh) と、本 retry で見つかった F-1 (`pnpm dlx` syntax) を合わせて、
**scaffold までの greenfield 動線は通った**。

`/ori-flow` end-to-end の検証は skill load を要するため次セッションに持ち越し。
ori-3ik は in_progress のまま、PR #13 merge 後の次セッションで close を狙う。
