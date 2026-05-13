# @ori/cli

The `ori` command-line tool. Distributed via npm:

```bash
npm i -g @ori/cli
```

## Commands (MVP)

| Command | Status | Description |
|---------|--------|-------------|
| `ori init [--template <name>]` | ✅ stub | Scaffold `.ori/` structure |
| `ori lint [path]` | ✅ partial | Validate `{#id}` anchors + naming convention |
| `ori sync [--file F] [--since REF] [--check] [--force]` | 🚧 stub | Detect changes + propagate dirty marks |
| `ori feature new <id>` | ✅ partial | Create feature scaffold |
| `ori feature run <id> [--phase P]` | 🚧 stub | Run 7-phase workflow |
| `ori feature list` | 🚧 stub | List features and statuses |
| `ori model show` | ✅ | Print per-phase model assignments |
| `ori proposals [--check]` | 🚧 stub | Review reverse-propagation proposals |

✅ working · 🚧 stub printing TODO

## Implementation notes

Built with [citty](https://github.com/unjs/citty) (small, ESM-friendly).
Wraps the workspace packages:

- `@ori/parser` — markdown / frontmatter / section extraction
- `@ori/coherence` — propagation graph, change detection, manifest schema
- `@ori/feature-runner` — phase definitions, model resolution, beads bridge
- `@ori/templates` — DDD code-generation templates

All heavy / deterministic operations live in those packages; this CLI is the
thin entrypoint that AI agents invoke via Bash and APM hooks.
