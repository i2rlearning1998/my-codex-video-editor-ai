// P3U Orb: the Director's presence. One canvas, no dependency, panel bundle only.
// Six states drive colour, speed and shape (see OrbState in contracts/p3).
// The owner sets name, colours and effect level in Admin; the person's
// Settings > Animations switch always wins (Off = a still picture).
// It pauses when the tab is hidden or the Orb scrolls out of view.
import type { OrbState } from '../../contracts/p3';
import { motionOn } from '../motion';

export type OrbLevel = 'full' | 'light' | 'off';
export interface OrbColors {
  /** Main colour, e.g. the brand accent. */
  readonly a: string;
  /** Second colour, e.g. the brand accent 2. */
  readonly b: string;
  /** Used while building. */
  readonly gold: string;
  /** Used while refusing. */
  readonly warn: string;
}
export interface OrbOptions {
  /** CSS pixels. */
  readonly size?: number;
  readonly level?: OrbLevel;
  readonly colors?: Partial<OrbColors>;
  readonly label?: string;
}
export interface OrbHandle {
  readonly el: HTMLElement;
  setState(s: OrbState): void;
  state(): OrbState;
  /** 0..1 microphone or voice level; smoothed inside. */
  setLevel(v: number): void;
  /** 0..1 while building, null otherwise. */
  setProgress(p: number | null): void;
  setLevelOfEffects(l: OrbLevel): void;
  destroy(): void;
}

const DEFAULTS: OrbColors = {
  a: '#7c5cff',
  b: '#22d3ee',
  gold: '#ffc247',
  warn: '#ff6b6b',
};

/** Per-state look. `hue` blends between the two colours (0 = a, 1 = b). */
interface Look {
  speed: number;
  pulse: number;
  swirl: number;
  ring: number;
  glow: number;
  tint: 'ab' | 'gold' | 'warn';
  mix: number;
}
const LOOK: Record<OrbState, Look> = {
  idle: {
    speed: 0.35,
    pulse: 0.04,
    swirl: 0.3,
    ring: 0.5,
    glow: 0.7,
    tint: 'ab',
    mix: 0.35,
  },
  listening: {
    speed: 0.6,
    pulse: 0.08,
    swirl: 0.5,
    ring: 1,
    glow: 1,
    tint: 'ab',
    mix: 0.85,
  },
  thinking: {
    speed: 1.8,
    pulse: 0.05,
    swirl: 1.6,
    ring: 0.8,
    glow: 0.9,
    tint: 'ab',
    mix: 0.15,
  },
  speaking: {
    speed: 0.9,
    pulse: 0.12,
    swirl: 0.7,
    ring: 0.9,
    glow: 1.1,
    tint: 'ab',
    mix: 0.6,
  },
  refusing: {
    speed: 0.5,
    pulse: 0.02,
    swirl: 0.2,
    ring: 0.3,
    glow: 0.8,
    tint: 'warn',
    mix: 0,
  },
  building: {
    speed: 1.2,
    pulse: 0.05,
    swirl: 1.1,
    ring: 1,
    glow: 1,
    tint: 'gold',
    mix: 0,
  },
};

