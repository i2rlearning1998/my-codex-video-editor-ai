// ROUND-C3 Part 2: the assets step for Claude. The same slots the Director's
// asset step lists (planSlots, by the exact name the build looks for), the
// same five ways (give it, make it with the platform's Studios, a prompt to
// make it anywhere, the library, later) plus "own" (Claude or another of the
// person's tools), the Studio run through the panel's /v1/run path, and
// outside files through add_media. Nothing is forced; no way is hidden.
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Plan, PlatformConfig, Studio } from '../../src/platform-config';
import { mediaModel, safeName } from '../../src/director';
import { estimateStudio, studioUnits } from '../../src/gateway/cost';
import { modelById, modelsForRole } from '../../src/platform-config/resolve';
import { mediaFingerprint } from '../../src/media/fingerprint';
import type { McpToolSpec, ToolReply } from './index';
import type {
  ClaudeDoc,
  ClaudeProject,
  ClaudeVideo,
  MediaRecord,
  SheetEntry,
} from './records';
import type { McpCtx, McpServices } from './tools';

export const CHOICES = [
  'make',
  'upload',
  'prompt',
  'library',
  'later',
  'own',
] as const;
type Kind = 'image' | 'video' | 'audio';
export interface Slot {
  name: string;
  kind: Kind;
  /** What it is for (the scene and the query). */
  for: string;
  /** Voice-over (the narration) rather than a media layer. */
  voice: boolean;
  prompt: string;
}
interface Helpers {
  s: McpServices;
  doc(u: string): Promise<ClaudeDoc>;
  save(u: string, d: ClaudeDoc): Promise<void>;
  findVideo(
    d: ClaudeDoc,
    id: string,
  ): { pid: string; p: ClaudeProject; v: ClaudeVideo } | null;
  noVideo: ToolReply;
  note(
    c: PlatformConfig,
    text: string,
    by: SheetEntry['by'],
    at: number,
  ): SheetEntry;
  addSheet(c: PlatformConfig, v: ClaudeVideo, e: SheetEntry): void;
  desc(what: string, next: string): string;
  annotations: {
    read: McpToolSpec<McpCtx>['annotations'];
    write: McpToolSpec<McpCtx>['annotations'];
  };
}
const oops = (text: string): ToolReply => ({ text, isError: true });
const id = z.string().min(1).max(80);
const ROLE: Record<Kind, string> = {
  image: 'studio-images',
  video: 'studio-video',
  audio: 'studio-voice',
};

/** Every file the plan's layers ask for, and the narration's voice-over. */
export function slotsOf(plan: unknown): Slot[] {
  const p = (plan ?? {}) as {
    scenes?: {
      title?: string;
      narration?: string;
      layers?: {
        kind?: string;
        mediaIntent?: { query?: string; type?: string };
      }[];
    }[];
  };
  const out: Slot[] = [];
  const seen = new Set<string>();
  for (const [i, sc] of (p.scenes ?? []).entries())
    for (const l of sc.layers ?? []) {
      const q = l.mediaIntent?.query?.trim();
      const t = l.mediaIntent?.type ?? 'photo';
      if (l.kind !== 'media' || !q || ['icon', 'emoji', 'sticker'].includes(t))
        continue;
      const name = safeName(q);
      if (seen.has(name)) continue;
      seen.add(name);
      const kind: Kind =
        t === 'video' ? 'video' : t === 'audio' ? 'audio' : 'image';
      out.push({
        name,
        kind,
        for: `scene ${i + 1} "${sc.title ?? ''}": ${q}`,
        voice: false,
        prompt: `${kind === 'video' ? 'A short video clip' : kind === 'audio' ? 'A sound' : 'A picture'} of ${q}${sc.narration ? `, for the line: "${sc.narration.slice(0, 160)}"` : ''}.`,
      });
    }
  const narration = (p.scenes ?? [])
    .map((s) => s.narration ?? '')
    .join(' ')
    .trim();
  if (narration)
    out.push({
      name: 'narration',
      kind: 'audio',
      for: 'the voice-over of the whole video',
      voice: true,
      prompt: `A clear voice-over reading: "${narration.slice(0, 600)}"`,
    });
  return out;
}

