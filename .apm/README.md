# `.apm/` — ori APM Package Assets

ori ships as an [APM](https://github.com/microsoft/apm) package. The manifest (`apm.yml`) lives at the repo root; this directory holds the primitives APM distributes.

```bash
apm install dev-komenzar/ori
```

APM resolves the contents below into each AI harness's native format (`.claude/`, `.cursor/`, `.codex/`, `.opencode/`, `.windsurf/`, `.github/`) automatically.

## Contents

| Path | Type | Purpose |
|------|------|---------|
| `instructions/` | Instructions | file-glob-scoped rule files applied automatically when AI touches matching paths |
| `skills/` | Skills | user-invocable workflows (`/ori-init`, `/ori-flow`, `/ori-sync`, `/ori-derive`, …) — each carries its own `scripts/` (esbuild bundle) と必要に応じ `templates/` `patterns/` `adapters/` を bundle 隣接で同梱 |
| `agents/` | Agents | `ori-reviewer` — fresh-context adversarial reviewer。`architect-expert` — 要件対話から `.ori/architecture.md` を動的生成 (DDD+vsa-hex の invariants は不変、stack 差分は decision_points) |

> Phase K (2026-06-10) で旧 cross-skill 共有 SSoT は consuming skill 配下に co-locate され、`.apm/contexts/` は廃止。runtime artifact は常に consuming skill bundle と同 tree に常駐する。

## Architecture

Skills are self-contained and invoked directly by the AI agent (e.g., `/ori-flow`, `/ori-derive`, `/ori-review`). No external CLI binary is required. Each skill describes its own workflow using file system reads, Bash commands (for testing/git), and beads (for issue tracking).
