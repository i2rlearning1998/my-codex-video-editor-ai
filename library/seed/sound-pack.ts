// Phase 1 library (P1-09): the sound pack the editor used to bundle (V7,
// spec 11.3), now published into the catalog's Audio index by the seed. Twelve short
// sounds made by code, deterministically (the same bytes every time, so an
// import is found again by its fingerprint), as 48 kHz 16-bit mono WAV.
// Nothing is downloaded and there is no licence to track.
export const SOUND_RATE = 48_000;

export interface PackSound {
  readonly id: string;
  /** Translation key of the name. */
  readonly key: string;
  readonly duration: number;
  /** Sample `i` of `n` (seconds `t`), in -1..1. */
  readonly sample: (t: number, n: number, rng: () => number) => number;
}

const TAU = Math.PI * 2;
/** A tiny deterministic noise source (xorshift). */
const noise = (seed: number) => {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return ((x >>> 0) / 0xffffffff) * 2 - 1;
  };
};
const env = (t: number, attack: number, decay: number) =>
  t < attack ? t / attack : Math.exp(-(t - attack) / decay);
const tone = (t: number, hz: number) => Math.sin(TAU * hz * t);
/** A rising or falling sine sweep: phase integrated over a linear glide. */
const sweep = (t: number, from: number, to: number, length: number) =>
  Math.sin(TAU * (from * t + ((to - from) * t * t) / (2 * length)));

export const SOUND_PACK: readonly PackSound[] = [
  {
    id: 'click',
    key: 'sound.click',
    duration: 0.08,
    sample: (t, _n, rng) =>
      (rng() * 0.6 + tone(t, 2400) * 0.4) * env(t, 0.001, 0.01),
  },
  {
    id: 'pop',
    key: 'sound.pop',
    duration: 0.15,
    sample: (t) => sweep(t, 900, 300, 0.15) * env(t, 0.002, 0.03),
  },
  {
    id: 'whoosh',
    key: 'sound.whoosh',
    duration: 0.8,
    sample: (t, _n, rng) => rng() * Math.sin((Math.PI * t) / 0.8) ** 2 * 0.7,
  },
  {
    id: 'swoosh-up',
    key: 'sound.swooshUp',
    duration: 0.6,
    sample: (t, _n, rng) =>
      (sweep(t, 200, 1600, 0.6) * 0.5 + rng() * 0.3) *
      Math.sin((Math.PI * t) / 0.6),
  },
  {
    id: 'swoosh-down',
    key: 'sound.swooshDown',
    duration: 0.6,
    sample: (t, _n, rng) =>
      (sweep(t, 1600, 200, 0.6) * 0.5 + rng() * 0.3) *
      Math.sin((Math.PI * t) / 0.6),
  },
  {
    id: 'ding',
    key: 'sound.ding',
    duration: 1.2,
    sample: (t) =>
      (tone(t, 1318.5) * 0.7 + tone(t, 2637) * 0.2) * env(t, 0.004, 0.35),
  },
  {
    id: 'chime',
    key: 'sound.chime',
    duration: 1.8,
    sample: (t) =>
      (tone(t, 1046.5) * env(t, 0.004, 0.5) +
        (t > 0.15 ? tone(t, 1318.5) * env(t - 0.15, 0.004, 0.5) : 0) +
        (t > 0.3 ? tone(t, 1568) * env(t - 0.3, 0.004, 0.6) : 0)) *
      0.4,
  },
  {
    id: 'beep',
    key: 'sound.beep',
    duration: 0.3,
    sample: (t) =>
      tone(t, 1000) * 0.5 * Math.min(1, t / 0.005, (0.3 - t) / 0.005),
  },
  {
    id: 'notification',
    key: 'sound.notification',
    duration: 0.7,
    sample: (t) =>
      (t < 0.25
        ? tone(t, 880) * env(t, 0.003, 0.08)
        : tone(t, 1320) * env(t - 0.25, 0.003, 0.15)) * 0.6,
  },
  {
    id: 'thud',
    key: 'sound.thud',
    duration: 0.4,
    sample: (t, _n, rng) =>
      (sweep(t, 120, 45, 0.4) * 0.9 + rng() * 0.1) * env(t, 0.002, 0.09),
  },
  {
    id: 'sparkle',
    key: 'sound.sparkle',
    duration: 1,
    sample: (t) => {
      let value = 0;
      for (let k = 0; k < 6; k++) {
        const at = k * 0.12;
        if (t >= at)
          value += tone(t, 2000 + 400 * k) * env(t - at, 0.002, 0.12);
      }
      return value * 0.25;
    },
  },
  {
    id: 'riser',
    key: 'sound.riser',
    duration: 2.5,
    sample: (t, _n, rng) =>
      (sweep(t, 150, 1200, 2.5) * 0.4 + rng() * 0.25) * (t / 2.5) ** 2,
  },
];

/** The sound's samples (mono, at SOUND_RATE). */
export function soundSamples(sound: PackSound): Float32Array {
  const n = Math.round(sound.duration * SOUND_RATE);
  const data = new Float32Array(n);
  const rng = noise(
    [...sound.id].reduce((hash, char) => hash * 31 + char.charCodeAt(0), 7),
  );
  for (let i = 0; i < n; i++) {
    const value = sound.sample(i / SOUND_RATE, n, rng);
    // A 2 ms ramp at both ends: no click at the edges.
    const edge = Math.min(1, i / 96, (n - 1 - i) / 96);
    data[i] = Math.max(-1, Math.min(1, value * edge));
  }
  return data;
}
