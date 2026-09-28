/** ITU-R BS.1770-5 Annex 1, tables 1/2 (48 kHz only), 400 ms/75% gates.
 * https://www.itu.int/rec/R-REC-BS.1770-5-202311-I
 * Stereo programme loudness, not certified compliance or a true-peak meter.
 */
class Biquad {
  x1 = 0;
  x2 = 0;
  y1 = 0;
  y2 = 0;
  constructor(
    readonly b0: number,
    readonly b1: number,
    readonly b2: number,
    readonly a1: number,
    readonly a2: number,
  ) {}
  sample(x: number): number {
    const y =
      this.b0 * x +
      this.b1 * this.x1 +
      this.b2 * this.x2 -
      this.a1 * this.y1 -
      this.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
}
export interface LoudnessMeasurement {
  lufs: number | null;
  samplePeak: number;
  blocks: number;
}
export function measureLoudness(
  channels: readonly Float32Array[],
  sampleRate = 48000,
): LoudnessMeasurement {
  if (sampleRate !== 48000 || channels.length < 1 || channels.length > 2)
    throw new Error('Loudness requires 48 kHz mono or stereo');
  const length = channels[0]!.length;
  if (channels.some((c) => c.length !== length))
    throw new Error('Mismatched audio channels');
  const filters = channels.map(
    () =>
      [
        new Biquad(
          1.53512485958697,
          -2.69169618940638,
          1.19839281085285,
          -1.69065929318241,
          0.73248077421585,
        ),
        new Biquad(1, -2, 1, -1.99004745483398, 0.99007225036621),
      ] as const,
  );
  const window = 19200,
    hop = 4800,
    ring = new Float64Array(window),
    powers: number[] = [];
  let sum = 0,
    samplePeak = 0;
  for (let i = 0; i < length; i++) {
    let energy = 0;
    for (let c = 0; c < channels.length; c++) {
      const x = channels[c]![i]!;
      if (!Number.isFinite(x)) throw new Error('Nonfinite audio sample');
      samplePeak = Math.max(samplePeak, Math.abs(x));
      const f = filters[c]!,
        y = f[1].sample(f[0].sample(x));
      energy += y * y;
    }
    sum += energy - ring[i % window]!;
    ring[i % window] = energy;
    if (i + 1 >= window && (i + 1 - window) % hop === 0)
      powers.push(Math.max(0, sum / window));
  }
  const level = (power: number) => -0.691 + 10 * Math.log10(power);
  const absolute = powers.filter((p) => level(p) > -70);
  if (!absolute.length)
    return { lufs: null, samplePeak, blocks: powers.length };
  const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
  const relative = level(mean(absolute)) - 10;
  const gated = absolute.filter((p) => level(p) > relative);
  return {
    lufs: gated.length ? level(mean(gated)) : null,
    samplePeak,
    blocks: powers.length,
  };
}
export function normalizationAdjustment(
  measurement: LoudnessMeasurement,
  target: number,
) {
  if (!Number.isFinite(target) || target < -36 || target > -5)
    throw new Error('LUFS target outside -36 to -5');
  if (measurement.lufs === null || measurement.samplePeak <= 0)
    throw new Error('At least 400 ms of audible programme is needed');
  const requested = target - measurement.lufs;
  // Do not promise true-peak limiting: this is a conservative sample-peak ceiling.
  const ceiling = -1 - 20 * Math.log10(measurement.samplePeak);
  const gainDb = Math.max(-96, Math.min(24, requested, ceiling));
  return { gainDb, limited: Math.abs(gainDb - requested) > 0.01 };
}
