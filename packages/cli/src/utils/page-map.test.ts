import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  applyPageMapSection,
  collectPageMap,
  DEFAULT_PAGE_MAP_MARKER,
  parseScreen,
  renderPageMapBody,
  syncPageMap,
  SyncPageMapError,
} from "./page-map.js";

const ARCH_BASE = `---
version: 1
root:
  path: src
  language: typescript
  layer_set: ddd-vsa-hex-ts
  adapter: eslint
  slice_root: app
  public_entry: index.ts
layer_sets:
  ddd-vsa-hex-ts:
    layers:
      - { id: shared,    kind: shared }
      - { id: domain,    kind: slice, slice_internal: slice-internal-ts }
      - { id: ui-widget, kind: ui-layer, order: 1 }
      - { id: ui-page,   kind: ui-layer, order: 2 }
    rules:
      cross_layer:
        - { from: ui-page,   allow: [ui-widget, shared, domain] }
        - { from: ui-widget, allow: [shared, domain] }
        - { from: domain,    allow: [shared] }
        - { from: shared,    allow: [] }
      same_layer: prohibited
      public_entry_required: true
slice_internal:
  slice-internal-ts:
    sub_layers: [presentation, application, domain, infrastructure]
    rules:
      - { from: presentation,   allow: [application, domain] }
      - { from: application,    allow: [domain, infrastructure] }
      - { from: domain,         allow: [] }
      - { from: infrastructure, allow: [domain] }
cross_slice:
  prohibited_direct: true
  via: [shared/contracts, shared/events]
---

# Architecture

User-written prose stays here.
`;

const SCREEN_1 = `---
coherence:
  source: human
  last_validated: 2026-05-14
  upstream:
    - workflows/capture-auto-save.md
  depended_by:
    - ui-widget: prompt-workspace
  depends_on:
    - slice: prompt-list-slice
    - slice: prompt-editor-slice
---

# Screen 1: Workspace {#screen-1}
`;

const SCREEN_2 = `---
coherence:
  depended_by:
    - ui-page: home
  depends_on:
    - ui-widget: prompt-workspace
    - screen: screen-3
---

# Screen 2: Home {#screen-2}
`;

const SCREEN_3 = `---
coherence:
  depended_by:
    - ui-page: registration
  depends_on:
    - slice: register-user
    - slice: check-username
---

# Screen 3: Register {#screen-3}
`;

const SCREEN_NO_BINDING = `---
coherence:
  source: human
---

# Screen 4: Unbound {#screen-4}
`;

describe("parseScreen", () => {
  it("extracts a ui-widget binding plus its slice depends_on", () => {
    const s = parseScreen("screen-1.md", SCREEN_1);
    expect(s).not.toBeNull();
    expect(s?.screenId).toBe("screen-1");
    expect(s?.groups).toEqual([{ kind: "ui-widget", id: "prompt-workspace" }]);
    expect(s?.dependsOn).toEqual([
      { kind: "slice", id: "prompt-list-slice" },
      { kind: "slice", id: "prompt-editor-slice" },
    ]);
  });

  it("treats ui-widget references in depends_on as page-level deps but drops screen:* navigation", () => {
    const s = parseScreen("screen-2.md", SCREEN_2);
    expect(s?.groups).toEqual([{ kind: "ui-page", id: "home" }]);
    // screen:screen-3 is screen-to-screen navigation — excluded from page-level depends_on.
    expect(s?.dependsOn).toEqual([{ kind: "ui-widget", id: "prompt-workspace" }]);
  });

  it("returns empty bindings when frontmatter has no depended_by", () => {
    const s = parseScreen("screen-4.md", SCREEN_NO_BINDING);
    expect(s?.groups).toEqual([]);
    expect(s?.dependsOn).toEqual([]);
  });

  it("rejects files that don't match the screen-*.md convention", () => {
    expect(parseScreen("index.md", SCREEN_1)).toBeNull();
  });
});

