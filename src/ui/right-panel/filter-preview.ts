import { clipFx, type ClipFx } from '../../core/fx';
import type { Command, EditorEngine } from '../../core';
import type { EditorSession } from '../session';
import { selectedClips } from '../editing';
import { guardCommands } from '../editor-mode';

/** J3: transient filters always start from canonical state, never the last preview. */
export function createFilterPreview(
  engine: EditorEngine,
  session: EditorSession,
  commit: (label: string, commands: Command[]) => void,
) {
  let active = false;
  const commands = (change: (fx: ClipFx) => void): Command[] =>
    selectedClips(session.source, session.selectedIds).map(({ clip }) => {
      const fx = structuredClone(
        clipFx(clip as unknown as Parameters<typeof clipFx>[0]) ?? {
          version: 1,
          stack: [],
        },
      ) as ClipFx;
      change(fx);
      return {
        type: 'SET_CLIP_FX',
        compositionId: session.source.composition.id,
        clipId: clip.id,
        fx,
      };
    });
  const cancel = () => {
    if (active) {
      active = false;
      session.setPreview(null);
    }
  };
  return {
    preview(change: (fx: ClipFx) => void) {
      const list = commands(change);
      guardCommands(session, list);
      const project = engine.preview(list);
      active = true;
      session.setPreview(project);
    },
    commit(label: string, change: (fx: ClipFx) => void) {
      const list = commands(change);
      cancel();
      commit(label, list);
    },
    cancel,
  };
}
