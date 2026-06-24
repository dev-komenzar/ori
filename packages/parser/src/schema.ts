import { z } from "zod";

/**
 * Frontmatter `ori:` block per design.md §5 (Frontmatter 規約).
 * Canonical traceability block: file-level node identity + upstream dependencies.
 */
export const OriBlockSchema = z
  .object({
    node_id: z.string().describe("<type>:<name>, globally unique"),
    type: z.string().describe("controlled vocabulary value (e.g. aggregate, workflow, ui-field)"),
    depends_on: z.array(z.string()).default([]).describe("upstream node_id list"),
    modules: z.array(z.string()).optional().describe("related code module paths"),
    schema: z
      .object({
        propagation_level: z.enum(["file", "h2", "h3", "none"]).optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export const OriFrontmatterSchema = z
  .object({
    ori: OriBlockSchema.optional(),
  })
  .passthrough();

export type OriBlock = z.infer<typeof OriBlockSchema>;
export type OriFrontmatter = z.infer<typeof OriFrontmatterSchema>;
