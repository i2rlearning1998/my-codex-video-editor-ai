// P3U: flags: what each one switches on and how many people have it.
import { h, clear } from '../../panel/dom';
import { at } from '../strings';
import { empty, failure } from '../ui';
import { errorText, type AdminScreen } from './common';

export const flagsScreen: AdminScreen = async (ctx, _args, out) => {
  clear(
    out,
    h('div', { class: 'ad-head' }, h('h1', { text: at('ad.flags.title') })),
    h('p', { class: 'lead', text: at('ad.flags.lead') }),
  );
  try {
    const flags = await ctx.s.client.flags();
    out.append(
      flags.length
        ? h(
            'div',
            { class: 'ad-flag-grid', id: 'ad-flag-list' },
            ...flags.map((f) =>
              h(
                'article',
                { class: 'ad-card ad-flag-card', 'data-flag': f.flag },
                h('h2', { class: 'mono', text: f.flag }),
                h('p', { class: 'muted', text: f.description }),
                h(
                  'div',
                  { class: 'ad-flag-foot' },
                  h('span', {
                    class: 'ad-pill mute',
                    text: at('ad.flags.users', { n: f.users }),
                  }),
                  h('a', {
                    class: 'button sm',
                    href: `#/users?flag=${encodeURIComponent(f.flag)}`,
                    text: at('ad.flags.see'),
                  }),
                ),
              ),
            ),
          )
        : empty(at('ad.flags.empty')),
    );
  } catch (e) {
    out.append(failure(errorText(e), () => ctx.go('flags')));
  }
};
