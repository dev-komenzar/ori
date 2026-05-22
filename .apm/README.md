# `.apm/` — ori APM Package

This directory makes the ori repository installable as an [APM](https://github.com/microsoft/apm) package:

```bash
apm install dev-komenzar/ori
```

APM resolves the contents below into each AI harness's native format (`.claude/`, `.cursor/`, `.codex/`, `.opencode/`, `.windsurf/`, `.github/`) automatically.

## Contents

| Path | Type | Purpose |
|------|------|---------|
| `apm.yml` | manifest | package metadata, dependencies, requirements |
| `instructions/` | Instructions | 7 file-glob-scoped rule files applied automatically when AI touches matching paths |
| `skills/` | Skills | user-invocable workflows: `ori-init`, `ori-flow`, `ori-sync`, `ori-distill`, `ori-propose`, `ori-review-proposals` |
| `agents/` | Agents | `ori-reviewer` — fresh-context adversarial reviewer for phase 6 |
| `hooks/` | Hooks | `post-write-domain` — auto-trigger `/ori-sync` after domain/feature edits |

## Architecture

Skills are self-contained and invoked directly by the AI agent (e.g., `/ori-flow`, `/ori-derive`, `/ori-review`). No external CLI binary is required. Each skill describes its own workflow using file system reads, Bash commands (for testing/git), and beads (for issue tracking).
