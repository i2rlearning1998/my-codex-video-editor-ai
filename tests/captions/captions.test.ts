import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  autoCaption,
  CAPTION_STYLES,
  captionCommands,
  captionTrackFromTranscription,
  captionTrackOf,
  createCaptionsHook,
  editCaptionCommands,
  findCaptions,
  karaokeCommands,
  karaokeSteps,
  parseSrt,
  parseVtt,
  resplit,
  toSrt,
  toVtt,
  type CaptionTrack,
} from '../../src/captions';
import { buildProjectFromComposition } from '../../src/composition';
import {
  compositionAt,
  createProject,
  EditorEngine,
  evaluateProperty,
  type Command,
} from '../../src/core';
import { deriveRenderItems } from '../../src/render/adapter';
import type { CaptionCue } from '../../src/speech/captions';
import type {
  SttProvider,
  Transcription,
  WordTiming,
} from '../../src/speech/types';

const words: WordTiming[] = [
  { text: 'Every', start: 0, end: 0.4 },
  { text: 'jar', start: 0.4, end: 0.8 },
  { text: 'of', start: 0.8, end: 1 },
  { text: 'honey', start: 1, end: 1.6 },
  { text: 'starts', start: 1.6, end: 2.1 },
  { text: 'with', start: 2.1, end: 2.4 },
  { text: 'a', start: 2.4, end: 2.5 },
  { text: 'single', start: 2.5, end: 3 },
  { text: 'flower.', start: 3, end: 3.8 },
];
const transcription: Transcription = {
  text: words.map((w) => w.text).join(' '),
  language: 'en',
  segments: [],
  words,
};
/** A fake STT provider: no network, records what it was asked. */
function fakeStt(result: Transcription = transcription) {
  const calls: { lang?: string; hasBlob: boolean }[] = [];
  const stt: SttProvider = {
    id: 'fake-stt',
    name: 'Fake STT',
    requiresKey: false,
    keyFields: [],
    kind: 'speech-stt',
    languages: ['en'],
    transcribe: async (request) => {
      calls.push({
        ...(request.lang ? { lang: request.lang } : {}),
        hasBlob: request.blob instanceof Blob,
      });
      return result;
    },
  };
  return { stt, calls };
}
const engineWith = () => {
  const project = createProject('Captions', '2026-10-17T00:00:00.000Z');
  project.compositions[0]!.id = 'scene';
  return new EditorEngine(project);
};
const apply = (engine: EditorEngine, track: CaptionTrack) => {
  const result = captionCommands(track, {
    compositionId: 'scene',
    width: 1920,
    height: 1080,
    idPrefix: 'cap',
  });
  engine.commands.transaction(result.label, result.commands);
  return result;
};

describe('[CAP] auto caption', () => {
  it('transcribes through the injected STT and splits by the options', async () => {
    const { stt, calls } = fakeStt();
    const track = await autoCaption(new Blob(['x']), {
      stt,
      lang: 'en',
      style: 'minimal',
      maxCharsPerLine: 12,
      minDuration: 0.1,
    });
    expect(calls).toEqual([{ lang: 'en', hasBlob: true }]);
    expect(track.language).toBe('en');
    expect(track.style.id).toBe('minimal');
    // Minimal is one line per cue, at most 12 characters.
    expect(track.cues.map((cue) => cue.lines)).toEqual([
      ['Every jar of'],
      ['honey starts'],
      ['with a'],
      ['single'],
      ['flower.'],
    ]);
    expect(track.cues.flatMap((cue) => cue.words)).toEqual(words);
    const two = captionTrackFromTranscription(transcription, {
      maxCharsPerLine: 12,
      maxLines: 2,
    });
    expect(two.cues.map((cue) => cue.lines.length)).toEqual([2, 2, 1]);
    // Resplit keeps every word's timing.
    const again = resplit(two, { maxLines: 1, maxCharsPerLine: 30 });
    expect(again.cues.flatMap((cue) => cue.words)).toEqual(words);
    expect(again.cues.every((cue) => cue.lines.length === 1)).toBe(true);
  });

  it('[FIX9-005] a word longer than a line stands alone on its own line', () => {
    expect(() =>
      captionTrackFromTranscription(transcription, { maxCharsPerLine: 3 }),
    ).not.toThrow();
    expect(() =>
      captionTrackFromTranscription(transcription, { style: 'nope' as never }),
    ).toThrow(/Unknown caption style/);
  });
});