describe("collectPageMap", () => {
  it("groups screens under their kind+id, unions depends_on, ui-widget sorted before ui-page", () => {
    const screens = [
      parseScreen("screen-1.md", SCREEN_1)!,
      parseScreen("screen-2.md", SCREEN_2)!,
      parseScreen("screen-3.md", SCREEN_3)!,
    ];
    const entries = collectPageMap(screens);
    expect(entries.map((e) => `${e.kind}:${e.id}`)).toEqual([
      "ui-widget:prompt-workspace",
      "ui-page:home",
      "ui-page:registration",
    ]);
    const workspace = entries[0]!;
    expect(workspace.dependsOn).toEqual(["prompt-editor-slice", "prompt-list-slice"]);
    expect(workspace.screens).toEqual(["screen-1"]);
    const registration = entries[2]!;
    expect(registration.dependsOn).toEqual(["check-username", "register-user"]);
  });
});

describe("renderPageMapBody / applyPageMapSection", () => {
  it("emits an empty-state hint when no entries were derived", () => {
    const body = renderPageMapBody([]);
    expect(body).toContain("No `ui-widget` / `ui-page` bindings");
    expect(body).toContain("/ori-ddd-11b-ui-grouping");
  });

  it("renders one bullet per group with depends_on inline", () => {
    const entries = collectPageMap([
      parseScreen("screen-1.md", SCREEN_1)!,
      parseScreen("screen-2.md", SCREEN_2)!,
      parseScreen("screen-3.md", SCREEN_3)!,
    ]);
    const body = renderPageMapBody(entries);
    expect(body).toContain("- ui-widget:");
    expect(body).toContain(
      "  - prompt-workspace (depends_on: [prompt-editor-slice, prompt-list-slice])",
    );
    expect(body).toContain("- ui-page:");
    expect(body).toContain("  - home (depends_on: [prompt-workspace])");
    expect(body).toContain(
      "  - registration (depends_on: [check-username, register-user])",
    );
    // ui-page header appears once even though it groups two entries.
    expect(body.match(/^- ui-page:$/gm)?.length).toBe(1);
  });

  it("appends a Page Map block to a spec that has none", () => {
    const next = applyPageMapSection(ARCH_BASE, "## hello\n");
    expect(next).toContain("## Page Map");
    expect(next).toContain(
      `<!-- BEGIN ori-distill ${DEFAULT_PAGE_MAP_MARKER} auto-generated; do not edit between markers -->`,
    );
    expect(next).toContain(`<!-- END ori-distill ${DEFAULT_PAGE_MAP_MARKER} auto-generated -->`);
    expect(next).toContain("User-written prose stays here.");
  });

  it("replaces an existing marker block in place without duplicating the header", () => {
    const seeded = applyPageMapSection(ARCH_BASE, "## first\n");
    const next = applyPageMapSection(seeded, "## second\n");
    expect(next).toContain("## second");
    expect(next).not.toContain("## first");
    expect(next.match(/^## Page Map$/gm)?.length).toBe(1);
    expect(
      next.match(new RegExp(`BEGIN ori-distill ${DEFAULT_PAGE_MAP_MARKER}`, "g"))?.length,
    ).toBe(1);
  });

  it("inserts markers under an existing Page Map header rather than creating a second one", () => {
    const preExisting = `${ARCH_BASE}\n## Page Map\n`;
    const next = applyPageMapSection(preExisting, "## body\n");
    expect(next.match(/^## Page Map$/gm)?.length).toBe(1);
    expect(next).toContain("BEGIN ori-distill");
  });

  it("honours a custom marker identifier", () => {
    const next = applyPageMapSection(ARCH_BASE, "## hi\n", "experiment");
    expect(next).toContain("<!-- BEGIN ori-distill experiment auto-generated");
    expect(next).toContain("<!-- END ori-distill experiment auto-generated -->");
  });
});

describe("syncPageMap (filesystem)", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), "ori-sync-page-map-"));
    await mkdir(join(tmp, ".ori/domain/ui-fields"), { recursive: true });
    await writeFile(join(tmp, ".ori/architecture.md"), ARCH_BASE, "utf8");
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("writes a Page Map section derived from screen files", async () => {
    await writeFile(join(tmp, ".ori/domain/ui-fields/screen-1.md"), SCREEN_1, "utf8");
    await writeFile(join(tmp, ".ori/domain/ui-fields/screen-2.md"), SCREEN_2, "utf8");
    await writeFile(join(tmp, ".ori/domain/ui-fields/screen-3.md"), SCREEN_3, "utf8");

    const result = await syncPageMap({ cwd: tmp });
    expect(result.changed).toBe(true);
    expect(result.screensRead).toBe(3);
    expect(result.entries.map((e) => `${e.kind}:${e.id}`)).toEqual([
      "ui-widget:prompt-workspace",
      "ui-page:home",
      "ui-page:registration",
    ]);

    const written = await readFile(join(tmp, ".ori/architecture.md"), "utf8");
    expect(written).toContain("## Page Map");
    expect(written).toContain("- ui-widget:");
    expect(written).toContain(
      "  - prompt-workspace (depends_on: [prompt-editor-slice, prompt-list-slice])",
    );
    expect(written).toContain("  - home (depends_on: [prompt-workspace])");
    expect(written).toContain("User-written prose stays here.");
  });

  it("is idempotent: a second run on identical inputs reports no change", async () => {
    await writeFile(join(tmp, ".ori/domain/ui-fields/screen-1.md"), SCREEN_1, "utf8");
    await syncPageMap({ cwd: tmp });
    const second = await syncPageMap({ cwd: tmp });
    expect(second.changed).toBe(false);
  });

  it("does not write when dry-run is on, but reports the computed content", async () => {
    await writeFile(join(tmp, ".ori/domain/ui-fields/screen-1.md"), SCREEN_1, "utf8");
    const result = await syncPageMap({ cwd: tmp, dryRun: true });
    expect(result.changed).toBe(true);
    const onDisk = await readFile(join(tmp, ".ori/architecture.md"), "utf8");
    expect(onDisk).not.toContain("prompt-workspace");
    expect(result.nextContent).toContain("prompt-workspace");
  });

  it("preserves manual edits outside the marker block on subsequent syncs", async () => {
    await writeFile(join(tmp, ".ori/domain/ui-fields/screen-1.md"), SCREEN_1, "utf8");
    await syncPageMap({ cwd: tmp });

    const seeded = await readFile(join(tmp, ".ori/architecture.md"), "utf8");
    const edited = `${seeded}\n## My Manual Notes\n\nKeep this on the next sync.\n`;
    await writeFile(join(tmp, ".ori/architecture.md"), edited, "utf8");

    await writeFile(join(tmp, ".ori/domain/ui-fields/screen-3.md"), SCREEN_3, "utf8");
    await syncPageMap({ cwd: tmp });

    const after = await readFile(join(tmp, ".ori/architecture.md"), "utf8");
    expect(after).toContain("Keep this on the next sync.");
    expect(after).toContain("  - registration (depends_on: [check-username, register-user])");
  });

  it("honours `page_map_marker` from spec frontmatter when no CLI override is given", async () => {
    const archWithMarker = ARCH_BASE.replace(
      "cross_slice:\n  prohibited_direct: true\n  via: [shared/contracts, shared/events]\n---",
      "cross_slice:\n  prohibited_direct: true\n  via: [shared/contracts, shared/events]\npage_map_marker: phase-11b-custom\n---",
    );
    await writeFile(join(tmp, ".ori/architecture.md"), archWithMarker, "utf8");
    await writeFile(join(tmp, ".ori/domain/ui-fields/screen-1.md"), SCREEN_1, "utf8");

    const result = await syncPageMap({ cwd: tmp });
    expect(result.changed).toBe(true);
    const written = await readFile(join(tmp, ".ori/architecture.md"), "utf8");
    expect(written).toContain("<!-- BEGIN ori-distill phase-11b-custom auto-generated");
    expect(written).toContain("<!-- END ori-distill phase-11b-custom auto-generated -->");
  });

  it("errors out cleanly when the architecture spec is missing", async () => {
    await rm(join(tmp, ".ori/architecture.md"));
    await expect(syncPageMap({ cwd: tmp })).rejects.toBeInstanceOf(SyncPageMapError);
  });

  it("errors out cleanly when the ui-fields directory is missing", async () => {
    await rm(join(tmp, ".ori/domain/ui-fields"), { recursive: true });
    await expect(syncPageMap({ cwd: tmp })).rejects.toBeInstanceOf(SyncPageMapError);
  });
});
