// H2: one tooltip for the whole app. Any element with a `title` gets a
// styled tooltip instead of the browser's: 500 ms before the first one, then
// instant while the pointer moves between controls. A shortcut written in the
// title as "Label (Ctrl+Z)" is shown as a key hint. The title is lent to the
// tooltip while it shows (so the browser's own tooltip never doubles it) and
// given back when the pointer leaves.
const FIRST_DELAY = 500;
const WARM_FOR = 400;

export function splitShortcut(title: string): { label: string; keys: string } {
  const match =
    /^(.*\S)\s+\(([^()]*(?:Ctrl|Alt|Shift|Cmd|⌘|Space|Esc|Del|Enter|[A-Z0-9,.\/\[\]=+-])[^()]*)\)$/.exec(
      title,
    );
  return match && match[2]!.length <= 16
    ? { label: match[1]!, keys: match[2]! }
    : { label: title, keys: '' };
}

export function mountTooltips(root: Document = document): () => void {
  const tip = root.createElement('div');
  tip.className = 'tooltip';
  tip.setAttribute('role', 'tooltip');
  tip.id = 'app-tooltip';
  tip.hidden = true;
  root.body.append(tip);
  let owner: HTMLElement | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let warmUntil = 0;
  const giveBack = () => {
    if (!owner) return;
    const lent = owner.dataset.tipTitle;
    if (lent !== undefined && !owner.hasAttribute('title'))
      owner.setAttribute('title', lent);
    delete owner.dataset.tipTitle;
    owner.removeAttribute('aria-describedby');
  };
  const hide = () => {
    clearTimeout(timer);
    if (!tip.hidden) warmUntil = performance.now() + WARM_FOR;
    tip.hidden = true;
    giveBack();
    owner = null;
  };
  const place = (target: HTMLElement) => {
    const box = target.getBoundingClientRect();
    const width = tip.offsetWidth,
      height = tip.offsetHeight;
    const margin = 8;
    let top = box.bottom + 6;
    if (top + height + margin > innerHeight) top = box.top - 6 - height;
    const left = Math.min(
      Math.max(margin, box.left + box.width / 2 - width / 2),
      innerWidth - width - margin,
    );
    tip.style.left = `${Math.round(left)}px`;
    tip.style.top = `${Math.round(Math.max(margin, top))}px`;
  };
  const show = (target: HTMLElement) => {
    if (!target.isConnected || owner !== target) return;
    const title = target.getAttribute('title') ?? target.dataset.tipTitle;
    if (!title) return;
    target.dataset.tipTitle = title;
    target.removeAttribute('title');
    target.setAttribute('aria-describedby', tip.id);
    const { label, keys } = splitShortcut(title);
    tip.replaceChildren(label);
    if (keys) {
      const kbd = root.createElement('kbd');
      kbd.textContent = keys;
      tip.append(kbd);
    }
    tip.hidden = false;
    place(target);
  };
  const over = (event: PointerEvent) => {
    if (event.pointerType === 'touch') return;
    const target = (event.target as Element | null)?.closest?.<HTMLElement>(
      '[title], [data-tip-title]',
    );
    if (!target || target === owner) return;
    hide();
    if (target.closest('.tooltip, [role="menu"] [role^="menuitem"]')) return;
    owner = target;
    // Lend the title at once so the browser's tooltip never appears.
    const title = target.getAttribute('title');
    if (title) {
      target.dataset.tipTitle = title;
      target.removeAttribute('title');
    }
    const delay = performance.now() < warmUntil ? 0 : FIRST_DELAY;
    timer = setTimeout(() => show(target), delay);
  };
  const out = (event: PointerEvent) => {
    if (!owner) return;
    const to = event.relatedTarget as Node | null;
    if (to && owner.contains(to)) return;
    hide();
  };
  const down = () => hide();
  root.addEventListener('pointerover', over, true);
  root.addEventListener('pointerout', out, true);
  root.addEventListener('pointerdown', down, true);
  root.addEventListener('keydown', down, true);
  root.addEventListener('scroll', down, true);
  return () => {
    hide();
    root.removeEventListener('pointerover', over, true);
    root.removeEventListener('pointerout', out, true);
    root.removeEventListener('pointerdown', down, true);
    root.removeEventListener('keydown', down, true);
    root.removeEventListener('scroll', down, true);
    tip.remove();
  };
}
