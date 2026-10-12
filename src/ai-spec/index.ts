export { SPEC_VERSION, LIMITS, resolvedSpecSchema } from './schema';
export type { CompositionSpec, Scalar } from './schema';
export {
  validateSpec,
  formatIssues,
  CATALOG_VERSION,
  compositionSpecSchema,
} from './validate';
export type { Validation, SpecIssue } from './validate';
export { resolveSpec, COMMAND_NAMES } from './resolve';
export type { BuildPlan, Operation, CommandName } from './resolve';
export { canonicalJson } from './json';
