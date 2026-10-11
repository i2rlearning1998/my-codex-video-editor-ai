import { test, expect } from './fixtures';

// V7f: the PR #14 audio engine tests, ported onto schema 7 (spec 11.3).
// Its Sound panel UI tests are rebuilt for the right Audio panel in
// e2e/v7-audio.spec.ts (the Sound panel is not ported).

test('[AUD-015][AUD-017][AUD-009][AUD-003] preview graph and export render identical stereo samples and measured downmix', async ({
  page,
}) => {
  // (Heavy offline rendering: generous under parallel load.)
  test.setTimeout(120_000);
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const graphPath = '/src/audio/graph.ts',
      settingsPath = '/src/audio/settings.ts',
      mixPath = '/src/export/mixdown.ts';
    const { scheduleAudioClip } = await import(graphPath);
    const { defaultAudioSettings } = await import(settingsPath);
    const { mixdown } = await import(mixPath);
    const rate = 48000,
      length = rate * 2;
    const buffer = new AudioBuffer({
      numberOfChannels: 6,
      length,
      sampleRate: rate,
    });
    // Constant independent channel values make the standard 5.1 matrix testable.
    [0.1, 0.2, 0.1, 0.8, 0.1, 0.2].forEach((v, c) =>
      buffer.getChannelData(c).fill(v),
    );
    const base = {
      clipId: 'a',
      trackId: 'a',
      sourceAssetId: 'a',
      startTime: 0,
      duration: 2,
      sourceIn: 0,
      sourceOut: 2,
      speed: 1,
      reversed: false,
    };
    const context = new OfflineAudioContext(2, length, rate);
    scheduleAudioClip(context, context.destination, base, buffer, 0, 0);
    const down = await context.startRendering();
    const clip = {
      ...base,
      audio: {
        ...defaultAudioSettings(),
        gainDb: -6,
        pan: 0.35,
        fadeIn: 0.2,
        fadeOut: 0.3,
        volumeKeys: [
          { time: 0, db: -12 },
          { time: 1, db: -6 },
        ],
      },
    };
    const preview = new OfflineAudioContext(2, length, rate);
    scheduleAudioClip(preview, preview.destination, clip, buffer, 0, 0);
    const rendered = await preview.startRendering();
    const exported = await mixdown(
      [clip],
      { decode: async () => buffer },
      0,
      2,
    );
    let max = 0,
      squared = 0;
    for (let c = 0; c < 2; c++)
      for (let i = 0; i < length; i++) {
        const d = rendered.getChannelData(c)[i]! - exported.channels[c][i]!;
        max = Math.max(max, Math.abs(d));
        squared += d * d;
      }
    const channel = rendered.getChannelData(0);
    return {
      max,
      rmsError: Math.sqrt(squared / (2 * length)),
      left: down.getChannelData(0)[100],
      right: down.getChannelData(1)[100],
      start: channel[0],
      middle: channel[rate],
      end: channel[length - 1],
    };
  });
  expect(result.max).toBeLessThan(1e-6);
  expect(result.rmsError).toBeLessThan(1e-7);
  expect(result.left).toBeCloseTo(0.1 + Math.SQRT1_2 * 0.2, 5);
  expect(result.right).toBeCloseTo(0.2 + Math.SQRT1_2 * 0.3, 5);
  expect(result.start).toBe(0);
  expect(result.middle).toBeGreaterThan(0.01);
  expect(result.end).toBeLessThan(0.001);
});

test('[AUD-011][AUD-015] EQ, compressor and normalization have measured effect and export parity', async ({
  page,
}) => {
  // (Heavy offline rendering: generous under parallel load.)
  test.setTimeout(120_000);
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const p = '/src/audio/graph.ts',
      s = '/src/audio/settings.ts',
      m = '/src/export/mixdown.ts',
      n = '/src/audio/normalize.ts',
      l = '/src/audio/loudness.ts';
    const { scheduleAudioClip } = await import(p),
      { defaultAudioSettings } = await import(s),
      { mixdown } = await import(m),
      { normalizeClip } = await import(n),
      { measureLoudness } = await import(l);
    const rate = 48000,
      length = rate * 3;
    const make = (frequency: number, amplitude: number) => {
      const b = new AudioBuffer({
        sampleRate: rate,
        numberOfChannels: 1,
        length,
      });
      const c = b.getChannelData(0);
      for (let i = 0; i < length; i++)
        c[i] = amplitude * Math.sin((2 * Math.PI * frequency * i) / rate);
      return b;
    };
    const base = {
      clipId: 'a',
      trackId: 'a',
      sourceAssetId: 'a',
      startTime: 0,
      duration: 3,
      sourceIn: 0,
      sourceOut: 3,
      speed: 1,
      reversed: false,
      audio: defaultAudioSettings(),
    };
    const rms = (x: Float32Array) =>
      Math.sqrt(
        x.slice(rate).reduce((s, v) => s + v * v, 0) / (x.length - rate),
      );
    const ratios: number[] = [];
    for (const [band, freq] of [
      ['low', 50],
      ['mid', 1000],
      ['high', 10000],
    ] as const) {
      const b = make(freq, 0.1),
        decoder = { decode: async () => b };
      const dry = await mixdown([base], decoder, 0, 3);
      const wet = await mixdown(
        [
          {
            ...base,
            audio: { ...base.audio, eq: { ...base.audio.eq, [band]: 6 } },
          },
        ],
        decoder,
        0,
        3,
      );
      ratios.push(rms(wet.channels[0]) / rms(dry.channels[0]));
    }
    const loud = make(997, 0.8),
      decoder = { decode: async () => loud };
    const compressed = {
      ...base,
      audio: {
        ...base.audio,
        compressor: {
          ...base.audio.compressor,
          enabled: true,
          threshold: -30,
          ratio: 8,
        },
      },
    };
    const dry = await mixdown([base], decoder, 0, 3),
      wet = await mixdown([compressed], decoder, 0, 3);
    const normalized = await normalizeClip(
      base,
      { decode: async () => make(997, 0.1) },
      -16,
    );
    const final = await mixdown(
      [{ ...base, audio: normalized }],
      { decode: async () => make(997, 0.1) },
      0,
      3,
    );
    const preview = new OfflineAudioContext(2, length, rate);
    scheduleAudioClip(preview, preview.destination, compressed, loud, 0, 0);
    const rendered = await preview.startRendering();
    let max = 0;
    for (let c = 0; c < 2; c++)
      for (let i = 0; i < length; i++)
        max = Math.max(
          max,
          Math.abs(rendered.getChannelData(c)[i]! - wet.channels[c][i]!),
        );
    return {
      ratios,
      compression: rms(wet.channels[0]) / rms(dry.channels[0]),
      lufs: measureLoudness(final.channels).lufs,
      max,
    };
  });
  result.ratios.forEach((r) => expect(r).toBeGreaterThan(1.8));
  expect(result.compression).toBeLessThan(0.8);
  expect(result.lufs).toBeCloseTo(-16, 1);
  expect(result.max).toBeLessThan(1e-6);
});

