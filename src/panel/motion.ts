// P2-R3: the panel's motion helpers (vanilla, no dependency): a draggable reel
// with momentum, pointer spotlight and tilt, reveal on scroll, and optional
// soft sounds. Everything stops when the person turned animations off in
// Settings (data-motion="off") or their system asks for less motion.

/** True when motion is allowed (Settings > Animations, then the system). */
export function motionOn(): boolean {
  const m = document.documentElement.dataset.motion;
  if (m === 'off') return false;
  if (m === 'on') return true;
  return !matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// ---- sounds ---------------------------------------------------------------
let soundOn = false;
let ac: AudioContext | undefined;
export const setSound = (on: boolean) => {
  soundOn = on;
};
/** A very short, soft tone. Silent unless Settings turned sound on. */
export function tick(kind: 'hover' | 'select' | 'done' = 'select') {
  if (!soundOn || !motionOn()) return;
  try {
    ac ??= new AudioContext();
    if (ac.state === 'suspended') void ac.resume();
    const o = ac.createOscillator();
    const g = ac.createGain();
    const f = kind === 'done' ? 880 : kind === 'select' ? 540 : 420;
    const len = kind === 'done' ? 0.28 : 0.07;
    o.type = 'sine';
    o.frequency.setValueAtTime(f, ac.currentTime);
    if (kind === 'done')
      o.frequency.exponentialRampToValueAtTime(1320, ac.currentTime + len);
    g.gain.setValueAtTime(0.0001, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.035, ac.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + len);
    o.connect(g).connect(ac.destination);
    o.start();
    o.stop(ac.currentTime + len + 0.02);
  } catch {
    /* no audio device: stay silent */
  }
}

// ---- spotlight and tilt -----------------------------------------------------
/** Gives every `.glow` inside `root` a light that follows the pointer. */
export function spotlight(root: HTMLElement) {
  root.addEventListener('pointermove', (e) => {
    if (!motionOn()) return;
    const el = (e.target as HTMLElement).closest<HTMLElement>('.glow');
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${((e.clientX - r.left) / r.width) * 100}%`);
    el.style.setProperty('--my', `${((e.clientY - r.top) / r.height) * 100}%`);
  });
  root.addEventListener(
    'pointerover',
    (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('.glow');
      if (el && !el.contains(e.relatedTarget as Node | null)) tick('hover');
    },
    { passive: true },
  );
}

/** A card that leans toward the pointer (`.tilt`, in `.poster-in`). */
export function tilt(root: HTMLElement) {
  root.addEventListener('pointermove', (e) => {
    if (!motionOn() || (e as PointerEvent).buttons) return;
    const el = (e.target as HTMLElement).closest<HTMLElement>('.tilt');
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty('--tx', `${(-y * 8).toFixed(2)}deg`);
    el.style.setProperty('--ty', `${(x * 10).toFixed(2)}deg`);
  });
  root.addEventListener('pointerout', (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('.tilt');
    if (el && !el.contains(e.relatedTarget as Node | null)) {
      el.style.setProperty('--tx', '0deg');
      el.style.setProperty('--ty', '0deg');
    }
  });
}

// ---- reveal on scroll ---------------------------------------------------------
/** Elements with `.reveal` rise and fade in once, a little after each other. */
export function reveal(root: HTMLElement) {
  const items = [...root.querySelectorAll<HTMLElement>('.reveal')];
  items.forEach((el, i) => el.style.setProperty('--i', String(i % 8)));
  if (!motionOn() || typeof IntersectionObserver === 'undefined') {
    for (const el of items) el.classList.add('in');
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const en of entries)
        if (en.isIntersecting) {
          en.target.classList.add('in');
          io.unobserve(en.target);
        }
    },
    { threshold: 0.12 },
  );
  for (const el of items) io.observe(el);
}

// ---- the reel -----------------------------------------------------------------
export interface Reel {
  /** The scrollable element. */
  readonly view: HTMLElement;
  /** Scrolls by one card width, smoothly. */
  step(dir: 1 | -1): void;
}

/**
 * A horizontal reel you can drag. It has momentum and friction, a click that
 * is ignored after a drag, arrow keys, and a depth effect (cards near the
 * middle are bigger and brighter, those at the edges lean away). `bar` is an
 * optional progress track the person can also drag.
 */
export function reel(
  view: HTMLElement,
  bar?: { track: HTMLElement; thumb: HTMLElement; label?: HTMLElement },
): Reel {
  let vx = 0;
  let raf = 0;
  let down = false;
  let moved = 0;
  let lastX = 0;
  let lastT = 0;

  const cards = () => [...view.querySelectorAll<HTMLElement>('.poster')];
  const depth = () => {
    const mid = view.scrollLeft + view.clientWidth / 2;
    const on = motionOn();
    let nearest = 0;
    let best = Infinity;
    cards().forEach((c, i) => {
      const cx = c.offsetLeft + c.offsetWidth / 2;
      const d = Math.max(
        -1,
        Math.min(1, (cx - mid) / (view.clientWidth / 1.6)),
      );
      if (Math.abs(cx - mid) < best) {
        best = Math.abs(cx - mid);
        nearest = i;
      }
      c.style.setProperty('--d', on ? d.toFixed(3) : '0');
      c.style.setProperty('--a', on ? Math.abs(d).toFixed(3) : '0');
    });
    cards().forEach((c, i) => c.toggleAttribute('data-centre', i === nearest));
    if (bar) {
      const max = Math.max(1, view.scrollWidth - view.clientWidth);
      const share = view.clientWidth / view.scrollWidth;
      bar.thumb.style.width = `${Math.max(12, share * 100)}%`;
      bar.thumb.style.left = `${(view.scrollLeft / max) * (100 - Math.max(12, share * 100))}%`;
      if (bar.label)
        bar.label.textContent = `${nearest + 1} / ${cards().length}`;
    }
  };
  let queued = false;
  const queue = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      depth();
    });
  };
  view.addEventListener('scroll', queue, { passive: true });
  new ResizeObserver(queue).observe(view);

  const glide = () => {
    vx *= 0.94;
    view.scrollLeft -= vx;
    if (Math.abs(vx) > 0.2) raf = requestAnimationFrame(glide);
    else raf = 0;
  };
  view.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch' || e.button !== 0) return; // touch scrolls natively
    down = true;
    moved = 0;
    vx = 0;
    lastX = e.clientX;
    lastT = performance.now();
    cancelAnimationFrame(raf);
    view.classList.add('dragging');
  });
  window.addEventListener('pointermove', (e) => {
    if (!down) return;
    const dx = e.clientX - lastX;
    const now = performance.now();
    moved += Math.abs(dx);
    if (moved > 4) view.setPointerCapture?.(e.pointerId);
    view.scrollLeft -= dx;
    vx = (dx / Math.max(1, now - lastT)) * 16;
    lastX = e.clientX;
    lastT = now;
  });
  const end = () => {
    if (!down) return;
    down = false;
    view.classList.remove('dragging');
    if (motionOn() && Math.abs(vx) > 0.5) raf = requestAnimationFrame(glide);
  };
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);
  // A drag must not open the card under the pointer.
  view.addEventListener(
    'click',
    (e) => {
      if (moved > 5) {
        e.preventDefault();
        e.stopPropagation();
        moved = 0;
      }
    },
    true,
  );
  view.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      step(e.key === 'ArrowRight' ? 1 : -1);
    }
  });
  const step = (dir: 1 | -1) => {
    const w = (cards()[0]?.offsetWidth ?? 220) + 24;
    view.scrollBy({
      left: dir * w * 2,
      behavior: motionOn() ? 'smooth' : 'auto',
    });
    tick('hover');
  };
  if (bar) {
    const seek = (e: PointerEvent) => {
      const r = bar.track.getBoundingClientRect();
      const f = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
      view.scrollLeft = f * (view.scrollWidth - view.clientWidth);
    };
    bar.track.addEventListener('pointerdown', (e) => {
      seek(e);
      const mv = (m: PointerEvent) => seek(m);
      const up = () => {
        window.removeEventListener('pointermove', mv);
        window.removeEventListener('pointerup', up);
      };
      window.addEventListener('pointermove', mv);
      window.addEventListener('pointerup', up);
    });
  }
  requestAnimationFrame(depth);
  return { view, step };
}
