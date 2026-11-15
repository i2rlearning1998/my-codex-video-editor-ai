// ROUND-C2 Part 1 (RDC2-001): the export-card spike's test video. A
// 1080 x 1920 project of the given length made of the committed media
// fixtures: a 2 s video clip repeated end to end, a tone every 3 s and a
// moving shape, so every frame is decoded, drawn and encoded like a real
// export. Dev-only (behind `mcp.proofTools`).
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const MEDIA = path.resolve('tests/fixtures/media');
export interface ProofMedia {
  readonly fingerprint: string;
  readonly file: string;
  readonly mime: string;
}
const fp = (file: string) =>
  createHash('sha256')
    .update(readFileSync(path.join(MEDIA, file)))
    .digest('hex')
    .slice(0, 32);
/** The fixtures the spike uses, by fingerprint (the card asks by key). */
export function proofMedia(): Record<string, ProofMedia> {
  const list: [string, string][] = [
    ['video_testsrc_1080p_2s_h264_aac.mp4', 'video/mp4'],
    ['video_testsrc_720p_2s_vp9_opus.webm', 'video/webm'],
    ['audio_tone_440hz_3s.wav', 'audio/wav'],
  ];
  return Object.fromEntries(
    list.map(([file, mime]) => {
      const fingerprint = fp(file);
      return [fingerprint, { fingerprint, file: path.join(MEDIA, file), mime }];
    }),
  );
}

const prop = (type: string, value: unknown, keyframes: unknown[] = []) => ({
  animated: keyframes.length > 0,
  constraints: [],
  type,
  value,
  keyframes,
});
const transform = (x: number, y: number, s: number) => ({
  position: prop('vector2', [x, y]),
  rotation: prop('number', 0),
  scale: prop('vector2', [s, s]),
  opacity: prop('number', 1),
});

/**
 * The spike project. `h264` picks the 1080p H.264 clip (a browser that
 * decodes it); otherwise the 720p VP9 clip.
 */
export function proofProject(seconds: number, h264: boolean) {
  const media = Object.values(proofMedia());
  const clip = media.find((m) =>
    h264 ? m.mime === 'video/mp4' : m.mime === 'video/webm',
  )!;
  const tone = media.find((m) => m.mime === 'audio/wav')!;
  const [vw, vh] = h264 ? [1920, 1080] : [1280, 720];
  const scale = 1080 / vw;
  const videoAsset = {
    id: `media-${clip.fingerprint.slice(0, 16)}`,
    name: path.basename(clip.file),
    type: 'video',
    source: { kind: 'local', reference: `media/${clip.fingerprint}` },
    metadata: {
      mimeType: clip.mime,
      size: 0,
      fileName: path.basename(clip.file),
      lastModified: 0,
      fingerprint: clip.fingerprint,
    },
    width: vw,
    height: vh,
    duration: 2,
  };
  const toneAsset = {
    id: `media-${tone.fingerprint.slice(0, 16)}`,
    name: 'tone.wav',
    type: 'audio',
    source: { kind: 'local', reference: `media/${tone.fingerprint}` },
    metadata: {
      mimeType: tone.mime,
      size: 0,
      fileName: 'tone.wav',
      lastModified: 0,
      fingerprint: tone.fingerprint,
    },
    duration: 3,
  };
  const layers: unknown[] = [];
  const videoClips: unknown[] = [];
  const audioClips: unknown[] = [];
  for (let t = 0, i = 0; t < seconds; t += 2, i++) {
    const d = Math.min(2, seconds - t);
    layers.push({
      id: `v${i}`,
      name: `clip ${i + 1}`,
      type: 'video',
      startTime: t,
      duration: d,
      transform: transform(0, (1920 - vh * scale) / 2, scale),
      properties: {},
      effects: [],
      masks: [],
      assetId: videoAsset.id,
      children: [],
    });
    videoClips.push({
      id: `cv${i}`,
      name: `clip ${i + 1}`,
      layerId: `v${i}`,
      assetId: videoAsset.id,
      startTime: t,
      duration: d,
      sourceIn: 0,
      sourceOut: d,
      enabled: true,
      speed: 1,
      transitionMetadata: {},
      effectMetadata: {},
      metadata: {},
    });
  }
  for (let t = 0, i = 0; t < seconds; t += 6, i++) {
    const d = Math.min(3, seconds - t);
    layers.push({
      id: `a${i}`,
      name: `tone ${i + 1}`,
      type: 'audio',
      startTime: t,
      duration: d,
      transform: transform(0, 0, 1),
      properties: {},
      effects: [],
      masks: [],
      assetId: toneAsset.id,
      children: [],
    });
    audioClips.push({
      id: `ca${i}`,
      name: `tone ${i + 1}`,
      layerId: `a${i}`,
      assetId: toneAsset.id,
      startTime: t,
      duration: d,
      sourceIn: 0,
      sourceOut: d,
      enabled: true,
      speed: 1,
      transitionMetadata: {},
      effectMetadata: {},
      metadata: {},
    });
  }
  layers.push({
    id: 'mover',
    name: 'Moving bar',
    type: 'shape',
    startTime: 0,
    duration: seconds,
    transform: {
      ...transform(90, 200, 1),
      position: prop(
        'vector2',
        [90, 200],
        [
          { time: 0, value: [90, 200] },
          { time: seconds, value: [690, 1600] },
        ],
      ),
    },
    properties: {
      width: prop('number', 300),
      height: prop('number', 120),
      fill: prop('color', '#7c5cff'),
    },
    effects: [],
    masks: [],
    children: [],
  });
  return {
    composition: {
      id: 'proof',
      name: 'Proof',
      width: 1080,
      height: 1920,
      fps: 30,
      duration: seconds,
      backgroundColor: '#101020',
      layers,
      tracks: [
        {
          id: 'video-1',
          name: 'Video 1',
          type: 'video',
          order: 0,
          enabled: true,
          locked: false,
          muted: false,
          clips: videoClips,
        },
        {
          id: 'audio-1',
          name: 'Audio 1',
          type: 'audio',
          order: 1,
          enabled: true,
          locked: false,
          muted: false,
          clips: audioClips,
        },
      ],
      markers: [],
      audioTracks: [],
    },
    assets: [videoAsset, toneAsset],
    background: '#101020',
  };
}