test('[AUD-012][AUD-015] measured speech-driven ducking and seeking match export waveform', async ({
  page,
}) => {
  // (Heavy offline rendering: generous under parallel load.)
  test.setTimeout(120_000);
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const d = '/src/audio/ducking.ts',
      g = '/src/audio/graph.ts',
      s = '/src/audio/settings.ts',
      m = '/src/export/mixdown.ts';
    const { prepareDucking } = await import(d),
      { scheduleAudioClip } = await import(g),
      { defaultAudioSettings } = await import(s),
      { mixdown } = await import(m);
    const rate = 48000,
      length = rate * 3,
      music = new AudioBuffer({
        length,
        numberOfChannels: 1,
        sampleRate: rate,
      }),
      speech = new AudioBuffer({
        length,
        numberOfChannels: 1,
        sampleRate: rate,
      });
    for (let i = 0; i < length; i++) {
      music.getChannelData(0)[i] =
        0.1 * Math.sin((2 * Math.PI * 440 * i) / rate);
      speech.getChannelData(0)[i] =
        i >= rate && i < rate * 2
          ? 0.2 * Math.sin((2 * Math.PI * 997 * i) / rate)
          : 0;
    }
    const audio = defaultAudioSettings(),
      base = {
        trackId: 'x',
        startTime: 0,
        duration: 3,
        sourceIn: 0,
        sourceOut: 3,
        speed: 1,
        reversed: false,
      };
    const clips = [
      {
        ...base,
        clipId: 'music',
        sourceAssetId: 'music',
        audio: {
          ...audio,
          pan: -1,
          role: 'music',
          duck: { ...audio.duck, enabled: true },
        },
      },
      {
        ...base,
        clipId: 'speech',
        sourceAssetId: 'speech',
        audio: { ...audio, pan: 1, role: 'speech' },
      },
    ];
    const buffers = new Map([
        ['music', music],
        ['speech', speech],
      ]),
      prepared = prepareDucking(clips, buffers),
      context = new OfflineAudioContext(2, length, rate);
    for (const clip of prepared)
      scheduleAudioClip(
        context,
        context.destination,
        clip,
        buffers.get(clip.sourceAssetId),
        0,
        0,
      );
    const rendered = await context.startRendering(),
      decoder = { decode: async (id: string) => buffers.get(id) },
      exported = await mixdown(clips, decoder, 0, 3);
    const left = rendered.getChannelData(0),
      rms = (from: number, to: number) =>
        Math.sqrt(
          left.slice(from * rate, to * rate).reduce((s, v) => s + v * v, 0) /
            ((to - from) * rate),
        );
    let max = 0;
    for (let c = 0; c < 2; c++)
      for (let i = 0; i < length; i++)
        max = Math.max(
          max,
          Math.abs(rendered.getChannelData(c)[i]! - exported.channels[c][i]!),
        );
    const seek = await mixdown(clips, decoder, 1.3, 1.8);
    let seekError = 0;
    for (let i = 0; i < seek.channels[0].length; i++)
      seekError = Math.max(
        seekError,
        Math.abs(seek.channels[0][i] - left[Math.round(1.3 * rate) + i]!),
      );
    return {
      duckDb: 20 * Math.log10(rms(1.3, 1.8) / rms(0.3, 0.8)),
      released: rms(2.6, 2.9) / rms(0.3, 0.8),
      max,
      seekError,
    };
  });
  expect(result.duckDb).toBeCloseTo(-12, 1);
  expect(result.released).toBeCloseTo(1, 2);
  expect(result.max).toBeLessThan(1e-6);
  expect(result.seekError).toBeLessThan(1e-5);
});
