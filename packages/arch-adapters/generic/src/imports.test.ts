import { describe, expect, it } from "vitest";
import { extractImports } from "./imports.js";

describe("extractImports — typescript", () => {
  it("captures import statements with named, default, and side-effect forms", () => {
    const src = `import { foo } from "./foo";
import bar from "../bar";
import "./side-effect";
import * as ns from "./ns";
`;
    const imports = extractImports(src, "typescript");
    const targets = imports.map((i) => i.target).sort();
    expect(targets).toEqual(["../bar", "./foo", "./ns", "./side-effect"]);
  });

  it("captures dynamic import() and require()", () => {
    const src = `const x = await import("./lazy");
const y = require("../config");
`;
    const imports = extractImports(src, "typescript");
    expect(imports.map((i) => i.target).sort()).toEqual(["../config", "./lazy"]);
  });

  it("captures re-exports", () => {
    const src = `export { x } from "./foo";
export * from "./bar";
`;
    const imports = extractImports(src, "typescript");
    expect(imports.map((i) => i.target).sort()).toEqual(["./bar", "./foo"]);
  });

  it("returns 1-indexed line numbers", () => {
    const src = `// line 1
import { x } from "./foo";
// line 3
import { y } from "./bar";
`;
    const imports = extractImports(src, "typescript");
    const byTarget = new Map(imports.map((i) => [i.target, i.line]));
    expect(byTarget.get("./foo")).toBe(2);
    expect(byTarget.get("./bar")).toBe(4);
  });

  it("flags relative vs bare specifiers", () => {
    const src = `import x from "react";
import y from "./local";
`;
    const imports = extractImports(src, "typescript");
    const react = imports.find((i) => i.target === "react");
    const local = imports.find((i) => i.target === "./local");
    expect(react?.relative).toBe(false);
    expect(local?.relative).toBe(true);
  });
});

describe("extractImports — rust", () => {
  it("captures use statements", () => {
    const src = `use crate::shared::events::EventBus;
pub use crate::orders::OrderId;
use super::infrastructure;
`;
    const imports = extractImports(src, "rust");
    expect(imports.map((i) => i.target)).toContain("crate::shared::events::EventBus");
    expect(imports.map((i) => i.target)).toContain("super::infrastructure");
  });
});

describe("extractImports — python", () => {
  it("captures from-imports and bare imports", () => {
    const src = `from .domain import Order
from ..shared.contracts import OrderPlaced
import json
`;
    const imports = extractImports(src, "python");
    const targets = imports.map((i) => i.target);
    expect(targets).toContain(".domain");
    expect(targets).toContain("..shared.contracts");
    expect(targets).toContain("json");
  });
});
