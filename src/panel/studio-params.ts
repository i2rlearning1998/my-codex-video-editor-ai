// ROUND-B B0.3: a real model may declare its own parameters (`model.params`).
// The Studio form stays the config's field form; the parameters only say
// which fields the model accepts and how a value is named and limited when
// it is sent. Pure (unit-tested).
import type { ParamDecl } from '../contracts/p3';

export type FieldValue = string | number | boolean | string[];
export interface FieldLike {
  readonly id: string;
  readonly type: string;
}

/** The form's main text field: what a parameter with role "prompt" takes. */
export function primaryField(fields: readonly FieldLike[]): string | null {
  return (
    fields.find((f) => f.type === 'longtext')?.id ??
    fields.find((f) => f.type === 'text')?.id ??
    null
  );
}

/** The parameter a field's value goes to, or null when the model has none for it. */
export function paramFor(
  params: readonly ParamDecl[],
  field: FieldLike,
  primary: string | null,
): ParamDecl | null {
  return (
    params.find((p) => p.id === field.id || p.sends === field.id) ??
    (field.id === primary
      ? (params.find((p) => p.role === 'prompt') ?? null)
      : null)
  );
}

/** Whether the form shows a field for this model (no parameters: every field). */
export function acceptsField(
  params: readonly ParamDecl[],
  field: FieldLike,
  primary: string | null,
): boolean {
  if (!params.length) return true;
  // Notes and idea lists are not sent anywhere; they always show.
  if (field.type === 'info' || field.type === 'ideas') return true;
  return paramFor(params, field, primary) !== null;
}

/**
 * The form's answers under the model's own parameter ids: a choice the model
 * does not list is matched by its label, else left out; a number is kept
 * inside the model's range. `dropped` names the fields left out.
 */
export function mapValues(
  params: readonly ParamDecl[],
  fields: readonly FieldLike[],
  answers: Readonly<Record<string, FieldValue | undefined>>,
): { values: Record<string, FieldValue>; dropped: string[] } {
  const primary = primaryField(fields);
  const values: Record<string, FieldValue> = {};
  const dropped: string[] = [];
  for (const f of fields) {
    const v = answers[f.id];
    if (v === undefined || v === '') continue;
    const p = paramFor(params, f, primary);
    if (!p) continue;
    if (typeof v === 'number') {
      values[p.id] = Math.min(p.max ?? v, Math.max(p.min ?? v, v));
      continue;
    }
    if (typeof v === 'string' && p.options.length) {
      const hit =
        p.options.find((o) => o.value === v) ??
        p.options.find((o) => o.label.en.toLowerCase() === v.toLowerCase());
      if (hit) values[p.id] = hit.value;
      else dropped.push(f.id);
      continue;
    }
    values[p.id] = v;
  }
  return { values, dropped };
}
