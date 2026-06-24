export { parseFrontmatter } from "./frontmatter.js";
export { extractSections, type Section, type SectionMap } from "./sections.js";
export { hashSection, normalizeForHash } from "./hash.js";
export {
  OriBlockSchema,
  OriFrontmatterSchema,
  type OriBlock,
  type OriFrontmatter,
} from "./schema.js";
export {
  parseArchitectureSpec,
  type ArchitectureSpec,
  type RootConfig,
  type LayerSet,
  type ForbiddenImportRule,
  type SliceInternal,
  type CrossSlice,
  type CrossRoot,
  type OriArchAdapter,
  type AdapterExportResult,
  type AdapterCheckResult,
  type AdapterOpts,
} from "./architecture.js";
export {
  buildMatchers,
  buildRules,
  buildBridges,
  type Matcher,
  type Rule,
  type Bridge,
} from "./architecture-ir.js";
