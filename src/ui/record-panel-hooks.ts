// FINAL2 U3 and U4: what the Record & create panel needs from the shell to
// put a camera or screen take and a voice-over into Media and, when asked,
// onto the timeline at the playhead. Imports use the Media panel's import
// (`importMade`); placing is one Command Bus transaction; the speech
// details go on the asset through `engine.library` (not an undo step).
import { t } from '../i18n';
import { vector2, type Command, type EditorEngine } from '../core';
import type { EditorSession } from './session';
import type { RecordedFile } from './recorder-flow';
import type { SpeechMetadata } from './voiceover';

type Asset = EditorSession['source']['assets'][number];
interface Place {
  time: number;
  point?: readonly [number, number] | null;
  trackId?: string | undefined;
  newTrack?: Command[];
}
export interface RecordPanelShell {
  importMade(file: File): Promise<string>;
  engine: EditorEngine;
  session: EditorSession;
  assetCommands(
    asset: Asset,
    place: Place,
  ): { label: string; commands: Command[]; layerId: string };
  addOnNewAudioLane(assetId: string, named?: { name?: string }): string;
}

export function recordPanelHooks(shell: RecordPanelShell) {
  const { engine, session } = shell;
  const assetOf = (id: string) => {
    const asset = session.source.assets.find((item) => item.id === id);
    if (!asset) throw new Error(t('record.importFailed'));
    return asset;
  };
  return {
    async saveVideo(files: RecordedFile[], toTimeline: boolean) {
      const ids: string[] = [];
      for (const item of files) ids.push(await shell.importMade(item.file));
      if (!toTimeline) return;
      const composition = session.source.composition;
      const { width, height } = composition;
      const time = session.currentTime;
      const commands: Command[] = [];
      let selected = '';
      files.forEach((item, index) => {
        const asset = assetOf(ids[index]!);
        if (!item.pip) {
          const built = shell.assetCommands(asset, {
            time,
            point: [width / 2, height / 2],
          });
          commands.push(...built.commands);
          selected ||= built.layerId;
          return;
        }
        // The camera of Screen and camera: on its own lane above every
        // other, scaled into the picture-in-picture corner.
        const trackId = crypto.randomUUID();
        const built = shell.assetCommands(asset, {
          time,
          trackId,
          newTrack: [
            {
              type: 'CREATE_TRACK',
              compositionId: composition.id,
              track: {
                id: trackId,
                name: t('rec.cameraLane'),
                type: 'video',
                order: composition.tracks.length + files.length,
                enabled: true,
                locked: false,
                muted: false,
                clips: [],
              },
            },
            {
              type: 'MOVE_TRACK',
              compositionId: composition.id,
              trackId,
              index: 0,
            },
          ],
        });
        for (const command of built.commands)
          if (command.type === 'CREATE_LAYER') {
            const pip = item.pip;
            const w = asset.width || width;
            const h = asset.height || height;
            const fit = Math.min(
              (pip.width * width) / w,
              (pip.height * height) / h,
            );
            command.layer.transform.scale = vector2(fit, fit);
            command.layer.transform.position = vector2(
              pip.x * width,
              pip.y * height,
            );
          }
        commands.push(...built.commands);
      });
      engine.commands.transaction('Add recording', commands);
      if (selected) session.select(selected);
    },
    async saveSpeech(file: File, speech: SpeechMetadata) {
      const id = await shell.importMade(file);
      const asset = assetOf(id);
      engine.library('Voice-over details', [
        {
          type: 'REPLACE_ASSET',
          assetId: id,
          asset: {
            ...(structuredClone(asset) as unknown as Record<string, unknown>),
            metadata: {
              ...(asset.metadata as unknown as Record<string, unknown>),
              speech,
            },
          } as never,
        },
      ]);
      return id;
    },
    addSpeech(assetId: string, name: string) {
      shell.addOnNewAudioLane(assetId, { name });
    },
  };
}
