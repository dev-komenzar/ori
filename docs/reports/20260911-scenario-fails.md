# scenario id 列挙時の validation.md 見落とし — レポート

> ori-bc9 (scenario 実行モデル一般化) を consumer リポジトリに適用した際に発生した AI agent の
> ミスと、ori ハーネス側への改善提案を記録する。
>
> - 日時: 2026-09-11
> - consumer リポジトリ: `promptnotes` (Tauri v2 / SvelteKit / Rust)
> - ori version: `89cacd99` (main HEAD, unreleased; `apm update dev-komenzar/ori`)
> - agent: Sisyphus (DeepSeek v4 Pro / OpenCode)

## 1. 事象

`/ori-arch` による architecture.md 更新後、scenario id の候補を agent に問い合わせた。
agent は `smoke`, `note-crud`, `tag-filter`, `settings`, `copy-body`, `date-filter` の
6 つを**創作**し提案した。

実際には `.ori/domain/validation.md` に Scenario S1〜S10（`## Scenario S1: ... {#s1-note-created-happy}`）
が定義済みであり、scenario id は validation.md の section id（`s1-note-created-happy` 等）を
参照すべきだった。

## 2. ルートコーズ分析

### 2.1 scenario derive の入力仕様を確認しなかった

`/ori-derive` SKILL.md の「scenario の場合」節:

> - 入力：`.ori/scenarios/<id>/manifest.yaml`（必須。`derives_from:` を持つ）
> - `manifest.derives_from` に列挙されたドメイン section
> - **`.ori/domain/validation.md`（必須。Gherkin 形式の検証シナリオ）**

今回の ori update（5547c6e → 89cacd9）で `ori-derive/SKILL.md` は +133/- 行の更新を受けていたが、
`apm update` 後の検証が「ファイルの有無確認（`ls -la`）」にとどまり、**内容の差分確認**を怠った。
derive SKILL.md の scenario 節を読んでいれば、validation.md が必須入力であることを認識できた。

### 2.2 新規 deploy ファイルの内容確認不足

`apm update` 後の検証では `ls -la` 等で「ori-generate や scenario.md が来ている」ことを確認したが、
中身の精査は行わなかった。`scenario.md` rule や `ori-derive` SKILL.md の内容を読めば
validation.md との関係が把握できた。

### 2.3 project の validation.md 自体を確認しなかった

`.ori/domain/validation.md` は update 前から存在していた project ファイル。
「scenario id」を尋ねられた時点で、「id の根拠が project 内の何かにあるはず」と疑い
validation.md を確認すべきだったが、「scenario = 新概念 = project 内にまだ存在しない」と
誤って前提し、確認を省略した。

### 2.4 「scenario」概念への過度な一般化

ori-bc9 の scenario 概念（run-mode / runner matrix / compose 生成）の新規性に引っ張られ、
「既存 project の validation.md が scenario の seed になる」という単純な事実を見逃した。

## 3. ori ハーネス側への改善提案

### R1: scenario id 命名規約の明文化

`scenario.md` rule は現在 `scenario とは何か`を定義しているが、
「id の命名規約」「validation.md との関係」が書かれていない。

`scenario.md` または `new-scenario.js` に以下を追加する:

```yaml
# scenario id naming convention
id_convention:
  source: .ori/domain/validation.md  # Gherkin section id が scenario id の primary source
  format: <validation-section-id>     # 例: s1-note-created-happy
  fallback: 新規ワークフロー追加時は validation.md に section を追加した上で命名
```

理由: AI agent は `validation.md` を primary source として読まない限り、プロジェクト機能一覧から
創作しやすい（今回の failure mode）。

### R2: `new-scenario` スクリプトに validation section 一覧表示機能を追加

AI agent が validation.md の既存 section を見落とさないための機械的ガード。
`node .claude/skills/ori-flow/scripts/new-scenario.js --list-validation` 等で
validation.md の全 scenario section id を列挙し、そこから選ばせる。

理由: `apm update` 後の検証で SKILL.md の内容差分まで精査するのは現実的に限界がある。
スクリプトが機械的に validation との関係を可視化することで、AI agent の見落としを防ぐ。

## 4. 環境情報

- consumer: `promptnotes` (Tauri v2, SvelteKit, Rust backend)
- ori pin: `5547c6e0` → `89cacd99` (apm update via `main` branch)
- ori update による deploy: `.claude/skills/ori-derive/SKILL.md` 更新（+133/- 行、scenario derive 手順追加）、新規 `.claude/rules/scenario.md` / `scenario-test.md`、新規 `.claude/skills/ori-generate/`
- `.ori/domain/validation.md` は update 前から存在（S1〜S10 定義済み）
- agent: Sisyphus (OpenCode / DeepSeek v4 Pro)