import { describe, expect, it } from "vitest";
import { parseManifest } from "./manifest.js";

describe("ScenarioManifestSchema (ori-bc9.2)", () => {
  it("parses full scenario manifest with pages/contracts/infrastructure/runner", () => {
    const m = parseManifest(`scenario_id: order-flow-e2e
type: scenario
derives_from:
  - domain/workflows.md#order-workflow
pages: [order-page, payment-page]
contracts:
  http:
    - "POST /api/orders"
    - "GET /api/orders/:id"
  events: [OrderCreated]
  slices: [create-order]
infrastructure:
  services: [web, api, postgres]
runner: wdio
`);
    if (m.type !== "scenario") throw new Error("expected scenario manifest");
    expect(m.pages).toEqual(["order-page", "payment-page"]);
    expect(m.contracts.http).toEqual(["POST /api/orders", "GET /api/orders/:id"]);
    expect(m.contracts.events).toEqual(["OrderCreated"]);
    expect(m.contracts.slices).toEqual(["create-order"]);
    expect(m.infrastructure.services).toEqual(["web", "api", "postgres"]);
    expect(m.runner).toBe("wdio");
  });

  it("defaults optional scenario fields when absent", () => {
    const m = parseManifest(`scenario_id: order-flow-e2e
type: scenario
derives_from: []
`);
    if (m.type !== "scenario") throw new Error("expected scenario manifest");
    expect(m.pages).toEqual([]);
    expect(m.contracts).toEqual({ http: [], events: [], slices: [] });
    expect(m.infrastructure).toEqual({ services: [] });
    expect(m.runner).toBeUndefined();
  });

  it("fills sub-defaults for partially declared contracts", () => {
    const m = parseManifest(`scenario_id: order-flow-e2e
type: scenario
derives_from: []
contracts:
  http: ["POST /api/orders"]
`);
    if (m.type !== "scenario") throw new Error("expected scenario manifest");
    expect(m.contracts.events).toEqual([]);
    expect(m.contracts.slices).toEqual([]);
  });

  it("rejects unknown runner values (matrix は playwright/wdio/vitest)", () => {
    expect(() =>
      parseManifest(`scenario_id: order-flow-e2e
type: scenario
derives_from: []
runner: detox
`),
    ).toThrow();
  });

  it("keeps contracts strict (unknown nested key rejected)", () => {
    expect(() =>
      parseManifest(`scenario_id: order-flow-e2e
type: scenario
derives_from: []
contracts:
  grpc: ["x"]
`),
    ).toThrow();
  });

  it("rejects unknown top-level keys (.strict() 維持)", () => {
    expect(() =>
      parseManifest(`scenario_id: order-flow-e2e
type: scenario
derives_from: []
docker_compose: true
`),
    ).toThrow();
  });

  it("slice/page manifests stay unaffected (regression)", () => {
    expect(
      parseManifest(`slice_id: register-user
type: command
derives_from: []
`).type,
    ).toBe("command");
    expect(
      parseManifest(`page_id: registration
type: page
derives_from: []
`).type,
    ).toBe("page");
  });
});