describe('[CAP] SRT and VTT', () => {
  const track = captionTrackFromTranscription(transcription, {
    maxCharsPerLine: 20,
  });
  it('round trips cues through SRT and words through VTT', () => {
    const srt = toSrt(track.cues);
    expect(srt).toContain('00:00:00,000 --> 00:00:');
    const fromSrt = parseSrt(srt);
    expect(
      fromSrt.map(({ start, end, lines }) => ({ start, end, lines })),
    ).toEqual(
      track.cues.map(({ start, end, lines }) => ({ start, end, lines })),
    );
    expect(toSrt(fromSrt)).toBe(srt);
    const vtt = toVtt(track.cues);
    expect(vtt.startsWith('WEBVTT')).toBe(true);
    expect(vtt).toContain('<00:00:00.400>jar');
    const fromVtt = parseVtt(vtt);
    // The words here touch each other, so their ends come back exactly.
    expect(fromVtt).toEqual(track.cues);
    expect(toVtt(fromVtt)).toBe(vtt);
  });
  it('refuses a broken file', () => {
    expect(() => parseVtt('1\n00:00:01.000 --> 00:00:02.000\nHi')).toThrow(
      /WEBVTT/,
    );
    expect(() => parseSrt('1\n00:00:02,000 --> 00:00:01,000\nHi')).toThrow(
      /ends before/,
    );
  });
});

describe('[CAP] caption layers and editing', () => {
  it('adds one lane of text layers with cue markers, and edits keep timing', () => {
    const engine = engineWith();
    const track = captionTrackFromTranscription(transcription, {
      style: 'clean',
      maxCharsPerLine: 20,
    });
    const result = apply(engine, track);
    const scene = engine.state.compositions[0]!;
    expect(scene.tracks[0]).toMatchObject({ name: 'Captions', type: 'text' });
    expect(
      scene.tracks[0]!.clips.map((c) => [c.startTime, c.duration]),
    ).toEqual(track.cues.map((c) => [c.start, c.end - c.start]));
    const found = findCaptions(scene);
    expect(found.map((f) => f.cue.id)).toEqual(track.cues.map((c) => c.id));
    // The clean style draws a box behind the text (one group per cue).
    expect(scene.layers.every((l) => l.type === 'group')).toBe(true);
    // It draws: the text is on the canvas at the cue's time.
    const items = deriveRenderItems({
      composition: compositionAt(scene, 0.2),
      assets: [],
      background: '#000000',
      currentTime: 0.2,
    }).items;
    expect(items.find((i) => i.id === result.textLayerIds[0])?.text).toBe(
      found[0]!.text,
    );
    const first = found[0]!;
    const changed = first.text.replace('Every', 'Each');
    const edit = editCaptionCommands(scene, first.textLayerId, changed);
    engine.commands.transaction(edit.label, edit.commands);
    const after = findCaptions(engine.state.compositions[0]!)[0]!;
    expect(after.text).toBe(changed);
    expect([after.cue.start, after.cue.end]).toEqual([
      first.cue.start,
      first.cue.end,
    ]);
    // Same word count: the word timings are kept with the new words.
    expect(after.cue.words).toEqual(
      first.cue.words.map((w, i) => (i === 0 ? { ...w, text: 'Each' } : w)),
    );
    // Another word count: the words are spread over the same time.
    const spread = editCaptionCommands(
      engine.state.compositions[0]!,
      first.textLayerId,
      'Short',
    );
    engine.commands.transaction(spread.label, spread.commands);
    const short = findCaptions(engine.state.compositions[0]!)[0]!.cue;
    expect(short).toMatchObject({
      start: first.cue.start,
      end: first.cue.end,
      approximate: true,
      words: [{ text: 'Short', start: first.cue.start, end: first.cue.end }],
    });
    // The track comes back for export.
    expect(
      captionTrackOf(engine.state.compositions[0]!).cues[0]!.lines,
    ).toEqual(['Short']);
    expect(() =>
      editCaptionCommands(engine.state.compositions[0]!, 'nope', 'x'),
    ).toThrow(/not a caption/);
  });
});

