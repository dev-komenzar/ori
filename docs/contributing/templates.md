# init テンプレートを募集しています

現状の `/ori-arch` は MVP として `ddd-vsa-hex-typescript` / `ddd-vsa-hex-typescript-tauri`（slice ベース + DDD + Vertical Slice + Hexagonal）を中心にサポートしています。将来的には**コミュニティから template を集めたい**と考えています：

- **言語別**: Python / Go / Rust / Kotlin / Scala / Swift...
- **フレームワーク別**: Next.js / Nuxt / Remix / Django / FastAPI / Spring / Axum / Tauri...
- **アーキテクチャ別**: slice + DDD / Clean Architecture / Hexagonal / Onion / VSA...

## ori と整合させるための受け入れ条件

各テンプレートは以下 3 点を満たせば ori と整合します：

1. **slice ごとのディレクトリ骨格** — slice 単位のコード配置（`domain / application / infrastructure / presentation / tests` 相当）が明確
2. **単一 public API**（`index.ts` 相当）— slice 間の直接 import を禁ずるための entry point が 1 つに集約されている
3. **`.ori/architecture.md` を生成する arch-adapter 設定** — pattern / framework / roots / 制約を SSoT として宣言できる

## 現在の adapter 状況

| Adapter | 状態 | bundle 場所 |
|---|---|---|
| ESLint | 利用可能 | `.apm/skills/ori-arch/adapters/eslint/` |
| 汎用 regex | 利用可能 | `.apm/skills/ori-arch/adapters/generic/` |
| Rust | 利用可能 | `.apm/skills/ori-arch/adapters/rust/` |
| Python (import-linter) | 計画中 | — |
| JVM (ArchUnit) | 計画中 | — |
| Go (depguard) | 計画中 | — |

## 参加方法

興味がある方は [issues](https://github.com/dev-komenzar/ori/issues) または discussions で声をかけてください。
