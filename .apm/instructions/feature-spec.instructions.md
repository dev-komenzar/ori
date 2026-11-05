---
description: feature spec は derive phase 出力。直接編集せず派生元を編集して再生成する
applyTo: ".ori/features/*/spec.md"
---

- **このファイルは派生文書**: `manifest.yaml` の `derives_from` が source
- **直接編集を原則禁止**:
  1. spec を変えたい場合は **派生元（domain doc）を編集** → `/ori-sync` で spec.md を再生成
  2. **ここでの直接編集は不可**（`/ori-sync --force` は廃止済）。上流の変更が要る場合は `/ori-propose` で提案を作成する
- **構成（必須）**: `## 概要 {#overview}`, `## 入出力 {#io}`, `## 不変条件 {#invariants}`,
  `## 境界契約 {#boundary-contract}`, `## テスト観点 {#test-points}`, `## 実装ノート {#impl-notes}`
- **glossary 参照**: 用語は `[Note](#note)` 形式で glossary 内アンカーへ
- **コードスニペットは最小限**: 詳細実装は notes.md または src/ 配下に

## frontmatter coherence ブロック {#coherence-frontmatter}

slice / page / scenario の spec.md (`.ori/{slices,pages,scenarios}/<id>/spec.md`) に共通の frontmatter 形式。
この section が形式の **SSoT**。skill / script / 他の instructions は形式を再掲せずここを参照する。

```yaml
---
ori:
  schema:
    propagation_level: file
coherence:
  source: derived
  last_derived: 2026-10-02
  upstream:          # writer 専有: manifest.derives_from の ref を出現順に列挙
    - domain/aggregates.md#note-aggregate
    - domain/aggregates.md#tag-aggregate
  hash:              # writer 専有: file パス (anchor なし) → sha256(raw file) 先頭 12 hex
    domain/aggregates.md: 56f7a54a8ab2
---
```

| key | 値 | 書き手 |
|---|---|---|
| `ori.schema.propagation_level` | `file` (正式仕様。hash は file 全体に対して取る) | stub (`new-slice` / `new-page` / `new-scenario`) |
| `coherence.source` | `derived` 固定。この値が「派生文書」の目印 | stub / writer |
| `coherence.last_derived` | 最後に derive した日付 (`YYYY-MM-DD`) | writer |
| `coherence.upstream` | `manifest.derives_from` の各 entry を `file` または `file#section` の文字列にしたもの。出現順、同一 ref は 1 つ | writer |
| `coherence.hash` | `upstream` に現れる file ごとの hash map | writer |

規約:

- **hash 計算方式**: upstream file の **raw bytes** の sha256 hex 先頭 12 桁 (`sha256sum <file> | cut -c1-12` と同値)。
  `file#section` 指定でも section 単位ではなく file 全体を hash する (`propagation_level: file`)
- **キー = file パス (anchor なし)**: `.ori/` からの相対パス (`domain/aggregates.md`)。`#section` や `#.*` をキーに含めない
- **file 単位 dedupe**: 同一 file を複数 section で参照しても hash のキーは 1 つ。`upstream` には section ごとの ref を残す
- **path 正規化**: `derives_from` の `.ori/` prefix 有無 (legacy string form / structured `{path, section}` form) は
  writer が同じキーに正規化する
- **writer 専有**: `upstream` / `hash` / `last_derived` は決定的 writer (`@ori-ori/coherence` の spec-hash 実装を使う CLI) だけが書く。
  **LLM (derive phase 含む) は upstream / hash を手書きしない**。placeholder (`abc123` 等) も書かない
  (writer 導入 (ori-0eh.4) までの暫定: `/ori-derive` は `resolve-upstream.sh <id> --coherence` の出力をそのまま貼る)
- **stub の初期値**: `source: derived` / `upstream: []` / `hash: {}`。値は derive 時に writer が `derives_from` から生成する
- **旧形式** (`hash` の `file#.*` / `file#anchor` キー、scenario の `upstream: [{path, hash}]`、stub の
  `coherence.derives_from`) は読み取りのみ互換。書き戻す writer が新形式へ移行する (記録値は保持)

