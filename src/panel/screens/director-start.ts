// ROUND-B: Home's Director start box. Director itself lives in the editor's
// AI mode; here the person only says what they want. The first message makes
// a Project with its first Video (under the plan's limits) and opens AI mode
// on it, where the message is waiting for Director.
import { createOrb } from '../orb/orb';
import { h } from '../dom';
import { icon } from '../icons';
import { t } from '../strings';
import type { Ctx } from '../app';
import { aiHref, leaveForEditor, startProject } from './workspace';

/** Session key AI mode reads the first message from (same tab, same origin). */
export const FIRST_MESSAGE = (videoId: string) => `aive.ai.first.${videoId}`;

export function directorStart(
  ctx: Ctx,
  greeting: string,
  balance: string,
): HTMLElement {
  const orb = createOrb({ size: 132, label: t('room.title') });
  const input = h('textarea', {
    id: 'home-input',
    class: 'start-input',
    rows: 2,
    placeholder: t('rdb.startPlaceholder'),
    'aria-label': t('rdb.startPlaceholder'),
  });
  const error = h('div', { id: 'home-start-error' });
  const send = h(
    'button',
    {
      type: 'button',
      class: 'button primary start-send',
      id: 'home-send',
    },
    icon('send', 18),
    h('span', { text: t('rdb.start') }),
  );
  let busy = false;
  const go = async () => {
    const text = input.value.trim();
    if (!text || busy) {
      input.focus();
      return;
    }
    busy = true;
    send.disabled = true;
    orb.setState('thinking');
    // Nothing is made when the plan says no; the typed words stay.
    const made = await startProject(ctx, 'director', {
      name: text.split(/[.!?।\n]/)[0]!.slice(0, 60),
      host: error,
    }).catch(() => null);
    if (!made) {
      busy = false;
      send.disabled = false;
      orb.setState('refusing');
      return;
    }
    try {
      sessionStorage.setItem(FIRST_MESSAGE(made.videoId), text);
    } catch {
      /* AI mode then opens with an empty chat */
    }
    leaveForEditor({ id: made.videoId, projectId: made.projectId });
    location.assign(aiHref(made.videoId));
  };
  send.onclick = () => void go();
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      void go();
    }
  });
  input.addEventListener('focus', () => orb.setState('listening'));
  input.addEventListener('blur', () => orb.setState('idle'));
  const ideas = (['rdb.idea1', 'rdb.idea2', 'rdb.idea3'] as const).map((key) =>
    h('button', {
      type: 'button',
      class: 'chip',
      'data-idea': key,
      text: t(key),
      onclick: () => {
        input.value = t(key);
        input.focus();
      },
    }),
  );
  return h(
    'section',
    { class: 'start-hero ai-moment', id: 'director-start' },
    h('div', { class: 'start-orb' }, orb.el),
    h('p', { class: 'eyebrow', id: 'greeting', text: greeting }),
    h('h1', { class: 'start-title', text: t('rdb.startTitle') }),
    h('p', { class: 'muted', text: t('rdb.startSub') }),
    h('div', { class: 'start-box' }, input, send),
    error,
    h('div', { class: 'start-ideas' }, ideas),
    h('p', { class: 'start-balance', id: 'home-balance', text: balance }),
  );
}
