import { z } from "zod";
import { parseFrontmatter } from "./frontmatter.js";

const LayerKindSchema = z.enum(["shared", "slice", "ui-layer"]);

const LayerSchema = z
  .object({
    id: z.string(),
    kind: LayerKindSchema,
    order: z.number().int().optional(),
    slice_internal: z.string().optional(),
  })
  .passthrough();

const CrossLayerRuleSchema = z
  .object({
    from: z.string(),
    allow: z.array(z.string()),
  })
  .passthrough();

const ForbiddenImportRuleSchema = z
  .object({
    from: z.string(),
    modules: z.array(z.string()).min(1),
    reason: z.string().optional(),
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
        forbidden_imports: z.array(ForbiddenImportRuleSchema).default([]),
      })
      .passthrough(),
  })
  .passthrough();

const SliceInternalRuleSchema = z
  .object({
    from: z.string(),
    allow: z.array(z.string()),
  })
  .passthrough();

const SliceInternalSchema = z
  .object({
    sub_layers: z.array(z.string()).min(1),
    rules: z.array(SliceInternalRuleSchema).default([]),
  })
  .passthrough();

const RootSchema = z
  .object({
    id: z.string().optional(),
    app: z.string().optional(),
    path: z.string(),
    language: z.string(),
    layer_set: z.string(),
    adapter: z.string(),
    slice_root: z.string(),
    slice_subdir: z.string().optional(),
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

const CrossSliceSchema = z
  .object({
    prohibited_direct: z.boolean().default(true),
    via: z.array(z.string()).default([]),
  })
  .passthrough();

const ScenarioTestRunnerSchema = z
  .object({
    runner: z.string(),
    config_path: z.string().optional(),
    command: z.string().optional(),
  })
  .passthrough();

/**
 * App runtime block (design.md §9 / §12) — 起動知識の SSoT。
 * compose-service = B′ descriptor (image + command、Dockerfile なし)、
 * local = build-then-test (ビルド済み binary を runner が起動)。
 */
const RunTargetSchema = z.enum(["host", "ios-simulator", "android-emulator"]);

const ComposeServiceRuntimeSchema = z
  .object({
    mode: z.literal("compose-service"),
    image: z.string().describe("docker image (B′ descriptor、Dockerfile なし)"),
    install: z.string().optional().describe("install command (e.g. pnpm install)"),
    build: z.string().optional().describe("build command"),
    run: z.string().describe("service 起動 command"),
    ports: z
      .array(z.number().int().positive())
      .default([])
      .describe("host ports (静的宣言。同一 scenario 内衝突は generate エラー)"),
    healthcheck: z
      .object({ http: z.string().describe("HTTP 待機 path (例: /health)。default は TCP probe") })
      .passthrough()
      .optional(),
    cache_volumes: z.array(z.string()).default([]),
  })
  .passthrough();

const LocalRuntimeSchema = z
  .object({
    mode: z.literal("local"),
    build: z
      .string()
      .optional()
      .describe(
        "binary build command。この command の出力が runtime.binary と一致すること (G2: dev binary は不可)",
      ),
    binary: z.string().describe("ビルド済み binary path (build-then-test)"),
    target: RunTargetSchema.describe("実行基盤"),
    runner: z.string().describe("UI 駆動 runner (例: wdio)。derive の runner chain 優先チェーン 2 で使用"),
    test_env: z
      .record(z.string())
      .optional()
      .describe(
        "scenario 実行時に runner config が inject する test-only env。ori 標準の storage 隔離 env (例 TAURI_TEST_STORAGE_DIR) は generate が常時注入する",
      ),
  })
  .passthrough();

export const AppRuntimeSchema = z.discriminatedUnion("mode", [
  ComposeServiceRuntimeSchema,
  LocalRuntimeSchema,
]);

export const AppSchema = z
  .object({
    name: z.string(),
    path: z.string(),
    runtime: AppRuntimeSchema.optional(),
  })
  .passthrough();

export const WorkspaceSchema = z
  .object({
    apps_root: z.string().default("apps"),
    apps: z.array(AppSchema).min(1),
  })
  .passthrough();

const FrontmatterSchema = z
  .object({
    version: z.literal(1),
    default_root: z.string().optional(),
    workspace: WorkspaceSchema.optional(),
    root: RootSchema.optional(),
    roots: z.array(RootSchema).optional(),
    cross_root: z.array(CrossRootSchema).optional(),
    layer_sets: z.record(LayerSetSchema),
    slice_internal: z.record(SliceInternalSchema).optional(),
    cross_slice: CrossSliceSchema,
    page_map_marker: z.string().optional(),
    scenario_test_runner: ScenarioTestRunnerSchema.optional(),
  })
  .passthrough()
  .refine((v) => v.root != null || (v.roots != null && v.roots.length > 0), {
    message: "either `root` (single-root shorthand) or non-empty `roots[]` must be present",
  });

export type RootConfig = z.infer<typeof RootSchema> & { id: string };
export type LayerSet = z.infer<typeof LayerSetSchema>;
export type ForbiddenImportRule = z.infer<typeof ForbiddenImportRuleSchema>;
export type SliceInternal = z.infer<typeof SliceInternalSchema>;
export type CrossSlice = z.infer<typeof CrossSliceSchema>;
export type CrossRoot = z.infer<typeof CrossRootSchema>;
export type ScenarioTestRunner = z.infer<typeof ScenarioTestRunnerSchema>;
export type AppRuntime = z.infer<typeof AppRuntimeSchema>;
export type Workspace = z.infer<typeof WorkspaceSchema>;

export interface ArchitectureSpec {
  version: 1;
  default_root: string;
  workspace?: Workspace;
  roots: RootConfig[];
  cross_root: CrossRoot[];
  layer_sets: Record<string, LayerSet>;
  slice_internal: Record<string, SliceInternal>;
  cross_slice: CrossSlice;
  page_map_marker?: string;
  scenario_test_runner?: ScenarioTestRunner;
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
    workspace: fm.workspace,
    roots,
    cross_root: fm.cross_root ?? [],
    layer_sets: fm.layer_sets,
    slice_internal: fm.slice_internal ?? {},
    cross_slice: fm.cross_slice,
    page_map_marker: fm.page_map_marker,
    scenario_test_runner: fm.scenario_test_runner,
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

export interface AdapterOpts {
  /** Templates dir override (default: <adapter-bundle>/templates/). Used by tests to inject fixtures. */
  templatesDir?: string;
}

export interface OriArchAdapter {
  name: string;
  language: string | string[];
  export(spec: ArchitectureSpec, root: RootConfig, opts?: AdapterOpts): Promise<AdapterExportResult>;
  check?(spec: ArchitectureSpec, root: RootConfig, opts?: AdapterOpts): Promise<AdapterCheckResult>;
}
