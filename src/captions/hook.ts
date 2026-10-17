// CAP (D-270): the captions hook of the composition adapter
// (docs/COMPOSITION-ADAPTER.md). The adapter's hook is synchronous, so the
// speech is transcribed first (`createCaptionsHook({stt, media})` returns a
// promise of the hook) and the hook only places cues: each cue goes to the
// scene it starts in, in that scene's time, cut at the scene's end.
import type { CaptionsHook } from '../composition/build';
import type { Command, Project } from '../core';
import type { CaptionCue } from '../speech/captions';
import { captionCommands } from './layers';
import {
  autoCaption,
  type AutoCaptionOptions,
  type CaptionMedia,
  type CaptionTrack,
} from './track';
import {
  captionStyle,
  type CaptionPosition,
  type CaptionStyle,
  type CaptionStyleId,
} from './styles';

interface HookLook {
  readonly style?: CaptionStyleId | CaptionStyle;
  readonly position?: CaptionPosition;
  readonly language?: string;
}
export type CaptionsHookOptions =
  | (HookLook & { readonly track: CaptionTrack })
  | (HookLook & { readonly cues: readonly CaptionCue[] });
export type CaptionsHookFromSpeech = Omit<AutoCaptionOptions, 'stt'> & {
  readonly stt: AutoCaptionOptions['stt'];
  /** The voice-over (or any narration) to transcribe. */
  readonly media: CaptionMedia;
};

function idsOf(project: Project): Set<string> {
  const ids = new Set<string>([project.id]);
  project.assets.forEach((asset) => ids.add(asset.id));
  for (const composition of project.compositions) {
    ids.add(composition.id);
    composition.markers.forEach((marker) => ids.add(marker.id));
    composition.tracks.forEach((track) => {
      ids.add(track.id);
      track.clips.forEach((clip) => ids.add(clip.id));
    });
    const visit = (layers: Project['compositions'][number]['layers']) =>
      layers.forEach((layer) => {
        ids.add(layer.id);
        visit(layer.children);
      });
    visit(composition.layers);
  }
  return ids;
}

function hookFor(track: CaptionTrack): CaptionsHook {
  return (context) => {
    const project = context.project as unknown as Project;
    const used = idsOf(project);
    const commands: Command[] = [];
    context.scenes.forEach((scene, index) => {
      const composition = project.compositions.find(
        (c) => c.id === scene.compositionId,
      );
      if (!composition) return;
      commands.push(
        ...captionCommands(track, {
          compositionId: composition.id,
          width: composition.width,
          height: composition.height,
          offset: scene.start,
          end: scene.duration,
          idPrefix: `captions-${index + 1}`,
          usedIds: used,
        }).commands,
      );
    });
    return commands;
  };
}

/**
 * A captions hook for `buildProjectFromComposition`: from cues or a caption
 * track it is returned directly; from an STT provider and media it
 * transcribes first and resolves to the hook.
 */
export function createCaptionsHook(options: CaptionsHookOptions): CaptionsHook;
export function createCaptionsHook(
  options: CaptionsHookFromSpeech,
): Promise<CaptionsHook>;
export function createCaptionsHook(
  options: CaptionsHookOptions | CaptionsHookFromSpeech,
): CaptionsHook | Promise<CaptionsHook> {
  if ('stt' in options) {
    const { media, ...rest } = options;
    return autoCaption(media, rest).then(hookFor);
  }
  if ('track' in options) {
    const style = options.style
      ? captionStyle(options.style, options.position)
      : captionStyle(options.track.style, options.position);
    return hookFor({
      ...options.track,
      style,
      language: options.language ?? options.track.language,
    });
  }
  return hookFor({
    version: 1,
    language: options.language ?? 'und',
    style: captionStyle(options.style, options.position),
    cues: options.cues,
  });
}
