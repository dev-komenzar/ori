import { describe, expect, it } from "vitest";
import { extractSections } from "./sections.js";
import { hashSection, normalizeForHash } from "./hash.js";

describe("extractSections", () => {
  it("extracts H2 sections with {#id} anchors", () => {
    const md = `# Title

## First Aggregate {#first-aggregate}
Body of first.

### Sub heading {#first-sub}
Sub body.

## Second Aggregate {#second-aggregate}
Body of second.
`;
    const result = extractSections(md);
    expect(result.byId.get("first-aggregate")?.heading).toBe("First Aggregate");
    expect(result.byId.get("second-aggregate")?.heading).toBe("Second Aggregate");
    expect(result.byId.get("first-sub")?.depth).toBe(3);
  });

  it("auto-assigns ids when {#id} is missing", () => {
    const md = `## No ID Section
Body.

## Another {#has-id}
Body.
`;
    const result = extractSections(md);
    const keys = Array.from(result.byId.keys());
    expect(keys).toContain("has-id");
    // missing-id gets _h2_<n> fallback
    expect(keys.some((k) => k.startsWith("_h2_"))).toBe(true);
  });

  it("nested H3 belongs to its own section, not parent body", () => {
    const md = `## Parent {#parent}
Parent body line.

### Child {#child}
Child body line.
`;
    const result = extractSections(md);
    const parent = result.byId.get("parent");
    const child = result.byId.get("child");
    expect(parent?.body).toContain("Parent body line.");
    expect(child?.body).toContain("Child body line.");
    expect(child?.body).not.toContain("Parent body line.");
  });
});

describe("normalizeForHash", () => {
  it("strips ori:auto blocks", () => {
    const src = `Line 1
<!-- ori:auto-table:start -->
This will change.
<!-- ori:auto-table:end -->
Line 2`;
    const result = normalizeForHash(src);
    expect(result).not.toContain("This will change.");
    expect(result).toContain("Line 1");
    expect(result).toContain("Line 2");
  });

  it("collapses excess whitespace deterministically", () => {
    const a = "Line A   \n\n\n\nLine B";
    const b = "Line A\n\nLine B";
    expect(normalizeForHash(a)).toBe(normalizeForHash(b));
  });
});

describe("hashSection", () => {
  it("produces stable 16-char hash", () => {
    const h = hashSection("hello world");
    expect(h).toMatch(/^[0-9a-f]{16}$/);
  });

  it("same input → same hash", () => {
    expect(hashSection("foo")).toBe(hashSection("foo"));
  });

  it("normalization-equivalent inputs hash equal", () => {
    expect(hashSection("hello\nworld")).toBe(hashSection("hello   \nworld"));
  });
});
