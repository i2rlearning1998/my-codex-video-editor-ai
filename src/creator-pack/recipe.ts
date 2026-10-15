import { recipeSchema } from './schemas';
import { controlValues, type ParamSpec } from './controls';
export interface ResolvedStep {
  fx: string;
  params: Record<string, unknown>;
}
export function resolveRecipe(
  input: unknown,
  fxCatalog: readonly string[],
  controls: readonly ParamSpec[] = [],
  overrides: Record<string, unknown> = {},
): ResolvedStep[] {
  const recipe = recipeSchema.parse(input),
    values = controlValues(controls, overrides),
    catalog = new Set(fxCatalog);
  const steps =
    recipe.steps ??
    (typeof recipe.from === 'string'
      ? [{ fx: recipe.from, params: {} }]
      : recipe.from!.steps);
  function replace(v: unknown): unknown {
    if (Array.isArray(v)) return v.map(replace);
    if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      if ('$param' in o) {
        if (
          Object.keys(o).length !== 1 ||
          typeof o.$param !== 'string' ||
          !Object.hasOwn(values, o.$param)
        )
          throw Error(
            `Unknown or malformed recipe control ${String(o.$param)}.`,
          );
        return values[o.$param];
      }
      return Object.fromEntries(
        Object.entries(o).map(([k, x]) => [k, replace(x)]),
      );
    }
    return v;
  }
  return steps.map((step) => {
    if (!catalog.has(step.fx))
      throw Error(`Unknown fx id ${step.fx}; supply it in fxCatalog.`);
    return {
      fx: step.fx,
      params: replace(step.params) as Record<string, unknown>,
    };
  });
}
