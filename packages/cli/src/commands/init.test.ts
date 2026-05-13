import { describe, expect, it } from "vitest";
import { initCommand } from "./init.js";

describe("init command", () => {
  it("declares the init metadata", () => {
    expect(initCommand.meta?.name).toBe("init");
    expect(typeof initCommand.run).toBe("function");
  });
});
