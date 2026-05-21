import { describe, expect, it } from "vitest";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArchitectureSpec } from "@ori-ori/parser";
import adapter from "./index.js";

const SPEC = `---
version: 1
root:
  path: src
  language: typescript
  layer_set: feature-sliced-ts
  adapter: generic
  slice_root: lib
  public_entry: index.ts
layer_sets:
  feature-sliced-ts:
    layers:
      - { id: shared, kind: shared }
      - { id: domain, kind: slice }
    rules:
      cross_layer:
        - { from: domain, allow: [shared] }
        - { from: shared, allow: [] }
      same_layer: prohibited
      public_entry_required: true
cross_slice:
  prohibited_direct: true
  via: [shared/contracts]
---
`;

async function setupTempProject(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "ori-generic-"));
  await mkdir(join(dir, "src/lib/shared/contracts"), { recursive: true });
  await mkdir(join(dir, "src/lib/orders/application"), { recursive: true });
  await mkdir(join(dir, "src/lib/inventory/domain"), { recursive: true });
  return dir;
}

describe("@ori-ori/arch-adapter-generic", () => {
  it("declares the adapter contract", () => {
    expect(adapter.name).toBe("generic");
    expect(adapter.language).toContain("typescript");
    expect(typeof adapter.check).toBe("function");
  });

  it("exports .ori/arch-rules.json with the parsed rules", async () => {
    const spec = parseArchitectureSpec(SPEC);
    const result = await adapter.export(spec, spec.roots[0]!);

    expect(result.files).toHaveLength(1);
    expect(result.files[0]?.path).toBe(".ori/arch-rules.json");
    const json = JSON.parse(result.files[0]!.content);
    expect(json.version).toBe(1);
    expect(json.root.path).toBe("src");
    expect(json.layer_matchers).toBeInstanceOf(Array);
    expect(json.cross_layer_rules).toContainEqual({ from: "domain", allow: ["shared"] });
  });

  it("check() reports no violations on a clean project", async () => {
    const dir = await setupTempProject();
    await writeFile(
      join(dir, "src/lib/orders/application/place-order.ts"),
      `import { EventBus } from "../../shared/contracts";
export function place() { return new EventBus(); }
`,
    );
    await writeFile(
      join(dir, "src/lib/shared/contracts/index.ts"),
      `export class EventBus {}\n`,
    );

    const prev = process.cwd();
    process.chdir(dir);
    try {
      const spec = parseArchitectureSpec(SPEC);
      const result = await adapter.check!(spec, spec.roots[0]!);
      expect(result.violations).toEqual([]);
    } finally {
      process.chdir(prev);
    }
  });

  it("check() flags cross-slice direct imports", async () => {
    const dir = await setupTempProject();
    await writeFile(
      join(dir, "src/lib/orders/application/place-order.ts"),
      `import { Stock } from "../../inventory/domain/stock";
export function place(s: Stock) { return s; }
`,
    );
    await writeFile(
      join(dir, "src/lib/inventory/domain/stock.ts"),
      `export class Stock {}\n`,
    );

    const prev = process.cwd();
    process.chdir(dir);
    try {
      const spec = parseArchitectureSpec(SPEC);
      const result = await adapter.check!(spec, spec.roots[0]!);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0]?.message).toMatch(/cross-slice/);
      expect(result.violations[0]?.file).toMatch(/orders\/application\/place-order\.ts$/);
    } finally {
      process.chdir(prev);
    }
  });

  it("check() flags shared importing from domain (denied direction)", async () => {
    const dir = await setupTempProject();
    await writeFile(
      join(dir, "src/lib/shared/contracts/index.ts"),
      `import { Order } from "../../orders/domain/order";
export class EventBus {}
`,
    );
    await mkdir(join(dir, "src/lib/orders/domain"), { recursive: true });
    await writeFile(join(dir, "src/lib/orders/domain/order.ts"), "export class Order {}\n");

    const prev = process.cwd();
    process.chdir(dir);
    try {
      const spec = parseArchitectureSpec(SPEC);
      const result = await adapter.check!(spec, spec.roots[0]!);
      expect(result.violations.length).toBeGreaterThanOrEqual(1);
      expect(result.violations[0]?.message).toMatch(/not in allow-list/);
    } finally {
      process.chdir(prev);
    }
  });
});