/** Whether one of the person's files fills a slot (its name's words). */
export const slotFilled = (slot: Slot, rec: MediaRecord) => {
  const words = (x: string) =>
    x
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((w) => w.length > 1);
  const have = new Set(words(rec.name.replace(/\.[a-z0-9]+$/i, '')));
  const kindOk =
    slot.kind === 'image'
      ? rec.mimeType.startsWith('image/')
      : rec.mimeType.startsWith(`${slot.kind}/`);
  return kindOk && words(slot.name).every((w) => have.has(w));
};

/** The Studios that can make a kind now (enabled, a connected model). */
function studiosFor(
  c: PlatformConfig,
  plan: Plan,
  kind: Kind,
  reach: (m: string) => boolean,
  test = false,
): { studio: Studio; modelId: string }[] {
  const out: { studio: Studio; modelId: string }[] = [];
  for (const st of c.studios.filter((x) => x.enabled))
    if (
      st.role === ROLE[kind] ||
      (kind === 'audio' &&
        st.output === 'audio' &&
        st.role.startsWith('studio-'))
    ) {
      // Real, connected models only; the offline mock only in test mode.
      const m =
        mediaModel(c, plan, st.role as never, reach) ??
        (test
          ? // ROUND-C4 (5.4): any provider of the offline kind, by kind.
            modelsForRole(c, st.role).find(
              (x) =>
                c.providers.find((p) => p.id === x.providerId)?.kind === 'mock',
            )
          : undefined);
      if (m) out.push({ studio: st, modelId: m.id });
    }
  return out;
}

/** A tiny file for the offline mock models (tests; nothing paid). */
function mockFile(kind: Kind): { bytes: Uint8Array; mime: string } | null {
  if (kind === 'image')
    return {
      // A 1 x 1 PNG.
      bytes: Uint8Array.from(
        Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
          'base64',
        ),
      ),
      mime: 'image/png',
    };
  if (kind === 'audio') {
    const rate = 8000;
    const n = rate / 2;
    const b = Buffer.alloc(44 + n * 2);
    b.write('RIFF', 0);
    b.writeUInt32LE(36 + n * 2, 4);
    b.write('WAVEfmt ', 8);
    b.writeUInt32LE(16, 16);
    b.writeUInt16LE(1, 20);
    b.writeUInt16LE(1, 22);
    b.writeUInt32LE(rate, 24);
    b.writeUInt32LE(rate * 2, 28);
    b.writeUInt16LE(2, 32);
    b.writeUInt16LE(16, 34);
    b.write('data', 36);
    b.writeUInt32LE(n * 2, 40);
    return { bytes: Uint8Array.from(b), mime: 'audio/wav' };
  }
  return null;
}

