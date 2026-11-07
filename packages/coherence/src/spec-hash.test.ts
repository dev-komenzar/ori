import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  computeExpectedCoherence,
  computeFileHash,
  findSpecTarget,
  normalizeHashKey,
  parseDerivesFrom,
  readSpecCoherence,
  writeSpecCoherence,
} from "./spec-hash.js";

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "spec-hash-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function put(rel: string, content: string | Buffer): string {
  const abs = join(root, rel);
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, content);
  return abs;
}

describe("normalizeHashKey", () => {
  it.each([
    ["domain/aggregates.md#.*", "domain/aggregates.md"],
    ["domain/aggregates.md#note-aggregate", "domain/aggregates.md"],
    ["domain/aggregates.md", "domain/aggregates.md"],
    [".ori/domain/aggregates.md#x", "domain/aggregates.md"],
  ])("%s → %s", (key, expected) => {
    expect(normalizeHashKey(key)).toBe(expected);
  });
});

describe("parseDerivesFrom", () => {
  it("legacy string form (with / without section)", () => {
    const refs = parseDerivesFrom(`slice_id: a
type: command
derives_from:
  - domain/aggregates.md#note-aggregate
  - "domain/workflows/capture.md"
`);
    expect(refs).toEqual([
      { ref: "domain/aggregates.md#note-aggregate", file: "domain/aggregates.md", section: "note-aggregate" },
      { ref: "domain/workflows/capture.md", file: "domain/workflows/capture.md" },
    ]);
  });

  it("structured {path, section} form and .ori/ prefix normalization", () => {
    const refs = parseDerivesFrom(`derives_from:
  - path: .ori/domain/bounded-contexts.md
    section: task-management
  - path: .ori/domain/aggregates.md
`);
    expect(refs.map((r) => r.ref)).toEqual(["domain/bounded-contexts.md#task-management", "domain/aggregates.md"]);
    expect(refs.map((r) => r.file)).toEqual(["domain/bounded-contexts.md", "domain/aggregates.md"]);
  });

  it("resolves node-id form (ui-field:<name> / page-grouping:<id>) to domain/ui-fields/ files (ori-0eh.9)", () => {
    const refs = parseDerivesFrom(`derives_from:
  - ui-field:screen-1
  - ui-field:screen-2#screen-2-title
  - page-grouping:capture-form
  - page-grouping:overview
  - path: ui-field:screen-3
    section: screen-3-body
  - domain/ui-fields/screen-1.md
`);
    expect(refs).toEqual([
      { ref: "domain/ui-fields/screen-1.md", file: "domain/ui-fields/screen-1.md" },
      { ref: "domain/ui-fields/screen-2.md#screen-2-title", file: "domain/ui-fields/screen-2.md", section: "screen-2-title" },
      { ref: "domain/ui-fields/page-groups.md#capture-form", file: "domain/ui-fields/page-groups.md", section: "capture-form" },
      { ref: "domain/ui-fields/page-groups.md", file: "domain/ui-fields/page-groups.md" },
      { ref: "domain/ui-fields/screen-3.md#screen-3-body", file: "domain/ui-fields/screen-3.md", section: "screen-3-body" },
    ]);
  });

  it("leaves unsupported node-ids and file paths untouched", () => {
    expect(parseDerivesFrom({ derives_from: ["aggregate:User", "domain/ui-field:x.md"] }).map((r) => r.ref))
      .toEqual(["aggregate:User", "domain/ui-field:x.md"]);
  });

  it("accepts parsed objects, dedupes identical refs, tolerates missing/empty", () => {
    expect(parseDerivesFrom({ derives_from: ["domain/a.md#x", ".ori/domain/a.md#x", "domain/a.md#y"] }).map((r) => r.ref))
      .toEqual(["domain/a.md#x", "domain/a.md#y"]);
    expect(parseDerivesFrom("slice_id: a\n")).toEqual([]);
    expect(parseDerivesFrom("derives_from: []\n")).toEqual([]);
  });
});

describe("computeFileHash", () => {
  it("matches `sha256sum | cut -c1-12` (raw bytes, incl. CRLF / non-ASCII / no trailing newline)", () => {
    const abs = put("domain/a.md", Buffer.from("# 見出し {#h}\r\nbody without newline", "utf8"));
    const shell = execFileSync("sh", ["-c", `sha256sum "$1" | cut -c1-12`, "sh", abs], { encoding: "utf8" }).trim();
    expect(computeFileHash(abs)).toBe(shell);
    expect(shell).toMatch(/^[0-9a-f]{12}$/);
  });
});

