import { z } from "zod";
import { parseFrontmatter } from "./frontmatter.js";

const LayerKindSchema = z.enum(["shared", "feature", "ui-layer"]);

const LayerSchema = z
  .object({
    id: z.string(),
    kind: LayerKindSchema,
    order: z.number().int().optional(),
    feature_internal: z.string().optional(),
  })
  .passthrough();

const CrossLayerRuleSchema = z
  .object({
    from: z.string(),
    allow: z.array(z.string()),
  })
  .passthrough();

const LayerSetSchema = z
  .object({
    layers: z.array(LayerSchema).min(1),
    rules: z
      .object({
        cross_layer: z.array(CrossLayerRuleSchema).default([]),
        same_layer: z.enum(["prohibited", "allowed"]).default("prohibited"),
        public_entry_required: z.boolean().default(true),
      })
      .passthrough(),
  })
  .passthrough();

const FeatureInternalRuleSchema = z
  .object({
    from: z.string(),
    allow: z.array(z.string()),
  })
  .passthrough();

const FeatureInternalSchema = z
  .object({
    sub_layers: z.array(z.string()).min(1),
    rules: z.array(FeatureInternalRuleSchema).default([]),
  })
  .passthrough();

const RootSchema = z
  .object({
    id: z.string().optional(),
    path: z.string(),
    language: z.string(),
    layer_set: z.string(),
    adapter: z.string(),
    feature_root: z.string(),
    public_entry: z.string(),
  })
  .passthrough();

const CrossRootSchema = z
  .object({
    from: z.object({ root: z.string(), path: z.string() }).passthrough(),
    to: z.object({ root: z.string(), path: z.string() }).passthrough(),
    generator: z.string(),
    auto_generated: z.boolean().default(false),
  })
  .passthrough();

const CrossFeatureSchema = z
  .object({
    prohibited_direct: z.boolean().default(true),
    via: z.array(z.string()).default([]),
  })
  .passthrough();

const FrontmatterSchema = z
  .object({
    version: z.literal(1),
    default_root: z.string().optional(),
    root: RootSchema.optional(),
    roots: z.array(RootSchema).optional(),
    cross_root: z.array(CrossRootSchema).optional(),
    layer_sets: z.record(LayerSetSchema),
    feature_internal: z.record(FeatureInternalSchema).optional(),
    cross_feature: CrossFeatureSchema,
    ui_layer_map_marker: z.string().optional(),
  })
  .passthrough()
  .refine((v) => v.root != null || (v.roots != null && v.roots.length > 0), {
    message: "either `root` (single-root shorthand) or non-empty `roots[]` must be present",
  });

export type RootConfig = z.infer<typeof RootSchema> & { id: string };
export type LayerSet = z.infer<typeof LayerSetSchema>;
export type FeatureInternal = z.infer<typeof FeatureInternalSchema>;
export type CrossFeature = z.infer<typeof CrossFeatureSchema>;
export type CrossRoot = z.infer<typeof CrossRootSchema>;

export interface ArchitectureSpec {
  version: 1;
  default_root: string;
  roots: RootConfig[];
  cross_root: CrossRoot[];
  layer_sets: Record<string, LayerSet>;
  feature_internal: Record<string, FeatureInternal>;
  cross_feature: CrossFeature;
  ui_layer_map_marker?: string;
  body: string;
}

export function parseArchitectureSpec(raw: string): ArchitectureSpec {
  const { data, content } = parseFrontmatter(raw);
  const fm = FrontmatterSchema.parse(data);

  const roots: RootConfig[] = fm.roots
    ? fm.roots.map((r, idx) => ({ ...r, id: r.id ?? `root-${idx}` }))
    : [{ ...fm.root!, id: fm.root!.id ?? "default" }];

  const defaultRoot = fm.default_root ?? roots[0]!.id;
  if (!roots.some((r) => r.id === defaultRoot)) {
    throw new Error(
      `default_root "${defaultRoot}" does not match any root id (${roots.map((r) => r.id).join(", ")})`,
    );
  }

  return {
    version: 1,
    default_root: defaultRoot,
    roots,
    cross_root: fm.cross_root ?? [],
    layer_sets: fm.layer_sets,
    feature_internal: fm.feature_internal ?? {},
    cross_feature: fm.cross_feature,
    ui_layer_map_marker: fm.ui_layer_map_marker,
    body: content,
  };
}

export interface AdapterExportResult {
  files: { path: string; content: string }[];
  notes?: string[];
}

export interface AdapterCheckResult {
  violations: {
    file: string;
    line?: number;
    rule: string;
    message: string;
  }[];
}

export interface OriArchAdapter {
  name: string;
  language: string | string[];
  export(spec: ArchitectureSpec, root: RootConfig): Promise<AdapterExportResult>;
  check?(spec: ArchitectureSpec, root: RootConfig): Promise<AdapterCheckResult>;
}
