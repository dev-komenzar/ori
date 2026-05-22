# @ori-ori/cli

The `ori` command-line tool. Distributed via npm:

```bash
npm i -g @ori-ori/cli
```

## Commands (MVP)

| Command | Status | Description |
|---------|--------|-------------|
| `ori init` | ✅ | Silent scaffold of `.ori/` skeleton (framework scaffold lives in `/ori-arch`) |
| `ori lint [path]` | ✅ partial | Validate `{#id}` anchors + naming convention |
| `ori sync [--file F] [--since REF] [--check] [--force]` | 🚧 stub | Detect changes + propagate dirty marks |
| `ori slice new <id> [--type=command\|query]` | ✅ partial | Create slice scaffold under `.ori/slices/` |
| `ori slice run <id> [--phase P]` | 🚧 stub | Run 7-phase slice workflow |
| `ori slice list` | 🚧 stub | List slices and statuses |
| `ori page new <id>` | ✅ partial | Create page scaffold under `.ori/pages/` |
| `ori page run <id> [--phase P]` | 🚧 stub | Run 7-phase page workflow |
| `ori page list` | 🚧 stub | List pages and statuses |
| `ori model show` | ✅ | Print per-phase model assignments |
| `ori proposals [--check]` | 🚧 stub | Review reverse-propagation proposals |

✅ working · 🚧 stub printing TODO

## Implementation notes

Built with [citty](https://github.com/unjs/citty) (small, ESM-friendly).
Wraps the workspace packages:

- `@ori-ori/parser` — markdown / frontmatter / section extraction
- `@ori-ori/coherence` — propagation graph, change detection, manifest schema
- `@ori-ori/slice-runner` — phase definitions, model resolution, beads bridge

Framework / template scaffold (package.json, src-tauri, etc.) is handled by
`/ori-arch`'s framework_init step, not by this CLI.

All heavy / deterministic operations live in those packages; this CLI is the
thin entrypoint that AI agents invoke via Bash and APM hooks.
