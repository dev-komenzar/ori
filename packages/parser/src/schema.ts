import { z } from "zod";

/**
 * Frontmatter schema for ori domain documents.
 * Loosely typed: unknown keys allowed (passthrough), but ori-specific
 * `coherence` block is validated when present.
 */
export const OriCoherenceSchema = z
  .object({
    node_id: z.string().optional(),
    type: z.string().optional(),
    name: z.string().optional(),
    derives_from: z
      .array(
        z.object({
          id: z.string().optional(),
          relation: z.string().optional(),
        }),
      )
      .optional(),
    depended_by: z
      .array(
        z.object({
          id: z.string(),
        }),
      )
      .optional(),
    references: z
      .array(z.object({ id: z.string() }))
      .optional(),
  })
  .passthrough();

export const OriFrontmatterSchema = z
  .object({
    coherence: OriCoherenceSchema.optional(),
    ori: z
      .object({
        schema: z
          .object({
            propagation_level: z.enum(["file", "h2", "h3", "none"]).optional(),
          })
          .passthrough()
          .optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export type OriFrontmatter = z.infer<typeof OriFrontmatterSchema>;
