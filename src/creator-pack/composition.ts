import { validateSpec, resolveSpec } from '../ai-spec';
import { jsonCopy } from './parser';
import { controlsSchema } from './controls';

/** A `{library: "pack/item"}` scene item, by scene and item index. */
export interface LibraryReference {
  readonly sceneIndex: number;
  readonly itemIndex: number;
  readonly library: string;
  /** The sentinel item id that stands in for it in the projected spec. */
  readonly itemId: string;
}
/**
 * The spec as Composition Spec v1 validates it: Creator Pack controls become
 * plain parameters, and each library reference becomes a validation-only
 * sentinel shape (same count and timing). Only this extension is removed
 * from the projection, never the authored spec.
 */
export function projectComposition(input: unknown): {
  spec: Record<string, unknown>;
  references: LibraryReference[];
} {
  const spec = jsonCopy(input) as Record<string, unknown>,
    references: LibraryReference[] = [];
  if (Array.isArray(spec.parameters)) {
    const controls = controlsSchema.parse(spec.parameters);
    spec.parameters = controls.map((c) => {
      const { group: _g, help: _h, ...rest } = c;
      return { ...rest, label: c.label.en };
    });
  }
  if (Array.isArray(spec.scenes))
    spec.scenes.forEach((scene: unknown, sceneIndex: number) => {
      if (!scene || typeof scene !== 'object') return;
      const s = scene as Record<string, unknown>;
      if (!Array.isArray(s.items)) return;
      s.items = s.items.map((item: unknown, index: number) => {
        if (!item || typeof item !== 'object' || !('library' in item))
          return item;
        const ref = item as Record<string, unknown>;
        if (Object.keys(ref).length !== 1 || typeof ref.library !== 'string')
          throw Error(
            'Library reference must be exactly {"library":"pack/item"}.',
          );
        const itemId = `cp-reference-${index}`;
        references.push({
          sceneIndex,
          itemIndex: index,
          library: ref.library,
          itemId,
        });
        // Validation-only sentinel preserves scene/item count and timing validation.
        return {
          id: itemId,
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
    });
  return { spec, references };
}

export function checkComposition(
  input: unknown,
  libraryIds: readonly string[],
): string[] {
  const { spec, references } = projectComposition(input),
    warnings: string[] = [],
    known = new Set(libraryIds);
  for (const ref of references) {
    if (!known.has(ref.library))
      throw Error(`Unknown library reference ${ref.library}.`);
    warnings.push(
      `Library ${ref.library}: reference checked; expansion skipped: not supported yet.`,
    );
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