describe("computeExpectedCoherence", () => {
  it("dedupes hash by file, keeps every ref in upstream, reports missing files", () => {
    const a = put(".ori/domain/aggregates.md", "agg\n");
    const refs = parseDerivesFrom(`derives_from:
  - domain/aggregates.md#note-aggregate
  - domain/aggregates.md#tag-aggregate
  - domain/missing.md
`);
    const exp = computeExpectedCoherence(root, refs);
    expect(exp.upstream).toEqual([
      "domain/aggregates.md#note-aggregate",
      "domain/aggregates.md#tag-aggregate",
      "domain/missing.md",
    ]);
    expect(exp.hash).toEqual({ "domain/aggregates.md": computeFileHash(a) });
    expect(exp.missing).toEqual(["domain/missing.md"]);
  });
});

describe("findSpecTarget", () => {
  it.each(["slices", "pages", "scenarios"] as const)("resolves .ori/%s/<id>/", (kind) => {
    put(`.ori/${kind}/x/manifest.yaml`, "derives_from: []\n");
    const t = findSpecTarget(root, "x");
    expect(t?.kind).toBe(kind);
    expect(t?.specPath).toBe(join(root, ".ori", kind, "x", "spec.md"));
  });

  it("returns undefined when no manifest exists", () => {
    expect(findSpecTarget(root, "nope")).toBeUndefined();
  });
});

describe("readSpecCoherence", () => {
  it("new format: upstream list + file-keyed hash", () => {
    const c = readSpecCoherence(`---
coherence:
  source: derived
  last_derived: 2026-10-02
  upstream:
    - domain/aggregates.md#note-aggregate
  hash:
    domain/aggregates.md: 56f7a54a8ab2
---
body
`);
    expect(c).toEqual({
      source: "derived",
      last_derived: "2026-10-02",
      upstream: ["domain/aggregates.md#note-aggregate"],
      hash: { "domain/aggregates.md": "56f7a54a8ab2" },
      conflicts: [],
      legacy: false,
    });
  });

  it("hash only (no upstream)", () => {
    const c = readSpecCoherence(`---
coherence:
  source: derived
  hash:
    domain/a.md: 111111111111
---
`);
    expect(c.upstream).toEqual([]);
    expect(c.hash).toEqual({ "domain/a.md": "111111111111" });
    expect(c.legacy).toBe(false);
  });

  it("unquoted digit-only hash values keep their written form (leading zeros, exponent-like)", () => {
    const c = readSpecCoherence(`---
coherence:
  hash:
    domain/a.md: 012345678901
    domain/b.md: 12345e678901
    domain/c.md: "000000000001"
---
`);
    expect(c.hash).toEqual({
      "domain/a.md": "012345678901",
      "domain/b.md": "12345e678901",
      "domain/c.md": "000000000001",
    });
  });

  it("`#.*` keys are normalized to file keys", () => {
    const c = readSpecCoherence(`---
coherence:
  source: derived
  upstream:
    - domain/a.md#x
  hash:
    domain/a.md#.*: aaaaaaaaaaaa
---
`);
    expect(c.hash).toEqual({ "domain/a.md": "aaaaaaaaaaaa" });
    expect(c.legacy).toBe(true);
  });

  it("`#anchor` keys are normalized to file keys", () => {
    const c = readSpecCoherence(`---
coherence:
  hash:
    domain/a.md#note-aggregate: aaaaaaaaaaaa
    domain/b.md#x: bbbbbbbbbbbb
---
`);
    expect(c.hash).toEqual({ "domain/a.md": "aaaaaaaaaaaa", "domain/b.md": "bbbbbbbbbbbb" });
    expect(c.legacy).toBe(true);
  });

  it("duplicate keys for the same file with matching values: no conflict", () => {
    // 旧 finalize の hash 更新 script が生成していた YAML 上の重複キー (promptnotes ori-ehz)
    const c = readSpecCoherence(`---
coherence:
  hash:
    domain/a.md#.*: aaaaaaaaaaaa
    domain/a.md#.*: aaaaaaaaaaaa
    domain/a.md#y: aaaaaaaaaaaa
---
`);
    expect(c.hash).toEqual({ "domain/a.md": "aaaaaaaaaaaa" });
    expect(c.conflicts).toEqual([]);
    expect(c.legacy).toBe(true);
  });

  it("duplicate keys for the same file with differing values: reported as conflict", () => {
    const c = readSpecCoherence(`---
coherence:
  hash:
    domain/a.md#x: aaaaaaaaaaaa
    domain/a.md#y: 999999999999
---
`);
    expect(c.hash).toEqual({ "domain/a.md": "aaaaaaaaaaaa" });
    expect(c.conflicts).toEqual([
      {
        file: "domain/a.md",
        entries: [
          { key: "domain/a.md#x", value: "aaaaaaaaaaaa" },
          { key: "domain/a.md#y", value: "999999999999" },
        ],
      },
    ]);
  });

  it("scenario legacy `upstream: [{path, hash}]` form", () => {
    const c = readSpecCoherence(`---
coherence:
  source: derived
  upstream:
    - path: domain/workflows.md#order-workflow
      hash: a1b2c3d4e5f6
    - path: domain/validation.md
      hash: 0f9e8d7c6b5a
---
`);
    expect(c.upstream).toEqual(["domain/workflows.md#order-workflow", "domain/validation.md"]);
    expect(c.hash).toEqual({ "domain/workflows.md": "a1b2c3d4e5f6", "domain/validation.md": "0f9e8d7c6b5a" });
    expect(c.legacy).toBe(true);
  });

  it("page spec stub (`derives_from: []`) is read as empty legacy", () => {
    const c = readSpecCoherence(`---
ori:
  schema:
    propagation_level: file
coherence:
  derives_from: []
---

# p — Page Specification
`);
    expect(c.upstream).toEqual([]);
    expect(c.hash).toEqual({});
    expect(c.legacy).toBe(true);
  });

  it("no frontmatter / no coherence → empty", () => {
    expect(readSpecCoherence("# title\n")).toEqual({ upstream: [], hash: {}, conflicts: [], legacy: false });
    expect(readSpecCoherence("---\nori: {}\n---\n")).toEqual({ upstream: [], hash: {}, conflicts: [], legacy: false });
  });
});