describe('[CAP] karaoke', () => {
  const cue: CaptionCue = {
    id: 'k',
    start: 1,
    end: 2.5,
    lines: ['one two', 'three'],
    words: [
      { text: 'one', start: 1, end: 1.4 },
      { text: 'two', start: 1.5, end: 2 },
      { text: 'three', start: 2, end: 2.5 },
    ],
  };
  const style = CAPTION_STYLES.karaoke;
  it('highlights each word from its start, deterministically', () => {
    const steps = karaokeSteps(cue, 'one two\nthree', style);
    expect(steps.map((s) => s.time)).toEqual([1, 1.5, 2, 2.5]);
    expect(steps[1]!.runs).toEqual([
      { start: 0, end: 3, color: style.highlightColor },
      { start: 4, end: 7, color: style.highlightColor, underline: true },
      { start: 7, end: 13, color: style.color },
    ]);
    const commands = karaokeCommands(
      'scene',
      'text',
      cue,
      'one two\nthree',
      style,
    );
    expect(JSON.stringify(commands)).toBe(
      JSON.stringify(
        karaokeCommands('scene', 'text', cue, 'one two\nthree', style),
      ),
    );
    const property = (commands[0] as Extract<Command, { type: 'SET_PROPERTY' }>)
      .property;
    const at = (time: number) =>
      JSON.parse((evaluateProperty(property, time) as string) || '[]') as {
        underline?: boolean;
        start: number;
      }[];
    expect(at(1.2).find((r) => r.underline)?.start).toBe(0);
    expect(at(1.7).find((r) => r.underline)?.start).toBe(4);
    expect(at(2.2).find((r) => r.underline)?.start).toBe(8);
    expect(at(3).some((r) => r.underline)).toBe(false);
  });
  it('skips words that are not in the text and keeps the layout path', () => {
    const steps = karaokeSteps(
      { ...cue, words: [{ text: 'zzz', start: 1, end: 2 }] },
      'one two',
      style,
    );
    expect(steps).toEqual([]);
    // Applied through the layer model, the highlight is a held keyframe list.
    const engine = engineWith();
    const track = captionTrackFromTranscription(transcription, {
      style: 'karaoke',
    });
    const result = apply(engine, track);
    const text = engine.state.compositions[0]!.layers[0]!.children.find(
      (l) => l.id === result.textLayerIds[0],
    )!;
    expect(text.properties.textRuns).toMatchObject({ animated: true });
    expect(text.properties.textRuns!.keyframes[0]).toMatchObject({
      time: 0,
      easing: 'hold',
    });
  });
});

describe('[CAP] composition adapter hook', () => {
  const read = () =>
    JSON.parse(
      readFileSync('tests/fixtures/compositions/documentary-mini.json', 'utf8'),
    ) as unknown;
  it('adds captions in the build and clears them from missing', async () => {
    const { stt } = fakeStt();
    const hook = await createCaptionsHook({
      stt,
      media: new Blob(['voice']),
      style: 'bold-box',
    });
    const result = await buildProjectFromComposition(read(), {
      captions: hook,
    });
    expect(result.errors).toEqual([]);
    expect(result.missing.map((m) => m.kind)).not.toContain('captions');
    const found = result.project!.compositions.flatMap((c) => findCaptions(c));
    expect(found.length).toBeGreaterThan(0);
    // Every word of the narration is captioned in the first scene (5 s).
    expect(found.flatMap((f) => f.cue.words).map((w) => w.text)).toEqual(
      words.map((w) => w.text),
    );
    expect(found[0]!.marker.styleId).toBe('bold-box');
    // Without the hook the adapter still reports them.
    const bare = await buildProjectFromComposition(read(), {});
    expect(bare.missing.map((m) => m.kind)).toContain('captions');
  });
  it('places cues in the scene they start in, cut at its end', async () => {
    const cues: CaptionCue[] = [
      { id: 'a', start: 4.5, end: 6, lines: ['across the cut'], words: [] },
      { id: 'b', start: 6, end: 7, lines: ['second scene'], words: [] },
    ];
    const result = await buildProjectFromComposition(read(), {
      captions: createCaptionsHook({ cues, style: 'minimal' }),
    });
    const [first, second] = result.project!.compositions.map((c) =>
      findCaptions(c),
    );
    expect(first!.map((f) => [f.cue.start, f.cue.end])).toEqual([[4.5, 5]]);
    expect(second!.map((f) => [f.cue.start, f.cue.end])).toEqual([[1, 2]]);
  });
});
