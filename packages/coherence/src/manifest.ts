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

const KEBAB = /^[a-z][a-z0-9-]*$/;

export const SliceManifestSchema = z
  .object({
    slice_id: z.string().regex(KEBAB, "slice_id must be kebab-case"),
    type: z.enum(["command", "query"]),
    derives_from: z.array(z.string()).default([]),
    relations: z.array(RelationSchema).default([]),
    implementation: ImplementationSchema.optional(),
  })
  .strict();

export const PageManifestSchema = z
  .object({
    page_id: z.string().regex(KEBAB, "page_id must be kebab-case"),
    type: z.literal("page"),
    derives_from: z.array(z.string()).default([]),
    relations: z.array(RelationSchema).default([]),
    implementation: ImplementationSchema.optional(),
  })
  .strict();

export const ManifestSchema = z.discriminatedUnion("type", [
  SliceManifestSchema,
  PageManifestSchema,
]);

export type SliceManifest = z.infer<typeof SliceManifestSchema>;
export type PageManifest = z.infer<typeof PageManifestSchema>;
export type Manifest = z.infer<typeof ManifestSchema>;

export function parseManifest(yaml: string): Manifest {
  const data = parseYaml(yaml);
  return ManifestSchema.parse(data);
}
