// G1: the one dropdown (LAY-018), replacing native <select> in the toolbar and
// panels. A button shows the current choice; its listbox opens in the shared
// popover with keyboard navigation (arrows, Home, End, Enter, Escape, typing).
import { iconSvg } from '../icons';
import { closePopover, openAnchor, openPopover } from './popover';

export interface SelectOption {
  readonly value: string;
  readonly label: string;
  /** Optional CSS font-family for previewing fonts in their own face. */
  readonly font?: string;
  readonly disabled?: boolean;
}

export interface SelectOptions {
  readonly id: string;
  readonly label: string;
  readonly options: readonly SelectOption[];
  readonly value: string;
  readonly compact?: boolean;
  readonly disabled?: boolean;
  readonly data?: Readonly<Record<string, string>>;
  readonly onChange: (value: string) => void;
}

export function createSelect(options: SelectOptions): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'select-field';
  if (options.compact) wrap.classList.add('compact');
  wrap.title = options.label;
  const label = document.createElement('span');
  label.className = 'select-field-label';
  label.textContent = options.label;
  label.id = `${options.id}-label`;
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.id = options.id;
  trigger.className = 'select-trigger';
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-label', options.label);
  trigger.disabled = !!options.disabled;
  for (const [key, value] of Object.entries(options.data ?? {}))
    trigger.dataset[key] = value;
  let value = options.value;
  const current = () => options.options.find((item) => item.value === value);
  const paint = () => {
    trigger.dataset.value = value;
    const text = document.createElement('span');
    text.className = 'select-value';
    text.textContent = current()?.label ?? value;
    if (current()?.font) text.style.fontFamily = current()!.font!;
    trigger.replaceChildren(text);
    trigger.insertAdjacentHTML('beforeend', iconSvg('chevronDown', 12));
  };
  paint();
  const choose = (next: string) => {
    closePopover();
    trigger.focus();
    if (next === value) return;
    value = next;
    paint();
    options.onChange(next);
  };
  const open = () => {
    const list = document.createElement('div');
    list.className = 'select-list';
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-labelledby', label.id);
    const items = options.options.map((option) => {
      const item = document.createElement('div');
      item.setAttribute('role', 'option');
      item.className = 'select-option';
      item.dataset.value = option.value;
      item.tabIndex = -1;
      item.textContent = option.label;
      if (option.font) item.style.fontFamily = option.font;
      item.setAttribute('aria-selected', String(option.value === value));
      if (option.disabled) item.setAttribute('aria-disabled', 'true');
      else item.onclick = () => choose(option.value);
      list.append(item);
      return item;
    });
    const enabled = () =>
      items.filter((item) => item.getAttribute('aria-disabled') !== 'true');
    const focusAt = (index: number) => {
      const list = enabled();
      list[(index + list.length) % list.length]?.focus();
    };
    list.onkeydown = (event) => {
      const all = enabled();
      const at = all.indexOf(document.activeElement as HTMLDivElement);
      if (event.key === 'ArrowDown') focusAt(at + 1);
      else if (event.key === 'ArrowUp') focusAt(at - 1);
      else if (event.key === 'Home') focusAt(0);
      else if (event.key === 'End') focusAt(-1);
      else if (event.key === 'Enter' || event.key === ' ') {
        const active = document.activeElement as HTMLElement;
        if (active?.dataset.value !== undefined) choose(active.dataset.value);
      } else if (event.key.length === 1) {
        const letter = event.key.toLowerCase();
        const match = all.findIndex(
          (item, index) =>
            index > at && item.textContent!.toLowerCase().startsWith(letter),
        );
        const first = all.findIndex((item) =>
          item.textContent!.toLowerCase().startsWith(letter),
        );
        if (match >= 0 || first >= 0) focusAt(match >= 0 ? match : first);
      } else return;
      event.preventDefault();
    };
    openPopover(trigger, list, {
      label: options.label,
      role: 'listbox',
      className: 'select-popover',
    });
    list.setAttribute('role', 'presentation');
    list.parentElement!.setAttribute('role', 'listbox');
    (
      items.find((item) => item.dataset.value === value) ?? enabled()[0]
    )?.focus();
  };
  trigger.onclick = () => (openAnchor() === trigger ? closePopover() : open());
  trigger.onkeydown = (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      open();
    }
  };
  wrap.append(label, trigger);
  return wrap;
}
