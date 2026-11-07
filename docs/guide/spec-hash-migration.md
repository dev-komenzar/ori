# spec hash 形式の移行ガイド

既存の ori 利用プロジェクト (例: promptnotes) を、新しい `coherence.hash` 形式と hash drift 検知 (epic `ori-0eh`) に移行する手順です。

## 何が変わったか

| 項目 | 以前 | 現在 |
|---|---|---|
| `coherence.hash` のキー | `domain/x.md#.*` / `domain/x.md#anchor` (scenario は `[{path, hash}]`) | file パス (anchor なし): `domain/x.md: <sha256 先頭 12 桁>` |
| hash を書くもの | LLM の手書き / `ori-finalize` の `update-hash.sh` | `ori-derive` の決定的 writer `write-spec-hash.js` だけ |
| `/ori-finalize` | spec.md の hash を現在値で無条件に上書き (slice のみ) | **hash を書き換えない**。drift があれば止める検証 gate (slice / page / scenario) |
| `/ori-doctor` | hash の照合が不完全 | 全 spec の hash を upstream の sha256 と照合し、drift を issue として数える |

形式の正本は `feature-spec.instructions.md` の §coherence-frontmatter (consumer では `.claude/` 等にインストールされた instructions) です。

以前の `/ori-finalize` は upstream (domain 文書) が derive 後に変わっていても hash を現在値に上書きしていました。このため spec が古いまま「整合している」と記録されていました。現在の形式で照合すると、こうして隠れていた stale な spec がまとめて検出されます。初回の一斉検出は想定どおりの挙動です。

## 移行手順

ori を更新してから (`apm update` など)、project root で次を順に実行します。

### 1. 形式を移行する (値は保持)

```bash
node <ori-derive skill>/scripts/write-spec-hash.js --all --migrate
```

- `<ori-derive skill>` はインストール先の skill dir です (例: `.claude/skills/ori-derive`)
- `.ori/{slices,pages,scenarios}/*/spec.md` の旧形式キーを file キーに正規化します。**記録されている hash 値はそのまま残し、現在の hash で上書きしません**。上書きすると stale を隠してしまうためです
- 移行できない spec は書かずに飛ばし、残りの spec を処理します。1 件でも失敗があれば最後に exit 1 になります。失敗の主な原因は次の 2 つです。どちらも手順 3 で解消します
  - `recorded hash values disagree for the same file` — 同じ file に対して、旧キーどうしで記録値が食い違っている。どちらの値が正しいか判断できない
  - `no recorded hash for upstream file(s)` — `derives_from` の file に対応する記録値が無い。値を保持する移行では補えない

### 2. 本当に stale な spec を確認する

```bash
/ori-doctor
```

§2「派生文書の hash 一致」に、spec ごとの WARN が出ます。

- `drift: <file> 記録 <old> ≠ 現在 <new>` — derive 後に upstream が変わった
- `hash 欠落` / `hash 余剰` — `manifest.derives_from` と `coherence.hash` のキー集合がずれている
- `coherence.hash が未記録` — derive 済みなのに hash が無い
- `INFO 旧形式の coherence を検出` — 手順 1 で移行されていない (issue には数えない)

### 3. spec ごとに解消する

WARN が出た spec ごとに、次のどちらかを選びます。

- **原則: 再 derive** — `/ori-flow <id>` を実行して spec を upstream に追従させ、test / review をやり直します。derive の最後に writer が hash を現在値で書き直します
- **例外: 人間による承認** — upstream の変更 (誤字修正や、その spec に関係しない節の変更など) が spec に影響しないと**人間が**判断した場合に限り、hash だけを現在値にします

  ```bash
  node <ori-derive skill>/scripts/write-spec-hash.js <slice|page|scenario>/<id> --accept
  ```

  `--accept` は drift を消す操作です。`last_derived` は更新されません。エージェントに drift 検知を通す目的で自発的に実行させないでください

`/ori-doctor` の hash の WARN が 0 になれば移行は完了です。

## 移行後の運用

- `/ori-finalize` は最初に `check-hash-consistency.sh <kind>/<id>` を実行します。drift があると dirty 解除の前に止まり、`/ori-flow <id>` での再 derive を案内します
- spec.md の `coherence` (`upstream:` / `hash:` / `last_derived:`) は手で編集しないでください。書くのは `write-spec-hash.js` だけです
- 旧 `ori-finalize/scripts/update-hash.sh` は削除されました。`apm install` / `apm update` で skill dir ごと置き換わります。独自の手順やスクリプトから `update-hash.sh` を呼んでいる場合は、その呼び出しを削除してください (代わりに必要な書き込みはありません)
