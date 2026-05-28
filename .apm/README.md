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
| `skills/` | Skills | user-invocable workflows (`/ori-init`, `/ori-flow`, `/ori-sync`, `/ori-derive`, …) — each carries its own `scripts/` for relative-path lookup |
| `agents/` | Agents | `ori-reviewer` — fresh-context adversarial reviewer for review phase |
| `contexts/` | Contexts | shared schema fragments referenced by skills (e.g., `architecture-md-schema.md`) |

## Architecture

Skills are self-contained and invoked directly by the AI agent (e.g., `/ori-flow`, `/ori-derive`, `/ori-review`). No external CLI binary is required. Each skill describes its own workflow using file system reads, Bash commands (for testing/git), and beads (for issue tracking).
