import { createHash } from "node:crypto";

const AUTO_BLOCK_RE = /<!--\s*ori:auto-[a-z-]+:start\s*-->[\s\S]*?<!--\s*ori:auto-[a-z-]+:end\s*-->/g;

export function normalizeForHash(content: string): string {
  return content
    .replace(AUTO_BLOCK_RE, "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function hashSection(content: string): string {
  const normalized = normalizeForHash(content);
  return createHash("sha256").update(normalized).digest("hex").slice(0, 16);
}
