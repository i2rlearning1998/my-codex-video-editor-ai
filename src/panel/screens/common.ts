// Pieces several screens share: the model picker, cards, lists.
import {
  modelAvailability,
  modelsForRole,
  type Model,
} from '../../platform-config';
import { h } from '../dom';
import type { Ctx } from '../app';
import { t } from '../strings';

/**
 * P2-R2: the order to offer models in: connected first, a real provider
 * before the offline mock, the recommended one first.
 */
export function bestModels(ctx: Ctx, list: readonly Model[]): Model[] {
  const rank = (m: Model) =>
    (ctx.s.connected(m.id) ? 0 : 4) +
    (m.providerId === 'mock' ? 2 : 0) +
    (m.recommendedForDirector ? 0 : 1);
  return [...list].sort((a, b) => rank(a) - rank(b));
}

/** P2-29: Fast / Balanced / Best, or exact models when the rulebook reveals names. */
export function modelPicker(
  ctx: Ctx,
  role: string,
  current: string,
  onPick: (id: string) => void,
): HTMLElement {
  const c = ctx.s.config;
  const plan = ctx.s.planOf(ctx.user.id);
  const button = (m: Model | undefined, label: string) => {
    const allowed = !!m && modelAvailability(c, plan, m.id).ok;
    // P2-R2: a model whose provider has no key on the server is not connected.
    const ok = allowed && ctx.s.connected(m!.id);
    return h(
      'button',
      {
        type: 'button',
        class: `seg${m && m.id === current ? ' on' : ''}`,
        'aria-pressed': String(!!m && m.id === current),
        disabled: !ok,
        title: ok
          ? undefined
          : allowed
            ? t('common.notConnected')
            : t('common.locked'),
        'data-model': m?.id,
        onclick: () => m && onPick(m.id),
      },
      label,
      ok
        ? null
        : h('span', { class: 'lock', 'aria-hidden': 'true', text: ' 🔒' }),
    );
  };
  const box = h('div', {
    class: 'model-picker',
    role: 'group',
    'aria-label': t('brief.model'),
  });
  if (c.director.reveal.modelNames)
    for (const m of modelsForRole(c, role))
      box.append(button(m, ctx.say(m.name)));
  else {
    const list = bestModels(ctx, modelsForRole(c, role));
    for (const tier of ['fast', 'balanced', 'best'] as const) {
      const pick = list.filter((m) => m.tier === tier)[0];
      box.append(button(pick, t(`tier.${tier}`)));
    }
  }
  return h(
    'div',
    { class: 'field' },
    h('span', { class: 'field-label', text: t('brief.model') }),
    box,
  );
}

export const card = (
  attrs: Record<string, unknown>,
  ...children: (Node | string | null)[]
) => h('article', { class: 'card', ...attrs }, ...children);
export const empty = (text: string) => h('p', { class: 'empty-state', text });
export const when = (iso: string, locale: string) =>
  new Date(iso).toLocaleDateString(locale === 'hi' ? 'hi-IN' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

/** P2B-26: a plan limit: the owner's sentence and an Upgrade link. */
export function limitAlert(id: string, message: string): HTMLElement {
  return h(
    'p',
    { class: 'error-state', role: 'alert', id },
    `${message} `,
    h('a', { href: '#/credits', class: 'upgrade-link' }, t('common.upgrade')),
  );
}
