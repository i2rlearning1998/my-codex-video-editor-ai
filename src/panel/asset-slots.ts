// P4: the files a plan expects, by the exact name its composition looks for.
// Director's asset step lists them; the editor lists the empty ones.
import {
  mediaModel,
  methodOf,
  safeName,
  withSource,
  type Plan,
  type PlatformConfig,
} from './slot-deps';
import type { VideoPlan } from '../video-plan';
import type { AssetSlot, SlotKind } from '../project/workspace';

const kindOf = (type: string): SlotKind =>
  type === 'video' ? 'video' : type === 'audio' ? 'audio' : 'image';

/** Whether a slot can be made by AI now (a model of that kind is connected). */
export function aiPossible(
  c: PlatformConfig,
  plan: Plan,
  slot: Pick<AssetSlot, 'kind'>,
  reach: (id: string) => boolean,
): boolean {
  const role =
    slot.kind === 'image'
      ? 'studio-images'
      : slot.kind === 'video'
        ? 'studio-video'
        : 'studio-voice';
  return !!mediaModel(c, plan, role, reach);
}

/** Every media file the plan expects (and the narration when it has one). */
export function planSlots(video: VideoPlan, voice: boolean): AssetSlot[] {
  const out: AssetSlot[] = [];
  const seen = new Set<string>();
  video.scenes.forEach((s, i) => {
    for (const l of s.layers) {
      if (l.kind !== 'media' || !l.mediaIntent) continue;
      const type = l.mediaIntent.type;
      if (type === 'icon' || type === 'emoji') continue;
      const name = safeName(l.mediaIntent.query);
      if (seen.has(name)) continue;
      seen.add(name);
      const m = methodOf(s);
      out.push({
        name,
        sceneId: s.id,
        ai: m === 'ai-image' || m === 'ai-video',
        kind: kindOf(type),
        mode: m === 'ai-image' || m === 'ai-video' ? 'ai' : 'upload',
        prompt: `${l.mediaIntent.query}. ${s.narration ?? s.title ?? ''}`
          .trim()
          .slice(0, 600),
        filled: false,
      });
      void i;
    }
  });
  if (voice || video.narrationTrack)
    out.push({
      name: 'narration',
      ai: true,
      kind: 'audio',
      mode: voice ? 'ai' : 'upload',
      prompt: video.scenes
        .map((s) => s.narration?.trim() ?? '')
        .filter(Boolean)
        .join('\n\n')
        .slice(0, 3000),
      filled: false,
    });
  return out;
}

/**
 * The plan the build runs: a scene whose picture the person brings (or takes
 * from prompts) is marked "mine", so nothing is made for it and the editor
 * shows the frame empty with its file name.
 */
export function applyModes(
  video: VideoPlan,
  slots: readonly AssetSlot[],
): VideoPlan {
  const own = new Set(
    slots.filter((s) => s.mode !== 'ai' && s.sceneId).map((s) => s.sceneId!),
  );
  const narration = slots.find((s) => s.name === 'narration');
  const scenes = video.scenes.map((s) =>
    own.has(s.id) ? withSource(s, 'mine') : s,
  );
  return {
    ...video,
    scenes,
    ...(narration && narration.mode !== 'ai'
      ? { narrationTrack: { query: 'narration', volume: 1, start: 0 } }
      : {}),
  };
}
