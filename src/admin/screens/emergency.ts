// P3U: the three emergency switches and the message people see.
import { h, clear } from '../../panel/dom';
import type { EmergencySwitches } from '../../contracts/p3';
import { at } from '../strings';
import { askReason, failure } from '../ui';
import { errorText, type AdminScreen } from './common';

export const emergencyScreen: AdminScreen = async (ctx, _args, out) => {
  clear(
    out,
    h('div', { class: 'ad-head' }, h('h1', { text: at('ad.em.title') })),
    h('p', { class: 'lead', text: at('ad.em.lead') }),
  );
  try {
    const cur = await ctx.s.client.emergency();
    let next: EmergencySwitches = { ...cur };
    const anyOn = () => next.aiOff || next.signupsOff || next.paymentsOff;
    const dirty = () =>
      next.aiOff !== cur.aiOff ||
      next.signupsOff !== cur.signupsOff ||
      next.paymentsOff !== cur.paymentsOff ||
      next.message.en !== cur.message.en ||
      (next.message.hi ?? '') !== (cur.message.hi ?? '');
    const save = h('button', {
      type: 'button',
      class: 'button primary',
      id: 'ad-em-save',
      text: at('ad.em.save'),
      disabled: true,
    });
    const state = h('p', {
      class: 'ad-note',
      id: 'ad-em-state',
      role: 'status',
    });
    const paint = () => {
      save.disabled = !dirty();
      const on = anyOn();
      state.className = `ad-note ${on ? 'warn' : 'ok'}`;
      state.textContent = on
        ? at('ad.banner.on', { what: whatText(next) })
        : at('ad.em.allClear');
    };
    const sw = (
      key: 'aiOff' | 'signupsOff' | 'paymentsOff',
      id: string,
      label: string,
      help: string,
    ) =>
      h(
        'label',
        { class: 'ad-switch-row', 'data-switch': id },
        h(
          'span',
          { class: 'ad-switch-text' },
          h('strong', { text: label }),
          h('span', { class: 'muted', text: help }),
        ),
        h(
          'span',
          { class: 'switch' },
          h('input', {
            type: 'checkbox',
            id: `ad-em-${id}`,
            checked: cur[key],
            onchange: (e: Event) => {
              next = { ...next, [key]: (e.target as HTMLInputElement).checked };
              paint();
            },
          }),
          h('span', { 'aria-hidden': 'true' }),
        ),
      );
    const msg = (hi: boolean) =>
      h('textarea', {
        id: hi ? 'ad-em-message-hi' : 'ad-em-message',
        rows: 2,
        value: hi ? (cur.message.hi ?? '') : cur.message.en,
        oninput: (e: Event) => {
          const v = (e.target as HTMLTextAreaElement).value;
          next = {
            ...next,
            message: hi
              ? { en: next.message.en, ...(v ? { hi: v } : {}) }
              : { en: v, ...(next.message.hi ? { hi: next.message.hi } : {}) },
          };
          paint();
        },
      });
    save.addEventListener('click', async () => {
      const turningOn = anyOn();
      const reason = await askReason(
        at('ad.em.title'),
        () => [],
        turningOn ? { danger: true } : {},
      );
      if (!reason) return;
      try {
        await ctx.s.client.setEmergency(next, reason);
        ctx.toast(at('ad.done.emergency'));
        ctx.refreshBanner();
        ctx.go('emergency');
      } catch (e) {
        ctx.toast(errorText(e), 'error');
      }
    });
    out.append(
      state,
      h(
        'div',
        { class: 'ad-card ad-switches' },
        sw('aiOff', 'ai', at('ad.em.ai'), at('ad.em.aiHelp')),
        sw(
          'signupsOff',
          'signups',
          at('ad.em.signups'),
          at('ad.em.signupsHelp'),
        ),
        sw(
          'paymentsOff',
          'payments',
          at('ad.em.payments'),
          at('ad.em.paymentsHelp'),
        ),
      ),
      h(
        'div',
        { class: 'ad-card' },
        h(
          'label',
          { class: 'ad-field' },
          h('span', { text: at('ad.em.message') }),
          msg(false),
        ),
        h(
          'label',
          { class: 'ad-field' },
          h('span', { text: at('ad.em.messageHi') }),
          msg(true),
        ),
      ),
      h('div', { class: 'ad-actions' }, save),
    );
    paint();
  } catch (e) {
    out.append(failure(errorText(e), () => ctx.go('emergency')));
  }
};

export function whatText(
  e: Pick<EmergencySwitches, 'aiOff' | 'signupsOff' | 'paymentsOff'>,
): string {
  const parts: string[] = [];
  if (e.aiOff) parts.push(at('ad.em.what.ai'));
  if (e.signupsOff) parts.push(at('ad.em.what.signups'));
  if (e.paymentsOff) parts.push(at('ad.em.what.payments'));
  return parts.join(', ');
}
