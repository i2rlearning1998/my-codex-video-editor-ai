// ROUND-C3 (Part 6): the Readymade Style checks, DOM-free. A Style's plan
// template is a Video Plan v4 with `{{slot}}` markers; filled with each
// slot's default it must validate. Slot names in the template and the slot
// list must match. Looks must be well formed. A published Style needs at
// least three passed tests on three different topics, or the owner's
// written override reason (which is stored with it).
import type { Style } from '../platform-config';
import { validatePlan } from '../video-plan';

const MARK = /\{\{([a-z0-9][a-z0-9-]*)\}\}/g;

/** Every `{{slot}}` name used in a template. */
export function templateSlots(template: unknown): string[] {
  const found = new Set<string>();
  const walk = (v: unknown) => {
    if (typeof v === 'string')
      for (const m of v.matchAll(MARK)) found.add(m[1]!);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(template);
  return [...found];
}

/**
 * The template with its slots filled (a value, else the slot's default). A
 * string that is exactly one marker of a number-like value becomes a number
 * (durationHint "{{length}}").
 */
export function fillTemplate(
  template: unknown,
  values: Readonly<Record<string, string>>,
): unknown {
  const fill = (v: unknown): unknown => {
    if (typeof v === 'string') {
      const whole = /^\{\{([a-z0-9][a-z0-9-]*)\}\}$/.exec(v);
      if (whole && /^-?\d+(\.\d+)?$/.test(values[whole[1]!] ?? ''))
        return Number(values[whole[1]!]);
      return v.replace(MARK, (_, name: string) => values[name] ?? '');
    }
    if (Array.isArray(v)) return v.map(fill);
    if (v && typeof v === 'object')
      return Object.fromEntries(
        Object.entries(v).map(([k, x]) => [k, fill(x)]),
      );
    return v;
  };
  return fill(template);
}

export interface StyleCheck {
  readonly ok: boolean;
  readonly errors: readonly string[];
}

export function validateStyle(style: Style): StyleCheck {
  const errors: string[] = [];
  const at = `Style "${style.id}"`;
  const slots = style.slots ?? [];
  const names = slots.map((s) => s.name);
  const dup = names.find((n, i) => names.indexOf(n) !== i);
  if (dup) errors.push(`${at}: two slots are both called "${dup}".`);
  if (style.planTemplate) {
    const used = templateSlots(style.planTemplate);
    for (const n of used)
      if (!names.includes(n))
        errors.push(
          `${at}: the template uses {{${n}}}, which is not in its slots.`,
        );
    for (const n of names)
      if (!used.includes(n))
        errors.push(`${at}: the slot "${n}" is not used in the template.`);
    const filled = fillTemplate(
      style.planTemplate,
      Object.fromEntries(slots.map((s) => [s.name, s.default])),
    ) as { version?: unknown };
    if (filled.version !== 4)
      errors.push(`${at}: the template must be a Video Plan version 4.`);
    const checked = validatePlan(filled);
    if (!checked.ok)
      errors.push(
        ...checked.errors
          .slice(0, 10)
          .map((e) => `${at}, template with the default values: ${e}`),
      );
  } else if (slots.length)
    errors.push(`${at}: it has slots but no plan template.`);
  const looks = style.looks ?? [];
  const lookIds = looks.map((l) => l.id);
  if (lookIds.some((id, i) => lookIds.indexOf(id) !== i))
    errors.push(`${at}: two looks share an id.`);
  if (looks.length && (looks.length < 3 || looks.length > 4))
    errors.push(`${at}: a Style offers 3 or 4 looks (it has ${looks.length}).`);
  for (const l of looks)
    if (!l.headingFont.trim() || !l.bodyFont.trim())
      errors.push(
        `${at}: the look "${l.id}" needs a heading font and a body font.`,
      );
  if ((style.status ?? 'published') === 'published' && style.planTemplate) {
    const passed = new Set(
      (style.tests ?? [])
        .filter((t) => t.passed)
        .map((t) => t.topic.trim().toLowerCase()),
    );
    if (passed.size < 3 && (style.publishOverride ?? '').trim().length < 10)
      errors.push(
        `${at}: a published Style needs at least 3 passed tests on 3 different topics (it has ${passed.size}), or the owner's written reason to publish anyway.`,
      );
  }
  return { ok: errors.length === 0, errors };
}
