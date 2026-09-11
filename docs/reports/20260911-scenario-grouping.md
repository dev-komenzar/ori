# scenario ID 列挙時に validation.md の 1:1 原則を無視して複数 section をまとめた — レポート

> ori-bc9 (scenario 実行モデル一般化) を consumer リポジトリに適用した際、
> AI agent が validation.md の 1 section = 1 scenario 原則に違反して
> 複数 section を勝手にグルーピングした事例。
>
> - 日時: 2026-09-11
> - consumer リポジトリ: `promptnotes` (Tauri v2 / SvelteKit / Rust)
> - ori version: unreleased (main HEAD、`apm update dev-komenzar/ori`)
> - agent: Sisyphus (DeepSeek v4 Pro / OpenCode)
> - 関連: 同一 session で先行して発生した「validation.md を確認せずに ID を創作した」事例とは別件

## 1. 事象

先行のミス（validation.md を確認せずに ID を創作）を受け、agent は validation.md を
正しく読み込んだ。S1〜S22 の section を認識した上で、次のように提案した：

> | scenario ID | カバーするフロー |
> |---|---
> | `note-lifecycle` | S1, S2, S3, S5 を統合 |
> | `external-file-sync` | S16, S17, S18, S19, S20, S21 を統合 |
> | `startup-state` | S12 のみ |
> | `settings-change` | S11, S22 を統合 |

S12 を除き、複数の validation section を 1 つの scenario にまとめている。

`scenario.md` rule には明示的に：

> **1:1 対応**: 1 scenario = 1 validation section。複数の validation section を 1 scenario で cover したい場合は、先に validation.md 側で section を統合する

と書かれているが、agent はこれを無視して「意味的に自然なグルーピング」を優先した。

## 2. ルートコーズ分析

### 2.1 「validation.md を見たから理解した」という錯覚

先行ミスの原因は「validation.md を読んでいなかった」ことだったため、
今回は validation.md を読み込み、「中身を理解した」ことで満足してしまった。
しかし読むだけでは不十分で、**読んだ情報をどう使うか（1:1 対応）** まで
咀嚼できていなかった。

### 2.2 「自然なグルーピング」というドメイン知識の過剰適用

agent は「validation section が 22 個もある → 全部 scenario にするのは多すぎる →
意味的にグルーピングして少数にしたほうが現実的」というドメイン知識を
持ち込み、ori の規約より優先させた。

### 2.3 人間への提案時に「規約を破っている」自覚がなかった

scenario.md rule の 1:1 原則を読み落としたまま提案してしまった。
読み落としの原因：
- rule ファイルを「scenario とは何か」の理解目的で読んだが、id 命名規約の部分を
  操作手順としてではなく背景知識として読み流した
- 提案時点で「これは規約に反するのでは」という自己チェックが働かなかった

## 3. 考えられる改善方向（ハーネス側）

- 現状 `scenario.md` rule の `#id-convention` に 1:1 原則が書かれているが、
  `scenario_id` の定義（L75）では `derives_from` との関係で言及されているのみ。
  `scenario_id` のフィールド説明自体にも「1 シナリオ = 1 validation section」
  を直接書く
- `new-scenario.js` が validation section との 1:1 対応を機械的に enforce しているが、
  AI agent が id を手動で提案する段階ではまだスクリプトを通っていない。
  `new-scenario.js --list-validation` の出力に「各 section が 1 つの scenario に
  対応します」等の注釈を含める

## 4. 環境情報

- consumer: `promptnotes` (Tauri v2, SvelteKit, Rust backend)
- `.ori/domain/validation.md` に S1〜S22 定義済み
- agent: Sisyphus (OpenCode / DeepSeek v4 Pro)