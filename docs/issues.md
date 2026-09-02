# ori — 既知の課題 / 将来課題メモ

> 設計判断の経緯で「後回し」とされた将来課題を蓄積するメモ。
> beads (`bd`) が issue tracker であるため、起票すべき実装タスクは beads issue に
> 移すのが基本。本ファイルは「実装着手前の方針メモ」レイヤ。

## applyTo 自動注入の喪失（テスト規約の正典移設に伴う）{#applyto-loss}

- **発生日**: 2026-09（`ddd-test` / `ddd-rust` / `ui-test` の concretion を
  pattern/stacks 正典へ一本化）
- **背景**: instructions（`.apm/instructions/ddd-test.instructions.md` 等）が従来
  抱えていた「vitest + fast-check / cargo test + proptest」等の concretion を、
  pattern/stacks 階層（`pattern.md` "Test conventions"、`stacks/<stack>/test.md`）へ
  正典として移設した。instructions は「普遍層メタルール + 正典ポインタ」に縮小した。
- **失われたもの**: `applyTo` の glob による **「AI が該当言語のファイルを直接編集
  した瞬間に規約を自動注入する」働き**。正典は skill（`/ori-flow` 系）が読むが、
  world「AI がプレーンにファイル編集する」場面（バグ修正の直接編集など）では
  auto-inject が効かなくなる。
- **影響度**: 限定的。ori の実装編集はほぼ `/ori-flow` → `/ori-test-red` /
  `/ori-impl-green` 経由で、skill が正典を読むため。ただし直接編集ケースでは規約が
  効かない。
- **対応方針（将来）**: `/ori-arch` が `architecture.md` の
  `roots[].language` / `layer_set` から test concretion 正典を解決し、glob-scoped
  rule を **動的 emit** する段階を追加する。または instructions を stack 概念と
  連動させて `stacks/<stack>/` を参照できるよう APM 配布機構を拡張する。
- **status**: 未着手（設計タスクとして切る）

## 純 Rust stack の正典置き場（未整備）

- **背景**: 現状 `stacks/` は `typescript` / `typescript-tauri` のみで、
  「独立 Rust crate（Tauri でない Rust 単体）」向け stack が存在しない。
  `ddd-rust.instructions.md` は従来「Tauri backend / 独立 Rust crate」を標榜して
  いたが、正典移設時に「Rust 言語共通」は `stacks/rust/test.md` に置いた。
  stack としての「rust-only」が未 curated。
- **status**: 未着手。多言語対応（Go / Java 等）の stack curate と合わせて検討
