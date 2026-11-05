// P3U: the owner's chat, picture and memory limits. Nothing is fixed in code.
import { h, clear } from '../../panel/dom';
import type { P3AdminSettings } from '../../contracts/p3';
import { at } from '../strings';
import { askReason, failure } from '../ui';
import { errorText, type AdminScreen } from './common';

export const settingsScreen: AdminScreen = async (ctx, _args, out) => {
  clear(
    out,
    h('div', { class: 'ad-head' }, h('h1', { text: at('ad.set.title') })),
    h('p', { class: 'lead', text: at('ad.set.lead') }),
  );
  try {
    const cur = await ctx.s.settings.get();
    // Plain mutable copy the fields write into.
    const v = {
      chatOn: cur.chat.enabled,
      chatMax: cur.chat.maxMessagesPerDay,
      chatTokens: cur.chat.maxHistoryTokens,
      visionOn: cur.vision.enabled,
      visionCredits: cur.vision.creditsPerImage,
      visionMax: cur.vision.maxImagesPerMessage,
      keep: cur.memory.keepRecent,
      sumAbove: cur.memory.summariseAboveTokens,
      facts: cur.memory.maxFacts,
      rules: cur.memory.maxStyleRules,
      ttl: cur.entitlementTtlSeconds,
      replay: cur.webhookReplayWindowSeconds,
    };
    const save = h('button', {
      type: 'button',
      class: 'button primary',
      id: 'ad-set-save',
      text: at('ad.set.save'),
      disabled: true,
    });
    const err = h('p', {
      class: 'ad-dlg-error',
      id: 'ad-set-error',
      role: 'alert',
    });
    const hint = h('p', { class: 'muted', id: 'ad-set-hint' });
    const initial = JSON.stringify(v);
    const nums = [
      'chatMax',
      'chatTokens',
      'visionCredits',
      'visionMax',
      'keep',
      'sumAbove',
      'facts',
      'rules',
      'ttl',
      'replay',
    ] as const;
    const valid = () => nums.every((k) => Number.isInteger(v[k]) && v[k] >= 0);
    const paint = () => {
      const ok = valid();
      err.textContent = ok ? '' : at('ad.set.bad');
      hint.textContent = at('ad.set.costHint', {
        n: v.visionCredits * v.visionMax,
        m: v.visionMax,
      });
      save.disabled = !ok || JSON.stringify(v) === initial;
    };
    const numField = (key: (typeof nums)[number], label: string) =>
      h(
        'label',
        { class: 'ad-field row' },
        h('span', { text: label }),
        h('input', {
          type: 'number',
          id: `ad-set-${key}`,
          min: 0,
          step: 1,
          value: String(v[key]),
          oninput: (e: Event) => {
            v[key] = (e.target as HTMLInputElement).valueAsNumber;
            paint();
          },
        }),
      );
    const toggle = (key: 'chatOn' | 'visionOn', label: string) =>
      h(
        'label',
        { class: 'ad-switch-row' },
        h('span', { class: 'ad-switch-text' }, h('strong', { text: label })),
        h(
          'span',
          { class: 'switch' },
          h('input', {
            type: 'checkbox',
            id: `ad-set-${key}`,
            checked: v[key],
            onchange: (e: Event) => {
              v[key] = (e.target as HTMLInputElement).checked;
              paint();
            },
          }),
          h('span', { 'aria-hidden': 'true' }),
        ),
      );
    save.addEventListener('click', async () => {
      const reason = await askReason(at('ad.set.save'));
      if (!reason) return;
      const next: P3AdminSettings = {
        chat: {
          enabled: v.chatOn,
          maxMessagesPerDay: v.chatMax,
          maxHistoryTokens: v.chatTokens,
        },
        vision: {
          enabled: v.visionOn,
          creditsPerImage: v.visionCredits,
          maxImagesPerMessage: v.visionMax,
        },
        memory: {
          keepRecent: v.keep,
          summariseAboveTokens: v.sumAbove,
          maxFacts: v.facts,
          maxStyleRules: v.rules,
        },
        entitlementTtlSeconds: v.ttl,
        webhookReplayWindowSeconds: v.replay,
      };
      try {
        await ctx.s.settings.set(next, reason);
        ctx.toast(at('ad.done.settings'));
        ctx.go('settings');
      } catch (e) {
        ctx.toast(errorText(e), 'error');
      }
    });
    out.append(
      h(
        'div',
        { class: 'ad-two' },
        h(
          'section',
          { class: 'ad-card' },
          h('h2', { text: at('ad.set.chat') }),
          toggle('chatOn', at('ad.set.chatOn')),
          numField('chatMax', at('ad.set.chatMax')),
          numField('chatTokens', at('ad.set.chatTokens')),
        ),
        h(
          'section',
          { class: 'ad-card' },
          h('h2', { text: at('ad.set.vision') }),
          toggle('visionOn', at('ad.set.visionOn')),
          numField('visionCredits', at('ad.set.visionCredits')),
          numField('visionMax', at('ad.set.visionMax')),
          hint,
        ),
      ),
      h(
        'div',
        { class: 'ad-two' },
        h(
          'section',
          { class: 'ad-card' },
          h('h2', { text: at('ad.set.memory') }),
          numField('keep', at('ad.set.keep')),
          numField('sumAbove', at('ad.set.sumAbove')),
          numField('facts', at('ad.set.facts')),
          numField('rules', at('ad.set.rules')),
        ),
        h(
          'section',
          { class: 'ad-card' },
          h('h2', { text: at('ad.set.security') }),
          numField('ttl', at('ad.set.ttl')),
          numField('replay', at('ad.set.replay')),
        ),
      ),
      err,
      h('div', { class: 'ad-actions' }, save),
    );
    paint();
  } catch (e) {
    out.append(failure(errorText(e), () => ctx.go('settings')));
  }
};
