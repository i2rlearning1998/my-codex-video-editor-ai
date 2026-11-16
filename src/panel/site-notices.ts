// ROUND-C5 (1.5, 1.6): the owner's banner and the maintenance page, drawn the
// same way on the website and in the panel. Text is set as text (never HTML).
import {
  bannerFor,
  maintenanceFor,
  text as say,
  type PlatformConfig,
} from '../platform-config';
import { h } from './dom';
import './notices.css';

const lang = () => (document.documentElement.lang === 'hi' ? 'hi' : 'en');

/** The banner element for a surface now, or null (closed or not shown). */
export function siteBanner(
  config: PlatformConfig,
  where: 'website' | 'panel',
  now = Date.now(),
): HTMLElement | null {
  const b = bannerFor(config.site, where, now);
  if (!b) return null;
  try {
    if (b.dismissible && localStorage.getItem(b.key) === '1') return null;
  } catch {
    // Storage may be blocked; the banner then shows.
  }
  const bar = h(
    'div',
    {
      class: `site-banner site-banner-${b.color}`,
      role: 'status',
      id: 'site-banner',
      'data-banner-version': String(b.version),
    },
    b.link
      ? h('a', { href: b.link, text: say(b.text, lang()) })
      : h('span', { text: say(b.text, lang()) }),
  );
  if (b.dismissible) {
    const close = h('button', {
      type: 'button',
      class: 'site-banner-close',
      id: 'site-banner-close',
      'aria-label': lang() === 'hi' ? 'बंद करें' : 'Close',
      text: '×',
    });
    close.addEventListener('click', () => {
      try {
        localStorage.setItem(b.key, '1');
      } catch {
        // Not remembered when storage is blocked.
      }
      bar.remove();
    });
    bar.append(close);
  }
  return bar;
}

/** The maintenance page for a surface, or null when it is open. */
export function maintenancePage(
  config: PlatformConfig,
  where: 'website' | 'panel',
): HTMLElement | null {
  const m = maintenanceFor(config.site, where);
  if (!m) return null;
  return h(
    'main',
    { class: 'site-main maintenance-page', id: 'maintenance-page' },
    h('h1', { text: config.brand.name }),
    h('p', {
      class: 'lead',
      id: 'maintenance-message',
      text: say(m.message, lang()),
    }),
    m.backAt
      ? h('p', { class: 'muted', id: 'maintenance-back', text: m.backAt })
      : null,
  );
}