export function assetTools(h: Helpers): McpToolSpec<McpCtx>[] {
  const { s, doc, save, findVideo, noVideo, note, addSheet, desc } = h;
  const A = h.annotations;
  const reach = (c: PlatformConfig) => (m: string) =>
    s.connected?.(c, m) ?? false;
  const records = async (u: string, v: ClaudeVideo) =>
    (await Promise.all(v.media.map((fp) => s.store.mediaRecord(u, fp)))).filter(
      (r): r is MediaRecord => !!r,
    );
  const storeFile = async (
    u: string,
    v: ClaudeVideo,
    bytes: Uint8Array,
    mime: string,
    name: string,
    meta: {
      provider: string;
      licence: string | null;
      attribution: string | null;
    },
  ) => {
    const fp = await mediaFingerprint(new Blob([bytes]));
    const ext = (mime.split('/')[1] ?? 'bin')
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 5);
    const rec: MediaRecord = {
      fingerprint: fp,
      name: `${
        name
          .replace(/[^\p{L}\p{N} _-]+/gu, '')
          .trim()
          .slice(0, 80) || 'file'
      }.${ext}`,
      mimeType: mime,
      size: bytes.length,
      ...meta,
    };
    await s.store.putMedia(u, rec, bytes);
    if (!v.media.includes(fp)) v.media.push(fp);
    return rec;
  };
  const slotNamed = (v: ClaudeVideo, name: string) =>
    slotsOf(v.plan).find((x) => x.name === name);
  const studioOf = (c: PlatformConfig, sid: string) =>
    c.studios.find((x) => x.id === sid && x.enabled);
  const costKey = (vid: string, slot: string, sid: string, answers: unknown) =>
    createHash('sha256')
      .update(JSON.stringify([vid, slot, sid, answers]))
      .digest('hex')
      .slice(0, 24);

  return [
    {
      name: 'get_asset_needs',
      title: 'What files the video needs',
      description: desc(
        "Lists each file the plan needs (its exact name, kind and what it is for), which of the person's files already fill it, and ALL the ways to get it: the person gives it, the platform's Studios make it (with their fields and cost), a prompt to make it anywhere, the library, or later. Tell the person every way, plus anything you or their other tools can make, and let them choose.",
        'set_asset_choice for each file.',
      ),
      input: { video_id: id },
      annotations: A.read,
      async run(a, c) {
        const d = await doc(c.userId);
        const f = findVideo(d, a.video_id as string);
        if (!f) return noVideo;
        if (!f.v.plan)
          return oops('There is no plan yet. Call submit_plan first.');
        const slots = slotsOf(f.v.plan);
        if (!slots.length)
          return {
            text: 'This plan needs no outside files: everything is made with code, text and shapes.',
          };
        const mine = await records(c.userId, f.v);
        const lines = slots.map((sl, i) => {
          const have = mine
            .filter((r) => slotFilled(sl, r))
            .map((r) => `"${r.name}"`);
          const studios = studiosFor(
            c.config,
            c.plan,
            sl.kind,
            reach(c.config),
            s.testMode?.() ?? false,
          );
          const make = studios.length
            ? studios
                .map(({ studio, modelId }) => {
                  const m = modelById(c.config, modelId)!;
                  const est = estimateStudio(c.config, studio, m, {});
                  const fields =
                    studio.inputs
                      .map((x) => `${x.id}${x.required ? ' (required)' : ''}`)
                      .join(', ') || 'prompt';
                  return `studio ${studio.id} (${studio.name.en}; fields: ${fields}; about ${Math.ceil(est.min)} to ${Math.ceil(est.max)} credits)`;
                })
                .join('; ')
            : 'no Studio can make this kind right now';
          const choice = f.v.assetChoices?.[sl.name];
          return [
            `${i + 1}. "${sl.name}" (${sl.kind}${sl.voice ? ', voice-over' : ''}), for ${sl.for}.${choice ? ` Chosen: ${choice}.` : ''}`,
            have.length
              ? `   Already filled by the person's file ${have.join(', ')}.`
              : '   Not filled yet.',
            `   Ways: (a) the person gives it: upload it in the panel's Project Media named "${sl.name}", or bring an outside file with add_media; (b) make it here: ${make}; (c) prompt to make it anywhere: "${sl.prompt}"; (d) pick it from the library (list_library); (e) later: the slot stays blank by name; (f) you or the person's other tools make it, then add_media.`,
          ].join('\n');
        });
        return {
          text: [
            `${slots.length} file${slots.length === 1 ? '' : 's'} for this video:`,
            ...lines,
          ].join('\n'),
        };
      },
    },
    {
      name: 'set_asset_choice',
      title: "Record the person's choice",
      description: desc(
        "Records how the person wants a file made: make (the platform's Studio), upload, prompt, library, later, or own (you or their other tools).",
        'get_asset_cost then make_asset for "make"; add_media for "own" or an outside file.',
      ),
      input: {
        video_id: id,
        slot: z.string().min(1).max(120),
        choice: z.enum(CHOICES),
      },
      annotations: A.write,
      async run(a, c) {
        const d = await doc(c.userId);
        const f = findVideo(d, a.video_id as string);
        if (!f) return noVideo;
        const sl = slotNamed(f.v, a.slot as string);
        if (!sl)
          return oops(
            `This video has no file named "${a.slot as string}". Call get_asset_needs for the names.`,
          );
        f.v.assetChoices = {
          ...(f.v.assetChoices ?? {}),
          [sl.name]: a.choice as string,
        };
        addSheet(
          c.config,
          f.v,
          note(
            c.config,
            `Asset "${sl.name}": ${a.choice as string}.`,
            'claude',
            s.now(),
          ),
        );
        await save(c.userId, d);
        return { text: `"${sl.name}" will be: ${a.choice as string}.` };
      },
    },
    {
      name: 'get_asset_cost',
      title: 'What making a file costs',
      description: desc(
        'Returns what one Studio run for a file costs. Tell the person before make_asset and wait for a clear yes.',
        'make_asset after the yes.',
      ),
      input: {
        video_id: id,
        slot: z.string().min(1).max(120),
        studio_id: z.string().min(1).max(60),
        answers: z
          .record(
            z.string().max(48),
            z.union([z.string().max(4000), z.number(), z.boolean()]),
          )
          .default({}),
      },
      annotations: A.read,
      async run(a, c) {
        const d = await doc(c.userId);
        const f = findVideo(d, a.video_id as string);
        if (!f) return noVideo;
        const sl = slotNamed(f.v, a.slot as string);
        if (!sl)
          return oops(`This video has no file named "${a.slot as string}".`);
        const st = studioOf(c.config, a.studio_id as string);
        const pick =
          st &&
          studiosFor(
            c.config,
            c.plan,
            sl.kind,
            reach(c.config),
            s.testMode?.() ?? false,
          ).find((x) => x.studio.id === st.id);
        if (!pick)
          return oops(
            `No Studio "${a.studio_id as string}" can make a ${sl.kind} for this person right now. Offer another way.`,
          );
        const m = modelById(c.config, pick.modelId)!;
        const est = estimateStudio(
          c.config,
          pick.studio,
          m,
          a.answers as Record<string, unknown>,
        );
        const key = costKey(
          a.video_id as string,
          sl.name,
          pick.studio.id,
          a.answers,
        );
        (
          f.v as ClaudeVideo & { assetCost?: Record<string, number> }
        ).assetCost = {
          ...((f.v as ClaudeVideo & { assetCost?: Record<string, number> })
            .assetCost ?? {}),
          [key]: Math.ceil(est.max),
        };
        await save(c.userId, d);
        return {
          text: `Making "${sl.name}" with ${pick.studio.name.en} costs up to ${Math.ceil(est.max)} credits (the person has ${s.balance(c.userId)}). Wait for a clear yes, then make_asset with the same studio and answers.`,
        };
      },
    },
    {
      name: 'make_asset',
      title: 'Make a file with a Studio',
      description: desc(
        "Runs the platform's Studio for one file, after the person said yes to the cost from get_asset_cost. The result is saved in the Video's media under the slot's name; an earlier one is kept.",
        'check_video.',
      ),
      input: {
        video_id: id,
        slot: z.string().min(1).max(120),
        studio_id: z.string().min(1).max(60),
        answers: z
          .record(
            z.string().max(48),
            z.union([z.string().max(4000), z.number(), z.boolean()]),
          )
          .default({}),
      },
      annotations: { ...A.write, openWorldHint: true },
      async run(a, c) {
        const d = await doc(c.userId);
        const f = findVideo(d, a.video_id as string);
        if (!f) return noVideo;
        const sl = slotNamed(f.v, a.slot as string);
        if (!sl)
          return oops(`This video has no file named "${a.slot as string}".`);
        const key = costKey(
          a.video_id as string,
          sl.name,
          a.studio_id as string,
          a.answers,
        );
        const shown = (
          f.v as ClaudeVideo & { assetCost?: Record<string, number> }
        ).assetCost?.[key];
        if (shown === undefined)
          return oops(
            'Call get_asset_cost with the same studio and answers, tell the person the cost, and wait for a clear yes first. Nothing was charged.',
          );
        const pick = studiosFor(
          c.config,
          c.plan,
          sl.kind,
          reach(c.config),
          s.testMode?.() ?? false,
        ).find((x) => x.studio.id === a.studio_id);
        if (!pick || !s.studioRun)
          return oops(
            `That Studio cannot run right now, so nothing was made or charged. Offer another way for "${sl.name}".`,
          );
        const answers = a.answers as Record<string, unknown>;
        const prompt = String(answers.prompt ?? answers.text ?? sl.prompt);
        let out: { result: unknown; credits: number };
        try {
          out = await s.studioRun(c.userId, {
            modelId: pick.modelId,
            role: pick.studio.role,
            ...(pick.studio.toolId ? { toolId: pick.studio.toolId } : {}),
            requires: pick.studio.requires,
            maxCredits: Math.max(1, shown),
            key: `mcp:asset:${randomUUID()}`,
            addMb: sl.kind === 'video' ? 20 : 2,
            workCredits: 0,
            request: {
              messages: [{ role: 'user', content: prompt }],
              prompt,
              units: studioUnits(pick.studio, answers).units,
            },
          });
        } catch (e) {
          return oops(
            `The Studio stopped: ${(e as Error).message} Nothing was charged.`,
          );
        }
        const media = (
          out.result as {
            media?: { url?: string; base64?: string; mime?: string };
          }
        ).media;
        let file: { bytes: Uint8Array; mime: string } | null = null;
        if (media?.base64)
          file = {
            bytes: Uint8Array.from(Buffer.from(media.base64, 'base64')),
            mime:
              media.mime ??
              `${sl.kind === 'image' ? 'image/png' : sl.kind === 'audio' ? 'audio/wav' : 'video/mp4'}`,
          };
        else if (media?.url?.startsWith('mock://')) file = mockFile(sl.kind);
        else if (media?.url && s.download)
          file = await s
            .download(media.url, 200 * 1024 * 1024)
            .then((g) => ({
              bytes: g.bytes,
              mime: g.contentType.split(';')[0]!,
            }))
            .catch(() => null);
        if (!file)
          return oops(
            `The Studio made no file for "${sl.name}". ${out.credits} credits were used.`,
          );
        // A file made before for this slot stays (nothing is removed).
        const earlier = (await records(c.userId, f.v)).some((r) =>
          slotFilled(sl, r),
        );
        const rec = await storeFile(
          c.userId,
          f.v,
          file.bytes,
          file.mime,
          sl.name,
          {
            provider: 'studio',
            licence: 'Made with the platform',
            attribution: null,
          },
        );
        f.v.assetChoices = { ...(f.v.assetChoices ?? {}), [sl.name]: 'make' };
        addSheet(
          c.config,
          f.v,
          note(
            c.config,
            `Asset made: "${rec.name}" with ${pick.studio.name.en}.`,
            'claude',
            s.now(),
          ),
        );
        await save(c.userId, d);
        return {
          text: `"${rec.name}" was made (${out.credits} credits) and saved in the video's media${earlier ? '; the earlier file for it is kept' : ''}. The person has ${s.balance(c.userId)} credits.`,
        };
      },
    },
    {
      name: 'add_media',
      title: 'Bring in an outside file',
      description: desc(
        "Brings in a file made outside the platform (by you, another platform, or another of the person's tools): as base64 (small files) or an https link the server fetches. Never charged; its source and licence go in the credits line at export.",
        'check_video.',
      ),
      input: {
        video_id: id,
        name: z.string().min(1).max(120),
        kind: z.enum(['image', 'video', 'audio']),
        data_base64: z
          .string()
          .max(16 * 1024 * 1024)
          .optional(),
        url: z.string().max(2000).optional(),
        source: z.string().min(1).max(120),
        licence: z.string().max(200).optional(),
        attribution: z.string().max(200).optional(),
      },
      annotations: { ...A.write, openWorldHint: true },
      async run(a, c) {
        const d = await doc(c.userId);
        const f = findVideo(d, a.video_id as string);
        if (!f) return noVideo;
        const kind = a.kind as Kind;
        const rules = c.config.mcp;
        let bytes: Uint8Array;
        let mime: string;
        if (a.data_base64) {
          bytes = Uint8Array.from(
            Buffer.from(a.data_base64 as string, 'base64'),
          );
          if (bytes.length > rules.addMediaMaxMb * 1024 * 1024)
            return oops(
              `That file is ${Math.ceil(bytes.length / 1024 / 1024)} MB; files sent inside the chat may be up to ${rules.addMediaMaxMb} MB. Send a link instead, or a smaller file.`,
            );
          mime = sniff(bytes) ?? '';
        } else if (a.url) {
          if (!/^https:\/\//.test(a.url as string))
            return oops('Send an https link.');
          try {
            const got = await s.download(
              a.url as string,
              rules.importMaxMb * 1024 * 1024,
            );
            bytes = got.bytes;
            mime = got.contentType.split(';')[0]!.trim();
          } catch (e) {
            return oops(
              `The file could not be fetched: ${(e as Error).message} Links may be up to ${rules.importMaxMb} MB and must be public.`,
            );
          }
        } else return oops('Send the file as data_base64 or as an https url.');
        const want = kind === 'image' ? 'image/' : `${kind}/`;
        if (!mime.startsWith(want))
          return oops(
            `That file is not a ${kind} (it reads as ${mime || 'an unknown type'}). Send a picture (PNG, JPEG, WebP), a video (MP4, WebM) or a sound (WAV, MP3, OGG) as the kind says.`,
          );
        const rec = await storeFile(
          c.userId,
          f.v,
          bytes,
          mime,
          a.name as string,
          {
            provider: (a.source as string).slice(0, 60),
            licence: (a.licence as string | undefined) ?? null,
            attribution: (a.attribution as string | undefined) ?? null,
          },
        );
        const sl = slotNamed(f.v, safeName(a.name as string));
        if (sl)
          f.v.assetChoices = {
            ...(f.v.assetChoices ?? {}),
            [sl.name]: f.v.assetChoices?.[sl.name] ?? 'own',
          };
        addSheet(
          c.config,
          f.v,
          note(
            c.config,
            `Outside file added: "${rec.name}" from ${rec.provider}.`,
            'claude',
            s.now(),
          ),
        );
        await save(c.userId, d);
        return {
          text: `"${rec.name}" is in the video's media (from ${rec.provider}; nothing was charged).${sl ? ` It fills "${sl.name}".` : ''}`,
        };
      },
    },
  ];
}

/** The type of a file from its first bytes (base64 files carry no type). */
function sniff(b: Uint8Array): string | null {
  const at = (o: number, ...xs: number[]) => xs.every((x, i) => b[o + i] === x);
  if (at(0, 0x89, 0x50, 0x4e, 0x47)) return 'image/png';
  if (at(0, 0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50))
    return 'image/webp';
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x41, 0x56, 0x45))
    return 'audio/wav';
  if (at(0, 0x1a, 0x45, 0xdf, 0xa3)) return 'video/webm';
  if (at(4, 0x66, 0x74, 0x79, 0x70)) return 'video/mp4';
  if (at(0, 0x49, 0x44, 0x33) || at(0, 0xff, 0xfb)) return 'audio/mpeg';
  if (at(0, 0x4f, 0x67, 0x67, 0x53)) return 'audio/ogg';
  if (at(0, 0x47, 0x49, 0x46, 0x38)) return 'image/gif';
  return null;
}