## 境界契約 (Boundary contract) section 必須化 {#boundary-contract-section}

`## 境界契約 {#boundary-contract}` section は **必須**。
Slice DoD ([`ori-architect/patterns/ddd-vsa-hex/pattern.md`](../skills/ori-architect/patterns/ddd-vsa-hex/pattern.md) の "Slice Definition of Done")
の rule 2「tests は外部境界経由のみ」を spec レベルで明示するための section。

宣言すべき項目:

- **boundary kind**: `tauri_command` / `http_handler` / `direct_public_entry` のいずれか
  (`manifest.yaml` の `expected_deliverables.boundary.kind` と一致させる)
- **contact point (binding)**: tests が import する **唯一の経路** を絶対 path で列挙。
  例:
  - `apps/<app>/src/<bc>/shared/ipc/bindings.ts` (tauri-specta 生成、TS 側 contact)
  - `apps/<app>/src-tauri/src/<bc_rs>/slices/<slice_rs>/commands.rs` (Rust 側 source、
    `#[tauri::command]` の置き場)
- **public_entry**: slice の `mod.rs` / `index.ts` 位置 (DoD rule 2 の代替経路、
  `cross_root` 不在の slice ではこちらが contact point になる)
- **禁止される import 経路**: 「内部 application 直叩き禁止」等、DoD 違反となる import を明示

### 記述例

```markdown
## 境界契約 {#boundary-contract}

- boundary kind: `tauri_command`
- TS 側 contact point: `apps/notes/src/note_taking/shared/ipc/bindings.ts`
  - tests は `import { commands } from "note-taking/shared/ipc/bindings"` のみ可
- Rust 側 source: `apps/notes/src-tauri/src/note_taking/slices/create_note/commands.rs`
  - `#[tauri::command]` + `#[specta::specta]` で公開、`invoke_handler!` に配線
- public_entry: `apps/notes/src/note_taking/slices/create-note/index.ts` (TS) /
  `apps/notes/src-tauri/src/note_taking/slices/create_note/mod.rs` (Rust)
- 禁止: tests が `application/handle_create_note` を直 import するのは DoD 違反
```

`/ori-doctor` はこの section の宣言と実体 boundary file の存在/参照を突合する。
section が欠落している spec は `/ori-derive` 段階で reject される。

## page / widget の testid {#page-testids}

page / widget の spec.md は testid の具体値を**持たない**。testid は
`.ori/pages/<id>/testids.yaml` (契約。規範は `ddd-vsa-hex/pattern.md` "page / widget の testid 契約") が
唯一の source で、spec.md からはリンクで参照する。

- 禁止: 「ui-fields の field id (`screen-<N>-*`) をそのまま data-testid に写す」等、
  契約と別の testid 規則を spec に書くこと (実装がそれに従い E2E と乖離する)
- テスト観点で testid に触れる場合は契約の値 (`page.<id>.<elem>`) を引用する

## page / widget の ui-field 挙動規定 {#page-field-behavior}

page / widget が持つ ui-field (manifest `derives_from` → screen の `## Fields` の `{#screen-N-xxx}`) は、
**1 つ残らず** `## 不変条件 {#invariants}` か `## テスト観点 {#test-points}` で挙動を規定する。
規定には field id を「field `screen-N-xxx`」の形で引用する (field の参照。testid として書くのは上の禁止に当たる)。

- レイアウト図・入出力・実装ノートだけの言及は規定に数えない。レイアウト図にだけある要素は、
  実装にも test にも現れないまま見落とされる (promptnotes の「デフォルトに戻す」= screen-2-storage-dir-reset)
- 表示専用の field も「何がいつ表示されるか」を test-point で規定する。除外の仕組みは設けない
- 上流 (ui-fields / workflow) から挙動を書けない field は推測で埋めず **TBD** を残して人間に問う。
  **TBD** を含む行の引用は規定に数えない
- 検査: `node scripts/testids.js spec-gaps <page-id>` (`/ori-derive` 自己検証、`/ori-doctor` §15 は `--all`)
