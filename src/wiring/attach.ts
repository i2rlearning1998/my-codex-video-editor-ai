// P3-WIRING (W4): attach a file to a Director chat. The bytes go to the media
// store (a StorageBackend), never into the chat record. Limits and the vision
// cost come from the owner's settings (config p3). A text or PDF file is read
// to text for the model (as data, never as instructions); an image goes only
// to a model with `capabilities.vision`.
import type {
  Attachment,
  EntitlementService,
  P3Failure,
  StorageBackend,
} from '../contracts/p3';
import {
  modelsForRole,
  p3Settings,
  text as say,
  type Model,
  type PlatformConfig,
} from '../platform-config';
import type { AttachedFiles, ResolvedAttachment } from './director-service';
import { failure } from './errors';
import { pdfText } from './pdf-text';
import type { WiringStore } from './store';

export interface AttachDeps {
  readonly config: () => PlatformConfig;
  readonly userId: () => string | null;
  readonly store: WiringStore;
  /** The person's media store (the existing one, through W7's `local`). */
  readonly media: StorageBackend;
  readonly entitlements?: Pick<EntitlementService, 'check'>;
  readonly now?: () => Date;
  readonly newId?: (prefix: string) => string;
}

const TEXT_EXT = /\.(txt|md|markdown|srt|vtt|csv|json)$/i;
/** The attachment kind from the file's type and name, or null. */
export function kindOf(name: string, mime: string): Attachment['kind'] | null {
  if (mime === 'application/pdf' || /\.pdf$/i.test(name)) return 'pdf';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('text/') || TEXT_EXT.test(name)) return 'text';
  return null;
}
const mb = (n: number) => `${Math.round((n / 1048576) * 10) / 10} MB`;
const b64 = (bytes: Uint8Array) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

/** The models that can read pictures, for the one-sentence refusal. */
export function visionModelNames(c: PlatformConfig): string[] {
  return modelsForRole(c, c.director.roles.plan)
    .filter((m) => m.capabilities.vision)
    .map((m) => say(m.name));
}

export function createAttachments(d: AttachDeps): AttachedFiles {
  const now = () => (d.now ?? (() => new Date()))();
  let n = 0;
  const newId =
    d.newId ??
    ((p: string) =>
      `${p}-${now().getTime().toString(36)}-${(++n).toString(36)}`);
  const refuse = (code: string, en: string, hi?: string): P3Failure =>
    failure(code, hi ? { en, hi } : { en });

  return {
    async attach(file, chatId) {
      const c = d.config();
      const set = c.p3.attach;
      const vision = p3Settings(c).vision;
      const kind = kindOf(file.name, file.type);
      if (!kind)
        return {
          ok: false,
          failure: refuse(
            'attach-type',
            'Attach a picture, sound, video, text or PDF file.',
            'तस्वीर, आवाज़, वीडियो, टेक्स्ट या PDF फ़ाइल जोड़ें।',
          ),
        };
      if (kind === 'image' && !vision.enabled)
        return {
          ok: false,
          failure: refuse(
            'vision-off',
            'Reading pictures is switched off for now.',
            'तस्वीरें पढ़ना अभी बंद है।',
          ),
        };
      const max = set.maxBytes[kind];
      if (file.size > max)
        return {
          ok: false,
          failure: refuse(
            'attach-size',
            `This file is ${mb(file.size)}; ${kind} files can be at most ${mb(max)}.`,
          ),
        };
      const userId = d.userId();
      if (!userId)
        return {
          ok: false,
          failure: refuse('signed-out', 'Please sign in first.'),
        };
      if (d.entitlements) {
        const e = await d.entitlements.check(userId, 'attach', file.size);
        if (!e.ok) return { ok: false, failure: e.failure };
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      let text: string | undefined;
      if (kind === 'text')
        text = new TextDecoder().decode(bytes).slice(0, set.maxTextChars);
      else if (kind === 'pdf') {
        text = await pdfText(bytes, set.maxTextChars);
        if (!text.trim())
          return {
            ok: false,
            failure: refuse(
              'pdf-unreadable',
              'No text could be read from this PDF. Paste the text instead.',
              'इस PDF से टेक्स्ट नहीं पढ़ा जा सका। टेक्स्ट पेस्ट करें।',
            ),
          };
      }
      const id = newId('att');
      const path = `attachments/${chatId}/${id}`;
      try {
        await d.media.put(path, bytes, file.type || 'application/octet-stream');
      } catch (e) {
        return {
          ok: false,
          failure:
            (e as { failure?: P3Failure }).failure ??
            refuse('attach-store', 'The file could not be saved.'),
        };
      }
      const value: Attachment = {
        id,
        name: file.name.slice(0, 200),
        kind,
        bytes: file.size,
        credits: kind === 'image' ? vision.creditsPerImage : 0,
      };
      await d.store.saveAttachment({
        ...value,
        mime: file.type || 'application/octet-stream',
        chatId,
        path,
        ...(text !== undefined ? { text } : {}),
        at: now().toISOString(),
      });
      return { ok: true, value };
    },

    async resolve(ids) {
      const out: ResolvedAttachment[] = [];
      for (const id of ids) {
        const a = await d.store.attachment(id);
        if (!a) continue;
        const base: ResolvedAttachment = {
          id: a.id,
          name: a.name,
          kind: a.kind,
          bytes: a.bytes,
          // The CURRENT owner setting, not the one at attach time.
          credits:
            a.kind === 'image'
              ? p3Settings(d.config()).vision.creditsPerImage
              : 0,
          mime: a.mime,
          ...(a.text !== undefined ? { text: a.text } : {}),
        };
        if (a.kind === 'image') {
          const bytes = await d.media.get(a.path);
          if (!bytes) continue;
          out.push({ ...base, image: { mime: a.mime, base64: b64(bytes) } });
        } else out.push(base);
      }
      return out;
    },

    check(files, model: Model | null) {
      const c = d.config();
      const vision = p3Settings(c).vision;
      const images = files.filter((f) => f.kind === 'image').length;
      if (files.length > c.p3.attach.maxFilesPerMessage)
        return refuse(
          'attach-count',
          `One message can carry at most ${c.p3.attach.maxFilesPerMessage} files.`,
        );
      if (!images) return null;
      if (!vision.enabled)
        return refuse(
          'vision-off',
          'Reading pictures is switched off for now.',
          'तस्वीरें पढ़ना अभी बंद है।',
        );
      if (images > vision.maxImagesPerMessage)
        return refuse(
          'vision-count',
          `One message can carry at most ${vision.maxImagesPerMessage} pictures.`,
        );
      if (!model?.capabilities.vision) {
        const names = visionModelNames(c);
        return refuse(
          'vision-model',
          names.length
            ? `This model cannot read pictures. These can: ${names.join(', ')}.`
            : 'No model that can read pictures is switched on.',
        );
      }
      return null;
    },
  };
}
