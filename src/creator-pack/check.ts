import { z } from 'zod';
import { parsePack } from './parser';
import { itemSchema, packEnvelopeSchema, type CreatorItem } from './schemas';
import { checkPolicy, checkMotion, checkFxCode } from './policy';
import { validatePreset } from './preset';
import { resolveRecipe } from './recipe';
import { checkComposition } from './composition';
import { controlValues } from './controls';
import { checkStyleKit } from './style';
export interface CheckOptions {
  fxCatalog: readonly string[];
  knownLibraryIds: readonly string[];
}
export interface ItemResult {
  id: string;
  type: string;
  status: 'ok' | 'warning' | 'rejected';
  reasons: string[];
  needsRuntimeCheck: boolean;
  item?: CreatorItem;
}
export interface PackResult {
  ok: boolean;
  packId?: string;
  items: ItemResult[];
  reasons: string[];
  report: string;
}
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
function issues(error: z.ZodError): string {
  const issue = error.issues[0]!;
  if (issue.code === 'invalid_union') {
    const relevant = issue.unionErrors.find(
      (e) => !e.issues.some((i) => i.path[0] === 'type'),
    );
    if (relevant) return issues(relevant);
  }
  return `${issue.path.join('.') || 'item'}: ${issue.message}. Check this field against the pack contract.`;
}
function names(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(names);
  if (value && typeof value === 'object') {
    const o = Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, names(v)]),
    );
    if (typeof o.en === 'string' && (!o.hi || o.hi === o.en)) o.hi = o.en;
    return o;
  }
  return value;
}
function references(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(references);
  if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    return typeof o.library === 'string'
      ? [o.library]
      : Object.values(o).flatMap(references);
  }
  return [];
}
function paramReferences(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(paramReferences);
  if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    return typeof o.$param === 'string'
      ? [o.$param]
      : Object.values(o).flatMap(paramReferences);
  }
  return [];
}
export function checkPack(input: unknown, options: CheckOptions): PackResult {
  let raw: unknown;
  try {
    raw = parsePack(input);
  } catch (e) {
    const reason = message(e);
    return {
      ok: false,
      items: [],
      reasons: [reason],
      report: `Pack rejected: ${reason}`,
    };
  }
  const envelope = packEnvelopeSchema.safeParse(raw);
  if (!envelope.success) {
    const reason = issues(envelope.error);
    return {
      ok: false,
      items: [],
      reasons: [reason],
      report: `Pack rejected: ${reason}`,
    };
  }
  const packPolicy = checkPolicy(envelope.data.pack);
  if (packPolicy.errors.length)
    return {
      ok: false,
      items: [],
      reasons: packPolicy.errors,
      report: 'Pack rejected: ' + packPolicy.errors.join('\n'),
    };
  const pack = envelope.data,
    known = new Set(options.knownLibraryIds),
    idCounts = new Map<string, number>();
  for (const item of pack.items)
    if (
      item &&
      typeof item === 'object' &&
      'id' in item &&
      typeof item.id === 'string'
    )
      idCounts.set(item.id, (idCounts.get(item.id) ?? 0) + 1);
  const fullIds = [
    ...known,
    ...[...idCounts.keys()].map((id) => `${pack.pack.id}/${id}`),
  ];
  const reasons = checkPolicy(pack.pack).warnings;
  const items = pack.items.map((rawItem, index): ItemResult => {
    const record =
      rawItem && typeof rawItem === 'object'
        ? (rawItem as Record<string, unknown>)
        : {};
    const result: ItemResult = {
      id: typeof record.id === 'string' ? record.id : `item-${index + 1}`,
      type: typeof record.type === 'string' ? record.type : 'unknown',
      status: 'ok',
      reasons: [],
      needsRuntimeCheck: false,
    };
    try {
      if (record.type === 'font')
        throw Error(
          'Font is not supported in Creator Pack v1; fonts are phase 2.',
        );
      const parsed = itemSchema.safeParse(names(rawItem));
      if (!parsed.success) throw Error(issues(parsed.error));
      const item = parsed.data;
      result.item = item;
      if ((idCounts.get(item.id) ?? 0) > 1)
        throw Error(`Duplicate item id ${item.id}; rename it.`);
      const policy = checkPolicy(rawItem);
      if (policy.errors.length) throw Error(policy.errors[0]);
      result.reasons.push(...policy.warnings);
      if (item.type === 'motion') {
        checkMotion(item);
        result.needsRuntimeCheck = true;
        result.reasons.push(
          `Tier ${item.data.tier}: static checks passed; render, determinism and control-use checks are still required.`,
        );
      } else if (item.type === 'preset') validatePreset(item.data);
      else if (item.type === 'theme') {
        // T1: the text colour must read on the background (WCAG AA, 4.5:1).
        const ratio = contrast(
          item.data.palette.text,
          item.data.palette.background,
        );
        if (ratio < 4.5)
          throw Error(
            `Low contrast: text ${item.data.palette.text} on background ${item.data.palette.background} is ${ratio.toFixed(2)}:1; use at least 4.5:1.`,
          );
      } else if (item.type === 'style') {
        result.reasons.push(
          ...checkStyleKit(item.data, {
            fxCatalog: options.fxCatalog,
            knownLibraryIds: [...known],
            packId: pack.pack.id,
            packItems: [...idCounts.keys()],
          }),
        );
      } else if (item.type === 'composition') {
        result.reasons.push(...checkComposition(item.data.spec, fullIds));
        result.needsRuntimeCheck = true;
        result.reasons.push(
          'Composition render/control-use checks are still required; nothing was applied.',
        );
      } else if (
        ['adjust', 'filter', 'effect', 'transition'].includes(item.type)
      ) {
        const data = item.data;
        if ('mode' in data && data.mode === 'recipe') {
          resolveRecipe(data, options.fxCatalog, item.controls ?? []);
          const used = paramReferences(data);
          for (const c of item.controls ?? [])
            if (c.name !== 'intensity' && !used.includes(c.name))
              throw Error(
                `Unused control ${c.name}: reference it with $param or remove it.`,
              );
        } else if ('mode' in data && data.mode === 'code')
          checkFxCode(data.source);
        else if ('values' in data) {
          const values = controlValues(item.controls ?? []);
          for (const [key, v] of Object.entries(data.values)) {
            if (!options.fxCatalog.includes('adjust.' + key))
              throw Error(
                `Unknown fx id adjust.${key}; supply it in fxCatalog.`,
              );
            if (typeof v === 'object' && typeof values[v.$param] !== 'number')
              throw Error(
                `Adjust ${key}: unknown/non-numeric control ${v.$param}.`,
              );
          }
          const used = paramReferences(data.values);
          for (const c of item.controls ?? [])
            if (c.name !== 'intensity' && !used.includes(c.name))
              throw Error(`Unused control ${c.name}.`);
        }
        result.needsRuntimeCheck = true;
        result.reasons.push(
          'Static FX checks only; input preservation, endpoints, intensity, determinism, control-use and timing require runtime checks.',
        );
      } else {
        result.needsRuntimeCheck = true;
        result.reasons.push(
          'Native schema accepted; visual/control-use checks are still required.',
        );
      }
      if (result.reasons.length) result.status = 'warning';
    } catch (e) {
      result.status = 'rejected';
      result.reasons.push(message(e));
      delete result.item;
    }
    return result;
  });
  const byId = new Map(items.map((i) => [`${pack.pack.id}/${i.id}`, i])),
    visiting = new Set<string>(),
    done = new Set<string>();
  function dependencies(result: ItemResult): void {
    const full = `${pack.pack.id}/${result.id}`;
    if (done.has(full) || result.status === 'rejected') return;
    if (visiting.has(full)) {
      result.status = 'rejected';
      result.reasons.push('Cyclic item dependencies are not supported.');
      return;
    }
    visiting.add(full);
    const item = result.item!;
    for (const id of [...(item.needs ?? []), ...references(item.data)]) {
      const key = id.includes('/') ? id : `${pack.pack.id}/${id}`,
        dependency = byId.get(key);
      if (dependency) dependencies(dependency);
      if (
        (!dependency && !known.has(key)) ||
        dependency?.status === 'rejected'
      ) {
        result.status = 'rejected';
        result.reasons.push(
          `Dependency ${key} is missing or rejected; repair it first.`,
        );
      }
    }
    visiting.delete(full);
    done.add(full);
    if (result.status === 'rejected') delete result.item;
  }
  items.forEach(dependencies);
  const ok = items.every((i) => i.status !== 'rejected'),
    summary = items
      .map(
        (i) =>
          `${i.id}: ${i.status.toUpperCase()}\n${i.reasons.map((r) => '  - ' + r).join('\n')}`,
      )
      .join('\n');
  return {
    ok,
    packId: pack.pack.id,
    items,
    reasons,
    report: `Creator pack ${pack.pack.id}: ${items.filter((i) => i.status !== 'rejected').length}/${items.length} items pass offline checks.\n${reasons.map((r) => 'Warning: ' + r + '\n').join('')}${summary}\nOffline only: no code executed, rendered, registered or applied.`,
  };
}

/** WCAG relative-luminance contrast of two #rrggbb colours. */
function contrast(a: string, b: string): number {
  const luminance = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((index) => {
      const value = parseInt(hex.slice(index, index + 2), 16) / 255;
      return value <= 0.03928
        ? value / 12.92
        : Math.pow((value + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * bl!;
  };
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high! + 0.05) / (low! + 0.05);
}
