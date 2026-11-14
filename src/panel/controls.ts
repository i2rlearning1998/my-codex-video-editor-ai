// ROUND-B B5.5: the panel's shared controls. No native select or file-input
// look anywhere: every <select> and every visible file input that reaches
// the page is dressed here, once, the same way (the New project dialog and
// the Studio forms included). The native element stays inside as the value
// holder, so forms, labels and screen readers keep working; what the person
// sees and uses is the panel's own button and list.
// Checkboxes, radios and colour inputs are drawn by controls.css.
import { h } from './dom';
import { icon } from './icons';
import { t } from './strings';

const DONE = 'data-ctl';
let openList: (() => void) | null = null;

function dressSelect(select: HTMLSelectElement) {
  if (
    select.hasAttribute(DONE) &&
    select.parentElement?.classList.contains('ctl-select')
  )
    return;
  select.setAttribute(DONE, '');
  const wrap = h('span', { class: 'ctl-select' });
  const label = h('span', { class: 'ctl-select-label' });
  const list = h('ul', {
    class: 'ctl-list',
    role: 'listbox',
    hidden: true,
    tabindex: '-1',
  });
  const button = h(
    'button',
    {
      type: 'button',
      class: 'ctl-select-button',
      role: 'combobox',
      'aria-haspopup': 'listbox',
      'aria-expanded': 'false',
    },
    label,
    icon('chevronDown', 16),
  );
  if (select.id) {
    button.id = `${select.id}-button`;
    list.id = `${select.id}-list`;
    button.setAttribute('aria-controls', list.id);
  }
  const name = () =>
    select.getAttribute('aria-label') ??
    (select.id
      ? document.querySelector(`label[for="${CSS.escape(select.id)}"]`)
          ?.textContent
      : null) ??
    '';
  const sync = () => {
    const opt = select.selectedOptions[0];
    label.textContent = opt?.textContent ?? '';
    button.disabled = select.disabled;
    const n = name();
    if (n) button.setAttribute('aria-label', `${n}: ${label.textContent}`);
  };
  let active = -1;
  const items = () => [
    ...list.querySelectorAll<HTMLElement>('[role="option"]'),
  ];
  const mark = (i: number) => {
    const all = items();
    if (!all.length) return;
    active = Math.max(0, Math.min(all.length - 1, i));
    all.forEach((el, k) => el.classList.toggle('active', k === active));
    all[active]!.scrollIntoView({ block: 'nearest' });
    button.setAttribute('aria-activedescendant', all[active]!.id);
  };
  const close = (focus = true) => {
    if (list.hidden) return;
    list.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    button.removeAttribute('aria-activedescendant');
    if (openList === closer) openList = null;
    if (focus) button.focus();
  };
  const closer = () => close(false);
  const choose = (value: string) => {
    close();
    if (select.value === value) return;
    select.value = value;
    select.dispatchEvent(new Event('input', { bubbles: true }));
    select.dispatchEvent(new Event('change', { bubbles: true }));
    sync();
  };
  const open = () => {
    if (select.disabled) return;
    openList?.();
    list.replaceChildren(
      ...[...select.options].map((opt, i) =>
        h('li', {
          role: 'option',
          id: `${list.id || 'ctl'}-o${i}`,
          class: 'ctl-option',
          'data-value': opt.value,
          'aria-selected': String(opt.selected),
          'aria-disabled': opt.disabled ? 'true' : undefined,
          text: opt.textContent ?? '',
          onclick: (e: Event) => {
            e.stopPropagation();
            if (!opt.disabled) choose(opt.value);
          },
        }),
      ),
    );
    list.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    openList = closer;
    // Above the button when there is no room below.
    const r = button.getBoundingClientRect();
    list.classList.toggle(
      'up',
      r.bottom + Math.min(280, list.scrollHeight) > innerHeight - 8 &&
        r.top > 300,
    );
    mark(Math.max(0, select.selectedIndex));
  };
  button.addEventListener('click', () => (list.hidden ? open() : close()));
  button.addEventListener('keydown', (e) => {
    const all = items();
    if (list.hidden) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault();
        open();
      }
      return;
    }
    const step = (d: number) => {
      let i = active;
      do i += d;
      while (all[i] && all[i]!.getAttribute('aria-disabled') === 'true');
      if (all[i]) mark(i);
    };
    if (e.key === 'ArrowDown') step(1);
    else if (e.key === 'ArrowUp') step(-1);
    else if (e.key === 'Home') mark(0);
    else if (e.key === 'End') mark(all.length - 1);
    else if (e.key === 'Enter' || e.key === ' ') {
      const el = all[active];
      if (el && el.getAttribute('aria-disabled') !== 'true')
        choose(el.dataset.value!);
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    } else if (e.key === 'Tab') {
      close(false);
      return;
    } else if (e.key.length === 1) {
      const i = all.findIndex((el) =>
        (el.textContent ?? '').toLowerCase().startsWith(e.key.toLowerCase()),
      );
      if (i >= 0) mark(i);
      return;
    } else return;
    e.preventDefault();
  });
  select.addEventListener('change', sync);
  select.addEventListener('focus', () => button.focus());
  button.addEventListener('pointerenter', sync);
  button.addEventListener('focus', sync);
  select.tabIndex = -1;
  select.setAttribute('aria-hidden', 'true');
  select.classList.add('ctl-native');
  select.before(wrap);
  wrap.append(select, button, list);
  sync();
  // Options that arrive or change later (a list filled after a fetch).
  new MutationObserver(sync).observe(select, {
    childList: true,
    subtree: true,
    attributes: true,
  });
}

