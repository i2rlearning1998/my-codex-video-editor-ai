import { describe, it, expect } from 'vitest';
import { toCaptionCues, type Transcription } from '../../src/speech';
const result: Transcription = {
  text: 'Hello world again',
  language: 'en',
  segments: [],
  words: [
    { start: 0, end: 0.4, text: 'Hello' },
    { start: 0.5, end: 1, text: 'world' },
    { start: 1.1, end: 1.8, text: 'again' },
  ],
};
describe('caption cues', () => {
  it('bounds lines and preserves word highlights without mutating input', () => {
    const cues = toCaptionCues(result, { maxCharsPerLine: 5, maxDuration: 2 });
    expect(cues.map((c) => c.lines)).toEqual([['Hello', 'world'], ['again']]);
    expect(cues.flatMap((c) => c.words)).toEqual(result.words);
    expect(result.words).toHaveLength(3);
  });
  it('splits cues at the maximum duration', () => {
    const cues = toCaptionCues(result, { maxDuration: 1, minDuration: 0.1 });
    expect(cues).toHaveLength(2);
    expect(cues.every((c) => c.end - c.start <= 1)).toBe(true);
  });
  it('extends a short last cue to the minimum duration', () => {
    const cues = toCaptionCues({
      text: 'Hi',
      language: 'en',
      segments: [{ start: 0, end: 0.1, text: 'Hi' }],
    });
    expect(cues[0]?.end).toBe(0.5);
    expect(cues[0]?.words).toEqual([]);
  });
  it('keeps Hindi text and original word timing', () => {
    const words = [
      { start: 0, end: 0.4, text: 'नमस्ते' },
      { start: 0.5, end: 1, text: 'दुनिया' },
    ];
    expect(
      toCaptionCues({
        text: 'नमस्ते दुनिया',
        language: 'hi',
        segments: words,
        words,
      })[0]?.words,
    ).toEqual(words);
  });
  it('reports impossible layouts instead of silently losing text or timing', () => {
    expect(() => toCaptionCues(result, { maxCharsPerLine: 2 })).toThrow();
    expect(() =>
      toCaptionCues(result, { minDuration: 2, maxDuration: 1 }),
    ).toThrow();
    expect(() =>
      toCaptionCues({
        text: 'x',
        language: 'en',
        segments: [{ start: 0, end: 10, text: 'x' }],
      }),
    ).toThrow();
  });

  it('[FIX6-001] repair keeps every word when the engine times them badly', async () => {
    const { repairTranscription } = await import('../../src/speech/captions');
    const bad = {
      text: 'एक दो तीन चार',
      language: 'hi',
      segments: [{ start: 0, end: 9, text: 'एक दो तीन चार' }],
      words: [
        { text: 'एक', start: 0, end: 0 }, // no length
        { text: 'दो', start: 0.1, end: 0.6 }, // overlaps the one before
        { text: 'तीन', start: 0.6, end: 9 }, // runs for 8 seconds
        { text: 'चार', start: 9, end: 9.4 },
      ],
    };
    expect(() => toCaptionCues(bad)).toThrow();
    const cues = toCaptionCues(repairTranscription(bad));
    expect(cues.flatMap((cue) => cue.words.map((word) => word.text))).toEqual([
      'एक',
      'दो',
      'तीन',
      'चार',
    ]);
    for (const [i, cue] of cues.entries()) {
      expect(cue.end).toBeGreaterThan(cue.start);
      if (i) expect(cue.start).toBeGreaterThanOrEqual(cues[i - 1]!.end);
    }
  });
  it('[FIX6-001] a run of quick words keeps its timing, not an error', async () => {
    const { repairTranscription } = await import('../../src/speech/captions');
    const quick = Array.from({ length: 30 }, (_, i) => ({
      text: `शब्द${i}`,
      start: i * 0.1,
      end: i * 0.1 + 0.1,
    }));
    const cues = toCaptionCues(
      repairTranscription({
        text: quick.map((w) => w.text).join(' '),
        language: 'hi',
        segments: [],
        words: quick,
      }),
    );
    expect(cues.length).toBeGreaterThan(0);
  });
});
