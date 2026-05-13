# distill-ddd-ori

ori convention を注入した distill-ddd phase 1-11 のフォーク版（予定地）。

## 由来

- 上流: [tango238/distill-ddd](https://github.com/tango238/distill-ddd)
- ori が追加で要求する規約:
  - 全 H2/H3 に `{#kebab-case-id}` アンカー
  - frontmatter に `coherence:` ブロック
  - `workflows.md` をファイル分割（`workflows/{index.md, <id>.md}`）
  - `ui-fields.md` を画面単位で分割（`ui-fields/{index.md, screen-N.md}`）
  - Phase 11b（UI Feature Grouping）を末尾に追加

## TODO

各 phase prompt を `phase-1-discovery.md` ... `phase-11b-ui-grouping.md` として配置。
上流の変更は手動で取り込む（fork 形態）。
