// ROUND-C2 Part 1 (RDC2-001): the dev-only spike tool and the frame tools
// the export card uses. `proof_export_card` exists only while the owner's
// `mcp.proofTools` flag is on.
import { z } from 'zod';
import type { McpToolSpec } from './index';
import type { CardHost } from './card';
import { MAX_FRAME_CHARS, MAX_FRAMES, type FrameStore } from './frames';
import { proofMedia, proofProject } from './proof';

export interface FrameCtx {
  readonly userId: string;
  readonly card: CardHost;
  readonly frames: FrameStore;
  readonly origin: string;
}

const READ = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

export const proofExportCard: McpToolSpec<FrameCtx> = {
  name: 'proof_export_card',
  title: 'Export card test',
  description:
    'Shows a test export card that renders a sample video on this device (a developer check). Use only when the user is making, editing or exporting a video with this platform and asked to test the export card. Next: watch the card; then call get_frames with video_id "proof".',
  input: {
    seconds: z.number().int().min(1).max(600),
    h264: z.boolean().optional(),
  },
  annotations: { ...READ, idempotentHint: false },
  card: true,
  async run(a, c) {
    const seconds = a.seconds as number;
    const p = proofProject(seconds, a.h264 === true);
    const { ticket } = c.card.add({
      userId: c.userId,
      videoId: 'proof',
      project: p,
      settings: {
        width: 1080,
        height: 1920,
        fps: 30,
        quality: 'high',
        start: 0,
        end: seconds,
        fileName: `proof-${seconds}s`,
      },
      credits: ["Test clips: the editor's own media fixtures."],
      media: Object.fromEntries(
        Object.values(proofMedia()).map((m) => [
          m.fingerprint,
          { mime: m.mime, file: m.file },
        ]),
      ),
      spike: true,
    });
    return {
      text: `The test card renders a ${seconds} second sample video on this device.`,
      meta: { 'aive/export': { ticket, origin: c.origin, videoId: 'proof' } },
    };
  },
};

export const submitFrames: McpToolSpec<FrameCtx> = {
  name: 'submit_frames',
  title: 'Send sample frames',
  description:
    'Stores the sample frames the export card drew on this device. Use only when the user is making, editing or exporting a video with this platform; the export card calls it, not Claude. Next: Claude calls get_frames.',
  input: {
    video_id: z.string().min(1).max(80),
    frames: z
      .array(
        z.object({
          time: z.number().min(0).max(7200),
          png: z.string().min(16).max(MAX_FRAME_CHARS),
        }),
      )
      .min(1)
      .max(MAX_FRAMES),
  },
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  appOnly: true,
  async run(a, c) {
    const frames = a.frames as { time: number; png: string }[];
    if (frames.some((f) => !/^[A-Za-z0-9+/]+=*$/.test(f.png)))
      return {
        text: 'The frames were not pictures; nothing was kept.',
        isError: true,
      };
    c.frames.put(c.userId, a.video_id as string, frames);
    return { text: `${frames.length} sample frames are ready for Claude.` };
  },
};

export const getFrames: McpToolSpec<FrameCtx> = {
  name: 'get_frames',
  title: 'Look at sample frames',
  description:
    'Returns the sample frames of a video that its export card drew, as pictures, so you can check your work. Use only when the user is making, editing or exporting a video with this platform. Next: fix what looks wrong with edit_video, or tell the person it is ready.',
  input: { video_id: z.string().min(1).max(80) },
  annotations: READ,
  async run(a, c) {
    const frames = c.frames.get(c.userId, a.video_id as string);
    if (!frames.length)
      return {
        text: 'There are no sample frames yet. They arrive when the export card has rendered the video; until then only the layout check has run.',
      };
    return {
      text: `${frames.length} sample frames, at ${frames.map((f) => `${f.time.toFixed(1)} s`).join(', ')}.`,
      images: frames.map((f) => ({ data: f.png, mimeType: 'image/png' })),
    };
  },
};
