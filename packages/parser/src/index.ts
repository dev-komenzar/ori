export { parseFrontmatter } from "./frontmatter.js";
export { extractSections, type Section, type SectionMap } from "./sections.js";
export { hashSection, normalizeForHash } from "./hash.js";
export { OriFrontmatterSchema, type OriFrontmatter } from "./schema.js";
export {
  parseArchitectureSpec,
  type ArchitectureSpec,
  type RootConfig,
  type LayerSet,
  type ForbiddenImportRule,
  type FeatureInternal,
  type CrossFeature,
  type CrossRoot,
  type OriArchAdapter,
  type AdapterExportResult,
  type AdapterCheckResult,
} from "./architecture.js";
