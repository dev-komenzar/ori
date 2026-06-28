# Contributing to ori

## init テンプレートを募集しています

ori が一番欲しいのは、新しいスタックの **slice ベース DDD template** です。現状 `/ori-arch` の MVP は `ddd-vsa-hex-typescript` / `ddd-vsa-hex-typescript-tauri` のみで、これ以外のスタックは未対応です。

- **言語別**: Python / Go / Rust / Kotlin / Scala / Swift...
- **フレームワーク別**: Next.js / Nuxt / Remix / Django / FastAPI / Spring / Axum / Tauri...
- **アーキテクチャ別**: slice + DDD / Clean Architecture / Hexagonal / Onion / VSA...

受け入れ条件・現在の adapter 状況・参加方法は [templates.md](templates.md) を参照してください。興味があれば [issues](https://github.com/dev-komenzar/ori/issues) か discussions で先に声をかけてもらえると、相互調整しやすいです。

## 報告 / 議論

- バグ報告・機能提案: [GitHub issues](https://github.com/dev-komenzar/ori/issues)
- 設計議論: GitHub discussions、あるいは issue で `discussion` ラベル
- セキュリティ問題: 公開 issue ではなく直接連絡（連絡先は別途整備予定）

issue tracker は内部で [beads](https://github.com/steveyegge/beads)（prefix `ori-`）で管理しています。GitHub issues に書いてもらえれば、必要に応じて beads に取り込んで対応します。

## PR のルール

- **言語**: PR title / description は日本語で書いてください（コード内の専門用語は英語のまま OK）
- **コミット**: 小さな単位で意図が分かるメッセージを推奨
- **テスト**: 影響する slice / package のテストはローカルで通してから PR を出してください
- **CI**: PR を出すと `dod-smoke` workflow が回ります（→ [ci-smoke.md](ci-smoke.md)）

## リポジトリ構造

```
ori/
├── packages/
│   ├── parser/           # markdown/frontmatter/section parsing
│   ├── coherence/        # propagation 計算 + ハッシュ管理
│   ├── slice-runner/     # 7-phase workflow runner + beads bridge
│   ├── init-core/        # /ori-init 共通ロジック
│   ├── arch-adapters/    # ori-arch から bundle される adapter 群
│   └── skills/           # skill ごとの esbuild bundle entry
├── .apm/                 # APM 配布アセット
│   ├── apm.yml
│   ├── instructions/     # 7 ファイル（規約の自動適用）
│   ├── skills/           # /ori-init, /ori-flow, /ori-sync 等
│   ├── agents/           # ori-reviewer（fresh-context Opus）
│   └── hooks/            # post-write-domain → 自動 sync
└── docs/                 # 設計文書
```

主要な編集対象：

| やりたいこと | 編集する場所 |
|---|---|
| 新しい template / adapter を追加 | `packages/templates/`, `packages/arch-adapters/`, `.apm/skills/ori-arch/adapters/` |
| skill のロジックを直す | `.apm/skills/<skill-name>/` (SKILL.md + scripts) |
| 設計を変える | `docs/design.md` → 関連 skill / packages へ反映 |
| propagation / SSoT guardrail | `packages/coherence/`, `packages/parser/` |

## さらに詳しいドキュメント

- [templates.md](templates.md) — init テンプレートの受け入れ条件と adapter 状況
- [ci-smoke.md](ci-smoke.md) — Slice DoD chain の非対話 smoke、ローカル再現方法
- [skill-scripts.md](skill-scripts.md) — skill スクリプトのビルド
- [../design.md](../design.md) — 設計議論の SSoT