describe("writeSpecCoherence", () => {
  const update = {
    source: "derived",
    last_derived: "2026-10-02",
    upstream: ["domain/a.md#x", "domain/a.md#y"],
    hash: { "domain/a.md": "aaaaaaaaaaaa" },
  };

  it("keeps other frontmatter keys and the body byte-for-byte", () => {
    const before = `---
ori:
  schema:
    propagation_level: file   # keep this comment
title: "Quoted 'title'"
coherence:
  source: derived
  upstream:
    - domain/a.md#x
  hash:
    domain/a.md#.*: 000000000000
    domain/a.md#.*: 000000000000
# trailing comment belongs to next key
tags: [a, b]
---

# Spec

---

body with --- and coherence: words
`;
    const after = writeSpecCoherence(before, update);
    expect(after).toBe(`---
ori:
  schema:
    propagation_level: file   # keep this comment
title: "Quoted 'title'"
coherence:
  source: derived
  last_derived: 2026-10-02
  upstream:
    - domain/a.md#x
    - domain/a.md#y
  hash:
    domain/a.md: aaaaaaaaaaaa
# trailing comment belongs to next key
tags: [a, b]
---

# Spec

---

body with --- and coherence: words
`);
    expect(readSpecCoherence(after)).toMatchObject({ ...update, conflicts: [], legacy: false });
  });

  it("migrates stub `derives_from: []` and preserves unknown coherence sub-keys", () => {
    const before = `---
coherence:
  derives_from: []
  depends_on:
    - x
---
body
`;
    const after = writeSpecCoherence(before, { source: "derived", upstream: [], hash: {} });
    expect(after).toBe(`---
coherence:
  source: derived
  upstream: []
  hash: {}
  depends_on:
    - x
---
body
`);
  });

  it("appends coherence when missing, creates frontmatter when absent", () => {
    expect(writeSpecCoherence("---\nori: {}\n---\nbody\n", { upstream: [], hash: {} })).toBe(
      "---\nori: {}\ncoherence:\n  upstream: []\n  hash: {}\n---\nbody\n",
    );
    expect(writeSpecCoherence("# t\n", { upstream: [], hash: {} })).toBe(
      "---\ncoherence:\n  upstream: []\n  hash: {}\n---\n# t\n",
    );
  });

  it("is idempotent", () => {
    const once = writeSpecCoherence("---\ncoherence:\n  source: derived\n---\nb\n", update);
    expect(writeSpecCoherence(once, update)).toBe(once);
  });

  it("preserves CRLF line endings", () => {
    const before = "---\r\nori: {}\r\ncoherence:\r\n  derives_from: []\r\n---\r\nbody\r\n";
    expect(writeSpecCoherence(before, { upstream: [], hash: {} })).toBe(
      "---\r\nori: {}\r\ncoherence:\r\n  upstream: []\r\n  hash: {}\r\n---\r\nbody\r\n",
    );
  });
});
