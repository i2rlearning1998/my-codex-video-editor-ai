// ROUND-B B4: the Style chat on a Project's Style tab. A small conversation
// with Director that only edits the Project's style record: every change is
// shown before and after, and saved only when the person applies it. It
// never touches a Video; an existing Video takes the new style in AI mode.
import { h, clear } from '../dom';
import { icon } from '../icons';
import { t, type Key } from '../strings';
import type { Ctx } from '../app';
import type { StyleFields, WsProject } from '../../project/workspace';
import { line } from '../../director/field-library';
import {
  styleReply,
  type StyleChange,
  type StyleField,
} from '../../director/style-chat';

const LABEL: Record<StyleField, Key> = {
  palette: 'rda.palette',
  headingFont: 'rda.headingFont',
  bodyFont: 'rda.bodyFont',
  captionStyle: 'rda.captionStyle',
  graphics: 'rda.graphics',
  voice: 'rda.voice',
  music: 'rda.music',
  scriptRules: 'rda.scriptRules',
};

const value = (c: StyleChange, side: 'before' | 'after') => {
  const v = c[side];
  if (!v) return h('span', { class: 'muted', text: t('rdb.style.nothing') });
  if (c.field !== 'palette') return h('span', { text: v });
  return h(
    'span',
    { class: 'sc-swatches' },
    v.split(' ').map((hex) =>
      h('span', {
        class: 'sc-swatch',
        style: `background:${hex}`,
        title: hex,
        'data-colour': hex,
      }),
    ),
  );
};

export function styleChat(
  ctx: Ctx,
  p: WsProject,
  /** The style changed: the form and the summary follow. */
  changed: () => void,
): HTMLElement {
  const ws = ctx.s.ws(ctx.user.id);
  const lang = ctx.prefs().locale === 'hi' ? 'hi' : 'en';
  const say = (key: string) => line(ctx.s.config, key, lang);
  const thread = h('div', {
    class: 'sc-thread',
    id: 'style-chat-thread',
    role: 'log',
    'aria-live': 'polite',
  });
  const fields = (): StyleFields => {
    const s = ws.project(p.id)!.style;
    return {
      look: { ...s.look },
      graphics: s.graphics,
      voice: s.voice,
      music: s.music,
      scriptRules: s.scriptRules,
    };
  };
  const bubble = (who: 'director' | 'you', text: string) => {
    const el = h(
      'div',
      { class: `sc-msg ${who}`, 'data-who': who },
      h('p', { text }),
    );
    thread.append(el);
    thread.scrollTop = thread.scrollHeight;
    return el;
  };
  let open: HTMLElement | null = null;
  const close = (card: HTMLElement, key: string) => {
    card.querySelector('.sc-actions')?.remove();
    card.classList.add('done');
    if (open === card) open = null;
    bubble('director', say(key));
  };
  const proposal = (next: StyleFields, changes: StyleChange[]) => {
    // One open proposal at a time: a newer one replaces the older.
    if (open) {
      open.querySelector('.sc-actions')?.remove();
      open.classList.add('done');
    }
    const card = h(
      'div',
      { class: 'sc-card', 'data-style-proposal': '' },
      h('p', { text: say('style.restate') }),
      h(
        'table',
        { class: 'sc-diff' },
        h(
          'thead',
          null,
          h(
            'tr',
            null,
            h('th', { text: '' }),
            h('th', { text: t('rdb.style.before') }),
            h('th', { text: t('rdb.style.after') }),
          ),
        ),
        h(
          'tbody',
          null,
          changes.map((c) =>
            h(
              'tr',
              { 'data-field': c.field },
              h('th', { scope: 'row', text: t(LABEL[c.field]) }),
              h('td', { class: 'before' }, value(c, 'before')),
              h('td', { class: 'after' }, value(c, 'after')),
            ),
          ),
        ),
      ),
      h(
        'div',
        { class: 'sc-actions actions' },
        h('button', {
          type: 'button',
          class: 'button primary',
          'data-style-apply': '',
          text: t('rdb.style.apply'),
          onclick: () => {
            ws.setProjectStyle(p.id, next);
            close(card, 'style.applied');
            changed();
          },
        }),
        h('button', {
          type: 'button',
          class: 'button',
          'data-style-discard': '',
          text: t('rdb.style.discard'),
          onclick: () => close(card, 'style.discarded'),
        }),
      ),
    );
    open = card;
    thread.append(card);
    thread.scrollTop = thread.scrollHeight;
  };
  const input = h('textarea', {
    id: 'style-chat-input',
    rows: 2,
    maxlength: 1000,
    placeholder: t('rdb.style.placeholder'),
    'aria-label': t('rdb.style.placeholder'),
  });
  const send = () => {
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    bubble('you', text);
    const reply = styleReply(ctx.s.config, fields(), text, lang);
    if (reply.kind === 'refusal')
      bubble('director', reply.text).classList.add('refusal');
    else if (reply.kind === 'question') bubble('director', say('style.unsure'));
    else if (reply.kind === 'same') bubble('director', say('style.same'));
    else if (reply.kind === 'only') bubble('director', say('style.only'));
    else proposal(reply.next, reply.changes);
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      send();
    }
  });
  clear(thread);
  bubble('director', say('style.hello'));
  return h(
    'section',
    {
      class: 'sc director-card',
      id: 'style-chat',
      'aria-label': t('rdb.style.title'),
    },
    h('h3', { text: t('rdb.style.title') }),
    thread,
    h(
      'div',
      { class: 'sc-box' },
      input,
      h(
        'button',
        {
          type: 'button',
          class: 'button primary sc-send',
          id: 'style-chat-send',
          'aria-label': t('rdb.style.send'),
          title: t('rdb.style.send'),
          onclick: send,
        },
        icon('send', 18),
      ),
    ),
  );
}