function dressFile(input: HTMLInputElement) {
  if (
    input.hasAttribute(DONE) &&
    input.parentElement?.classList.contains('ctl-file')
  )
    return;
  input.setAttribute(DONE, '');
  const name = h('span', {
    class: 'ctl-file-name muted',
    text: t('ctl.noFile'),
  });
  const button = h(
    'button',
    {
      type: 'button',
      class: 'button sm ctl-file-button',
      onclick: () => input.click(),
    },
    icon('upload', 16),
    h('span', { text: t('ctl.choose') }),
  );
  if (input.id) button.id = `${input.id}-button`;
  const label =
    input.getAttribute('aria-label') ??
    (input.id
      ? document.querySelector(`label[for="${CSS.escape(input.id)}"]`)
          ?.textContent
      : null);
  if (label) button.setAttribute('aria-label', `${label}: ${t('ctl.choose')}`);
  const wrap = h('span', { class: 'ctl-file' });
  input.addEventListener('change', () => {
    name.textContent = input.files?.length
      ? [...input.files].map((f) => f.name).join(', ')
      : t('ctl.noFile');
  });
  input.tabIndex = -1;
  input.classList.add('ctl-native');
  input.before(wrap);
  wrap.append(input, button, name);
}

function dress(root: ParentNode) {
  for (const el of root.querySelectorAll<HTMLSelectElement>('select'))
    if (!el.parentElement?.classList.contains('ctl-select')) dressSelect(el);
  for (const el of root.querySelectorAll<HTMLInputElement>(
    'input[type="file"]:not([hidden]):not(.sf-file-input)',
  ))
    if (!el.parentElement?.classList.contains('ctl-file')) dressFile(el);
}

/** Dresses every select and file input now and as pages are drawn. Call once. */
export function startControls(doc: Document = document) {
  dress(doc);
  new MutationObserver((records) => {
    for (const r of records)
      for (const n of r.addedNodes)
        if (n instanceof HTMLElement) {
          if (n.closest('.ctl-select, .ctl-file')) continue;
          if (n instanceof HTMLSelectElement) dressSelect(n);
          else if (
            n instanceof HTMLInputElement &&
            n.type === 'file' &&
            !n.hidden &&
            !n.classList.contains('sf-file-input')
          )
            dressFile(n);
          else dress(n);
        }
  }).observe(doc.body, { childList: true, subtree: true });
  doc.addEventListener('pointerdown', (e) => {
    if (openList && !(e.target as Element).closest?.('.ctl-select')) openList();
  });
}
