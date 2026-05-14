import { describe, expect, it } from "vitest";
import { archCommand } from "./arch.js";

function metaName(cmd: unknown): string | undefined {
  return (cmd as { meta?: { name?: string } })?.meta?.name;
}

describe("arch command", () => {
  it("exposes export, check, and sync-ui subcommands", () => {
    expect(metaName(archCommand)).toBe("arch");
    const subs = archCommand.subCommands as Record<string, unknown>;
    expect(metaName(subs.export)).toBe("export");
    expect(metaName(subs.check)).toBe("check");
    expect(metaName(subs["sync-ui"])).toBe("sync-ui");
  });
});
