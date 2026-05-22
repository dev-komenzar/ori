import { describe, expect, it } from "vitest";
import { buildGraph } from "./graph.js";
import { propagate } from "./propagate.js";

describe("propagate", () => {
  it("notifies the SSoT when a derived doc changes", () => {
    const graph = buildGraph([
      {
        from: { path: ".ori/pages/ui-editor/spec.md", sectionId: null },
        to: { path: ".ori/domain/aggregates.md", sectionId: "note-aggregate" },
        type: "derives_from",
      },
    ]);

    const marks = propagate(graph, {
      path: ".ori/pages/ui-editor/spec.md",
      sectionId: null,
    }, "force");

    expect(marks).toHaveLength(1);
    expect(marks[0]?.node.path).toBe(".ori/domain/aggregates.md");
    expect(marks[0]?.reason).toBe("force");
  });

  it("notifies derived docs when SSoT changes", () => {
    const graph = buildGraph([
      {
        from: { path: ".ori/pages/ui-editor/spec.md", sectionId: null },
        to: { path: ".ori/domain/aggregates.md", sectionId: "note-aggregate" },
        type: "derives_from",
      },
      {
        from: { path: ".ori/slices/capture-auto-save/spec.md", sectionId: null },
        to: { path: ".ori/domain/aggregates.md", sectionId: "note-aggregate" },
        type: "derives_from",
      },
    ]);

    const marks = propagate(graph, {
      path: ".ori/domain/aggregates.md",
      sectionId: "note-aggregate",
    });

    expect(marks).toHaveLength(2);
    const paths = marks.map((m) => m.node.path).sort();
    expect(paths).toEqual([
      ".ori/pages/ui-editor/spec.md",
      ".ori/slices/capture-auto-save/spec.md",
    ]);
  });
});
