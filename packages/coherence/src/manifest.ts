import { z } from "zod";
import { parse as parseYaml } from "yaml";

const RelationSchema = z.object({
  target: z.string().describe("path or path#section-id"),
  type: z.enum(["derives_from", "references"]),
});

const ImplementationSchema = z
  .object({
    language: z.string(),
    primary_bc: z.string().optional(),
    generates: z.array(z.string()).default([]),
  })
  .passthrough();

export const ManifestSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9-]*$/, "id must be kebab-case"),
    type: z.enum(["workflow", "ui"]),
    derives_from: z.array(z.string()).default([]),
    relations: z.array(RelationSchema).default([]),
    implementation: ImplementationSchema.optional(),
  })
  .strict();

export type ManifestSchema = z.infer<typeof ManifestSchema>;

export function parseManifest(yaml: string): ManifestSchema {
  const data = parseYaml(yaml);
  return ManifestSchema.parse(data);
}
