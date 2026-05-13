---
name: ori-review-proposals
description: 溜まった proposal を人間と一緒にレビューし、accept/reject の判断を反映する
---

`.ori/proposals/` 配下の pending proposal を順次レビューします。

## 手順

1. **一覧表示**：`ori proposals` を実行し pending な提案を取得
2. **各 proposal について**：
   - 内容を読み上げ（target、by、reason、diff）
   - ユーザに **accept / reject / merge** を問う
3. **accept**：CLI が対象ドメイン section を更新 → `ori sync` で順伝播 → 該当 feature の dirty 解除
4. **reject**：proposal を `.ori/proposals/rejected/` へ移動 → 派生文書側を `ori revert <file>` で再 derive（提案者が `--force` で書いた変更を破棄）
5. **merge**：複数 proposal を結合する場合、AI が統合案を作成 → ユーザ確認 → ドメイン更新

## 注意

- ユーザの判断なしに勝手に accept しない
- proposal の git history は残す（rejected 含む。失敗した提案も学びになる）
