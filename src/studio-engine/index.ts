import {
  paramDeclSchema,
  type AssembledRequest,
  type FormSpec,
  type FormValues,
  type ParamDecl,
  type P3Text,
  type StudioEngine,
} from '../contracts/p3';
const fields = (form: FormSpec) =>
  [...form.basic, ...form.advanced].sort(
    (a, b) => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
const valueOf = (values: FormValues, id: string) =>
  Object.hasOwn(values, id) ? values[id] : undefined;
const isList = (value: unknown): value is readonly string[] =>
  Array.isArray(value) && value.every((x) => typeof x === 'string');
const numeric = new Set(['number', 'slider', 'seed']);
const choices = new Set(['choice', 'voice', 'style-card', 'aspect']);
const blank = (value: unknown) =>
  value === undefined ||
  (typeof value === 'string' && !value.trim()) ||
  (Array.isArray(value) && value.length === 0);
const readable = (value: FormValues[string]) =>
  isList(value) ? value.join(', ') : String(value);

export function createStudioEngine(): StudioEngine {
  const visible = (form: FormSpec, values: FormValues) => {
    const list = fields(form),
      byId = new Map(list.map((p) => [p.id, p]));
    const shown = (p: ParamDecl, visiting: Set<string>): boolean => {
      if (!p.showIf) return true;
      if (visiting.has(p.id)) return false;
      const parent = byId.get(p.showIf.field);
      const next = new Set(visiting).add(p.id);
      if (!parent || !shown(parent, next)) return false;
      const value = valueOf(values, parent.id);
      return (
        value !== undefined &&
        (isList(value)
          ? value.some((v) => p.showIf!.in.includes(v))
          : p.showIf.in.includes(String(value)))
      );
    };
    return list.filter((p) => shown(p, new Set()));
  };
  return {
    buildForm(params, ids, canEnhance) {
      const parsed = params.map((p) => paramDeclSchema.parse(p));
      if (new Set(parsed.map((p) => p.id)).size !== parsed.length)
        throw new Error('Each field needs a unique name.');
      for (const p of parsed) {
        if (p.min !== undefined && p.max !== undefined && p.min > p.max)
          throw new Error('A field minimum cannot exceed its maximum.');
        if (p.showIf && !parsed.some((other) => other.id === p.showIf!.field))
          throw new Error('A conditional field refers to an unknown field.');
      }
      return {
        ...ids,
        canEnhance,
        basic: parsed.filter((p) => p.group === 'basic'),
        advanced: parsed.filter((p) => p.group === 'advanced'),
      };
    },
    visible,
    defaults(form) {
      return Object.fromEntries(
        fields(form)
          .filter((p) => p.default !== undefined)
          .map((p) => [p.id, structuredClone(p.default!)]),
      );
    },
    validate(form, values) {
      const errors: Record<string, P3Text> = Object.create(null);
      for (const p of visible(form, values)) {
        const value = valueOf(values, p.id);
        const fail = (message: string) => {
          errors[p.id] = { en: message };
        };
        if (blank(value)) {
          if (p.required) fail(`${p.label.en} is required.`);
          continue;
        }
        if (numeric.has(p.type)) {
          if (typeof value !== 'number' || !Number.isFinite(value)) {
            fail(`${p.label.en} must be a finite number.`);
            continue;
          }
          if (p.type === 'seed' && !Number.isInteger(value))
            fail(`${p.label.en} must be a whole number.`);
          if (p.min !== undefined && value < p.min)
            fail(`${p.label.en} must be at least ${p.min}.`);
          if (p.max !== undefined && value > p.max)
            fail(`${p.label.en} must be at most ${p.max}.`);
          if (p.step !== undefined) {
            const steps = (value - (p.min ?? 0)) / p.step;
            if (Math.abs(steps - Math.round(steps)) > 1e-8)
              fail(`${p.label.en} must use steps of ${p.step}.`);
          }
        } else if (p.type === 'toggle') {
          if (typeof value !== 'boolean')
            fail(`${p.label.en} must be on or off.`);
        } else if (p.type === 'multi') {
          if (
            !isList(value) ||
            value.some((v) => !p.options.some((o) => o.value === v))
          )
            fail(`${p.label.en} contains an unknown choice.`);
        } else if (p.type === 'file') {
          if (
            !(typeof value === 'string' || isList(value)) ||
            (isList(value) && value.some((v) => !v.trim()))
          )
            fail(`${p.label.en} needs file references.`);
        } else if (typeof value !== 'string')
          fail(`${p.label.en} must be text.`);
        else if (
          choices.has(p.type) &&
          p.options.length &&
          !p.options.some((o) => o.value === value)
        )
          fail(`${p.label.en} has an unknown choice.`);
        else if (
          p.type === 'color' &&
          !/^#(?:[a-f0-9]{3}|[a-f0-9]{6}|[a-f0-9]{8})$/i.test(value)
        )
          fail(`${p.label.en} needs a hexadecimal colour.`);
        if (p.role === 'param' && !p.sends)
          fail(`${p.label.en} needs a provider parameter name.`);
        if (p.role === 'param' && isList(value))
          fail(
            `${p.label.en} cannot send a list through this provider contract.`,
          );
        if (
          p.role === 'reference' &&
          !(typeof value === 'string' || isList(value))
        )
          fail(`${p.label.en} needs file references.`);
        if (
          p.role === 'units' &&
          !(
            typeof value === 'string' ||
            (typeof value === 'number' && Number.isFinite(value) && value >= 0)
          )
        )
          fail(`${p.label.en} needs a non-negative count or text to count.`);
      }
      return Object.keys(errors).length ? { ok: false, errors } : { ok: true };
    },
    assemble(form, values): AssembledRequest {
      const main: string[] = [],
        parts: string[] = [],
        negative: string[] = [];
      const params: Record<string, string | number | boolean> =
        Object.create(null);
      const references: Record<string, readonly string[]> = Object.create(null);
      let units = 1,
        hasUnits = false;
      for (const p of visible(form, values)) {
        const value = valueOf(values, p.id);
        if (value === undefined || p.role === 'ui') continue;
        switch (p.role) {
          case 'prompt':
            main.push(readable(value));
            break;
          case 'prompt-part':
            if (!blank(value)) parts.push(`${p.label.en}: ${readable(value)}`);
            break;
          case 'negative':
            negative.push(readable(value));
            break;
          case 'param':
            if (!p.sends || isList(value))
              throw new Error(
                'This field cannot be sent as a provider parameter.',
              );
            params[p.sends] = value;
            break;
          case 'reference':
            if (typeof value !== 'string' && !isList(value))
              throw new Error('This field needs file references.');
            references[p.id] =
              typeof value === 'string' ? (value ? [value] : []) : [...value];
            break;
          case 'units': {
            if (hasUnits)
              throw new Error('Only one field may declare price units.');
            if (typeof value !== 'number' && typeof value !== 'string')
              throw new Error('Price units need a number or text.');
            units = typeof value === 'string' ? [...value].length : value;
            if (p.sends) params[p.sends] = value;
            hasUnits = true;
            break;
          }
        }
      }
      const prompt = [...main, ...parts].join('\n'),
        negativePrompt = negative.join('\n');
      const preview = [
        prompt,
        ...(negative.length ? [`Negative prompt: ${negativePrompt}`] : []),
        ...Object.entries(params).map(([key, value]) => `${key}: ${value}`),
        ...Object.entries(references).map(
          ([key, value]) => `${key}: ${value.join(', ')}`,
        ),
        `Units: ${units}`,
      ].join('\n');
      return {
        prompt,
        ...(negative.length ? { negativePrompt } : {}),
        params,
        references,
        units,
        preview,
      };
    },
  };
}
