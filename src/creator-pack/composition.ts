import { validateSpec, resolveSpec } from '../ai-spec';
import { jsonCopy } from './parser';
import { controlsSchema } from './controls';
/** Only this extension is removed from the validation projection, never the authored spec. */
export function checkComposition(
  input: unknown,
  libraryIds: readonly string[],
): string[] {
  const spec = jsonCopy(input) as Record<string, unknown>,
    warnings: string[] = [],
    known = new Set(libraryIds);
  if (Array.isArray(spec.parameters)) {
    const controls = controlsSchema.parse(spec.parameters);
    spec.parameters = controls.map((c) => {
      const { group: _g, help: _h, ...rest } = c;
      return { ...rest, label: c.label.en };
    });
  }
  if (Array.isArray(spec.scenes))
    for (const scene of spec.scenes) {
      if (!scene || typeof scene !== 'object') continue;
      const s = scene as Record<string, unknown>;
      if (!Array.isArray(s.items)) continue;
      s.items = s.items.map((item: unknown, index: number) => {
        if (!item || typeof item !== 'object' || !('library' in item))
          return item;
        const ref = item as Record<string, unknown>;
        if (Object.keys(ref).length !== 1 || typeof ref.library !== 'string')
          throw Error(
            'Library reference must be exactly {"library":"pack/item"}.',
          );
        if (!known.has(ref.library))
          throw Error(`Unknown library reference ${ref.library}.`);
        warnings.push(
          `Library ${ref.library}: reference checked; expansion skipped: not supported yet.`,
        );
        // Validation-only sentinel preserves scene/item count and timing validation.
        return {
          id: `cp-reference-${index}`,
          name: 'Library reference',
          kind: 'shape',
          start: 0,
          duration: s.duration,
          shape: 'rectangle',
          width: 1,
          height: 1,
          fill: '#000000',
        };
      });
    }
  const result = validateSpec(spec);
  if (!result.ok)
    throw Error(result.errors.map((e) => `${e.path}: ${e.message}`).join('\n'));
  const plan = resolveSpec(spec);
  for (const requirement of plan.requirements)
    warnings.push(
      `${requirement.path}: skipped: not supported yet (${requirement.reason}).`,
    );
  return warnings;
}