const hex = (c: string): [number, number, number] => {
  const m = /^#?([0-9a-f]{6})$/i.exec(c.trim());
  const n = m ? parseInt(m[1]!, 16) : 0x7c5cff;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const mixc = (
  x: [number, number, number],
  y: [number, number, number],
  k: number,
) =>
  [
    Math.round(x[0] + (y[0] - x[0]) * k),
    Math.round(x[1] + (y[1] - x[1]) * k),
    Math.round(x[2] + (y[2] - x[2]) * k),
  ] as [number, number, number];
const rgba = (c: [number, number, number], a: number) =>
  `rgba(${c[0]},${c[1]},${c[2]},${Math.max(0, Math.min(1, a))})`;
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

/** Reads the brand colours the panel already applies as CSS variables. */
export function brandOrbColors(
  root: HTMLElement = document.documentElement,
): OrbColors {
  const cs = getComputedStyle(root);
  const v = (n: string, d: string) => cs.getPropertyValue(n).trim() || d;
  return {
    a: v('--brand-accent', DEFAULTS.a),
    b: v('--brand-accent2', DEFAULTS.b),
    gold: v('--brand-gold', DEFAULTS.gold),
    warn: DEFAULTS.warn,
  };
}

interface Mote {
  ang: number;
  rad: number;
  spd: number;
  size: number;
  ph: number;
}

export function createOrb(opts: OrbOptions = {}): OrbHandle {
  const size = opts.size ?? 120;
  const colors: OrbColors = { ...brandOrbColors(), ...opts.colors };
  let level: OrbLevel = opts.level ?? 'full';
  let st: OrbState = 'idle';
  let voice = 0;
  let voiceSmooth = 0;
  let progress: number | null = null;
  let stateAt = 0;
  // Smoothed look values, so a state change glides instead of jumping.
  let cur: Look = { ...LOOK.idle };
  let ca = hex(colors.a);
  let cb = hex(colors.b);

  const el = document.createElement('span');
  el.className = 'orb-live';
  el.style.width = `${size}px`;
  el.style.height = `${size}px`;
  el.setAttribute('role', 'img');
  el.setAttribute('aria-label', opts.label ?? 'Director');
  el.dataset.orbState = st;
  const canvas = document.createElement('canvas');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(size * dpr);
  canvas.height = Math.round(size * dpr);
  el.append(canvas);
  const g = canvas.getContext('2d');

  const motes: Mote[] = Array.from({ length: 46 }, (_, i) => ({
    ang: (i / 46) * Math.PI * 2,
    rad: 0.55 + (((i * 37) % 100) / 100) * 0.42,
    spd: 0.4 + ((i * 53) % 100) / 100,
    size: 0.6 + (((i * 29) % 100) / 100) * 1.4,
    ph: (i * 1.7) % 6.28,
  }));

  const moteCount = () =>
    level === 'full' ? motes.length : level === 'light' ? 14 : 0;

  function frame(t: number, dt: number, still: boolean) {
    if (!g) return;
    const target = LOOK[st];
    const k = still ? 1 : Math.min(1, dt * 4);
    cur = {
      speed: lerp(cur.speed, target.speed, k),
      pulse: lerp(cur.pulse, target.pulse, k),
      swirl: lerp(cur.swirl, target.swirl, k),
      ring: lerp(cur.ring, target.ring, k),
      glow: lerp(cur.glow, target.glow, k),
      tint: target.tint,
      mix: lerp(cur.mix, target.mix, k),
    };
    voiceSmooth = lerp(voiceSmooth, voice, still ? 1 : Math.min(1, dt * 12));
    const W = canvas.width;
    const C = W / 2;
    const R = W * 0.3;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, W, W);
    g.globalCompositeOperation = 'lighter';

    const main =
      cur.tint === 'gold'
        ? hex(colors.gold)
        : cur.tint === 'warn'
          ? hex(colors.warn)
          : mixc(ca, cb, cur.mix);
    const alt = cur.tint === 'ab' ? mixc(cb, ca, cur.mix) : main;

    // Refusing: a short, soft shake that dies out.
    const since = (t - stateAt) / 1000;
    const shake =
      st === 'refusing' && !still
        ? Math.sin(since * 38) * Math.max(0, 1 - since * 1.6) * W * 0.012
        : 0;
    // Breathing and, while speaking or listening, the voice.
    const breathe = Math.sin((t / 1000) * (1.4 * cur.speed + 0.6)) * cur.pulse;
    const speak =
      st === 'speaking'
        ? 0.1 + 0.9 * Math.abs(Math.sin(t / 130) * Math.sin(t / 310))
        : voiceSmooth;
    const r =
      R *
      (1 +
        breathe +
        (st === 'listening' || st === 'speaking' ? speak * 0.12 : 0));
    const cx = C + shake;

    // Outer glow.
    const glow = g.createRadialGradient(cx, C, r * 0.4, cx, C, W * 0.5);
    glow.addColorStop(0, rgba(main, 0.34 * cur.glow));
    glow.addColorStop(0.55, rgba(alt, 0.12 * cur.glow));
    glow.addColorStop(1, rgba(alt, 0));
    g.fillStyle = glow;
    g.fillRect(0, 0, W, W);

    // Core sphere: a lit ball.
    const core = g.createRadialGradient(
      cx - r * 0.35,
      C - r * 0.4,
      r * 0.05,
      cx,
      C,
      r,
    );
    core.addColorStop(0, 'rgba(255,255,255,0.95)');
    core.addColorStop(0.25, rgba(alt, 0.85));
    core.addColorStop(0.75, rgba(main, 0.75));
    core.addColorStop(1, rgba(main, 0.18));
    g.fillStyle = core;
    g.beginPath();
    g.arc(cx, C, r, 0, Math.PI * 2);
    g.fill();

    // Rings: segmented arcs that turn at different speeds.
    const spin = still ? 0 : t / 1000;
    const rings = level === 'off' ? 1 : 3;
    for (let i = 0; i < rings; i++) {
      const rr =
        r * (1.22 + i * 0.2) +
        (st === 'speaking' || st === 'listening'
          ? speak * r * 0.1 * (i + 1)
          : 0);
      g.lineWidth = Math.max(1, W * (0.012 - i * 0.002));
      g.strokeStyle = rgba(i % 2 ? alt : main, (0.55 - i * 0.14) * cur.ring);
      const segs = 3 + i;
      const base = spin * cur.speed * (i % 2 ? -1 : 1) * (0.8 + i * 0.5);
      for (let s = 0; s < segs; s++) {
        const a0 = base + (s / segs) * Math.PI * 2;
        g.beginPath();
        g.arc(cx, C, rr, a0, a0 + ((Math.PI * 2) / segs) * 0.55);
        g.stroke();
      }
    }

    // Motes: little lights swirling around the ball.
    const n = moteCount();
    for (let i = 0; i < n; i++) {
      const m = motes[i]!;
      const a = m.ang + spin * m.spd * cur.swirl;
      const rad =
        r *
        (1.05 + m.rad * 0.75) *
        (st === 'thinking' ? 1 + Math.sin(t / 400 + m.ph) * 0.06 : 1);
      const x = cx + Math.cos(a) * rad;
      const y = C + Math.sin(a) * rad * 0.9;
      const tw = still ? 0.7 : 0.45 + 0.55 * Math.sin((t / 500) * m.spd + m.ph);
      g.fillStyle = rgba(i % 3 ? alt : main, 0.7 * tw);
      g.beginPath();
      g.arc(x, y, m.size * dpr, 0, Math.PI * 2);
      g.fill();
    }

    // Building: a progress arc in gold around everything.
    if (st === 'building') {
      const p = progress ?? (t / 2400) % 1;
      g.lineWidth = Math.max(2, W * 0.022);
      g.lineCap = 'round';
      g.strokeStyle = rgba(hex(colors.gold), 0.25);
      g.beginPath();
      g.arc(cx, C, W * 0.46, 0, Math.PI * 2);
      g.stroke();
      g.strokeStyle = rgba(hex(colors.gold), 0.95);
      g.beginPath();
      const start = -Math.PI / 2 + (progress == null ? spin * 2 : 0);
      g.arc(cx, C, W * 0.46, start, start + Math.max(0.05, p) * Math.PI * 2);
      g.stroke();
    }
    g.globalCompositeOperation = 'source-over';
  }

  let raf = 0;
  let last = 0;
  let running = false;
  let visible = true;
  const animated = () => level !== 'off' && motionOn();
  const loop = (now: number) => {
    raf = 0;
    if (!running) return;
    const dt = Math.min(0.1, (now - last) / 1000 || 0.016);
    // Light level draws at about 30 frames a second.
    if (level === 'light' && now - last < 30) {
      raf = requestAnimationFrame(loop);
      return;
    }
    last = now;
    frame(now, dt, false);
    raf = requestAnimationFrame(loop);
  };
  const sync = () => {
    const want = animated() && visible && !document.hidden;
    if (want && !running) {
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(loop);
    } else if (!want && running) {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    }
    if (!want) frame(performance.now(), 0, true);
    el.dataset.orbAnimated = String(want);
  };
  const onVis = () => sync();
  document.addEventListener('visibilitychange', onVis);
  // Settings > Animations changes data-motion on <html>.
  const mo = new MutationObserver(sync);
  mo.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-motion'],
  });
  let io: IntersectionObserver | undefined;
  if (typeof IntersectionObserver !== 'undefined') {
    io = new IntersectionObserver((es) => {
      visible = es.some((e) => e.isIntersecting);
      sync();
    });
    io.observe(el);
  }
  sync();

  return {
    el,
    setState(s) {
      if (s === st) return;
      st = s;
      stateAt = performance.now();
      el.dataset.orbState = s;
      if (!running) frame(performance.now(), 0, true);
    },
    state: () => st,
    setLevel(v) {
      voice = Math.max(0, Math.min(1, v));
    },
    setProgress(p) {
      progress = p == null ? null : Math.max(0, Math.min(1, p));
      if (!running) frame(performance.now(), 0, true);
    },
    setLevelOfEffects(l) {
      level = l;
      sync();
    },
    destroy() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVis);
      mo.disconnect();
      io?.disconnect();
      el.remove();
    },
  };
}
