// ROUND-B: the quick strip above the stage (Look, Voice, Music, Captions,
// Format). Each choice becomes a Director PROPOSAL: commands that are
// previewed on the canvas and applied only on Apply, never a silent rewrite.
// These builders only read the project and return commands. Pure.
import type {
  Composition,
  DeepReadonly,
  EditorCommand,
  Project,
  Track,
} from '../core';
import { readAudioSettings } from '../audio/settings';
import { CAPTION_STYLES, type CaptionStyleId } from '../captions/styles';
import { eachLayer } from './canvas-read';

type P = DeepReadonly<Project>;
type Scene = DeepReadonly<Composition>;
type T = DeepReadonly<Track>;

export interface Offer {
  readonly commands: EditorCommand[];
  readonly layerIds: string[];
}
const MUSIC = /music|song|bgm|संगीत|म्यूज़िक/i;
const VOICE = /narration|voice|speech|tts|आवाज़|नैरेशन/i;

function audioTracks(
  project: P,
  role: 'music' | 'speech',
): { scene: Scene; track: T }[] {
  const out: { scene: Scene; track: T }[] = [];
  for (const scene of project.compositions)
    for (const track of scene.tracks) {
      if (track.type !== 'audio' || !track.clips.length) continue;
      const hit = track.clips.some((clip) => {
        const set = readAudioSettings(clip).role;
        if (set === role) return true;
        if (set !== 'none') return false;
        return (role === 'music' ? MUSIC : VOICE).test(clip.name);
      });
      if (hit) out.push({ scene, track });
    }
  return out;
}
/** null: the video has none; else whether any of it sounds now. */
export function soundState(
  project: P,
  role: 'music' | 'speech',
): boolean | null {
  const list = audioTracks(project, role);
  return list.length ? list.some((x) => !x.track.muted) : null;
}
export function soundToggle(
  project: P,
  role: 'music' | 'speech',
  on: boolean,
): Offer {
  return {
    layerIds: [],
    commands: audioTracks(project, role)
      .filter((x) => x.track.muted === on)
      .map(
        ({ scene, track }) =>
          ({
            type: 'SET_TRACK_STATE',
            compositionId: scene.id,
            trackId: track.id,
            enabled: track.enabled,
            locked: track.locked,
            muted: !on,
          }) as EditorCommand,
      ),
  };
}
export const VOLUMES = { low: -14, medium: -7, full: 0 } as const;
export function musicVolume(project: P, level: keyof typeof VOLUMES): Offer {
  const commands: EditorCommand[] = [];
  for (const { scene, track } of audioTracks(project, 'music'))
    for (const clip of track.clips) {
      const now = readAudioSettings(clip);
      if (now.gainDb === VOLUMES[level]) continue;
      commands.push({
        type: 'plugin:audio:SET',
        input: {
          compositionId: scene.id,
          clipId: clip.id,
          settings: { ...now, gainDb: VOLUMES[level] },
        },
      } as unknown as EditorCommand);
    }
  return { commands, layerIds: [] };
}

interface CaptionHit {
  scene: Scene;
  /** The top-level layer whose clip shows the caption. */
  rootId: string;
  textId: string;
}
function captions(project: P): CaptionHit[] {
  const out: CaptionHit[] = [];
  for (const scene of project.compositions)
    for (const root of scene.layers)
      eachLayer([root], (layer) => {
        if (layer.properties.captionCue)
          out.push({ scene, rootId: root.id, textId: layer.id });
      });
  return out;
}
const clipOf = (scene: Scene, layerId: string) => {
  for (const track of scene.tracks)
    for (const clip of track.clips) if (clip.layerId === layerId) return clip;
  return null;
};
export function captionState(project: P): boolean | null {
  const list = captions(project);
  return list.length
    ? list.some((c) => clipOf(c.scene, c.rootId)?.enabled !== false)
    : null;
}
export function captionToggle(project: P, on: boolean): Offer {
  const commands: EditorCommand[] = [];
  const layerIds: string[] = [];
  const seen = new Set<string>();
  for (const c of captions(project)) {
    const clip = clipOf(c.scene, c.rootId);
    if (!clip || clip.enabled === on || seen.has(clip.id)) continue;
    seen.add(clip.id);
    layerIds.push(c.rootId);
    commands.push({
      type: 'SET_CLIP_ENABLED',
      compositionId: c.scene.id,
      clipId: clip.id,
      enabled: on,
    });
  }
  return { commands, layerIds };
}
export const CAPTION_STYLE_LIST = Object.values(CAPTION_STYLES).map((s) => ({
  id: s.id as CaptionStyleId,
  name: s.name,
}));
const plain = (
  type: 'string' | 'color' | 'number',
  value: string | number,
) => ({ type, value, animated: false, keyframes: [], constraints: [] });
export function captionRestyle(project: P, styleId: CaptionStyleId): Offer {
  const style = CAPTION_STYLES[styleId];
  const commands: EditorCommand[] = [];
  const layerIds: string[] = [];
  for (const c of captions(project)) {
    layerIds.push(c.textId);
    const set = (
      key: string,
      type: 'string' | 'color' | 'number',
      value: string | number,
    ) =>
      commands.push({
        type: 'SET_PROPERTY',
        compositionId: c.scene.id,
        layerId: c.textId,
        target: { kind: 'property', key },
        property: plain(type, value),
      } as EditorCommand);
    set('fill', 'color', style.color);
    set('fontWeight', 'number', style.fontWeight);
    set('fontFamily', 'string', style.fontFamily);
    set('textCase', 'string', style.textCase === 'upper' ? 'upper' : 'none');
  }
  return { commands, layerIds };
}

export const FORMATS: Record<string, readonly [number, number]> = {
  '16:9': [1920, 1080],
  '9:16': [1080, 1920],
  '1:1': [1080, 1080],
  '4:5': [1080, 1350],
};
export function currentFormat(project: P, sceneId: string): string | null {
  const scene =
    project.compositions.find((s) => s.id === sceneId) ??
    project.compositions[0];
  if (!scene) return null;
  for (const [name, [w, h]] of Object.entries(FORMATS))
    if (Math.abs(scene.width / scene.height - w / h) < 0.01) return name;
  return null;
}
/** Every scene gets the new size; each scene's top-level layers are scaled to fit and centred. */
export function formatChange(project: P, format: string): Offer {
  const size = FORMATS[format];
  if (!size) return { commands: [], layerIds: [] };
  const [width, height] = size;
  const commands: EditorCommand[] = [];
  for (const scene of project.compositions) {
    if (scene.width === width && scene.height === height) continue;
    commands.push({
      type: 'SET_COMPOSITION_SIZE',
      compositionId: scene.id,
      width,
      height,
    });
    const k = Math.min(width / scene.width, height / scene.height);
    const dx = (width - scene.width * k) / 2;
    const dy = (height - scene.height * k) / 2;
    for (const layer of scene.layers) {
      const pos = layer.transform.position;
      const scale = layer.transform.scale;
      if (pos.animated || scale.animated) continue;
      const [x, y] = pos.value as readonly [number, number];
      const [sx, sy] = scale.value as readonly [number, number];
      const put = (key: 'position' | 'scale', value: [number, number]) =>
        commands.push({
          type: 'SET_PROPERTY',
          compositionId: scene.id,
          layerId: layer.id,
          target: { kind: 'transform', key },
          property: {
            ...(JSON.parse(JSON.stringify(layer.transform[key])) as object),
            value,
          },
        } as EditorCommand);
      put('scale', [sx * k, sy * k]);
      put('position', [x * k + dx, y * k + dy]);
    }
  }
  return { commands, layerIds: [] };
}
