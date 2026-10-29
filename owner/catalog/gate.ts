// Phase 1 library (P1-07): the publish gate. Every file goes through the
// editor's own checks before it can reach the catalog: Creator Packs through
// `checkPack` and the render checks (src/ui/creator-checks.ts) in headless
// Chromium; media files are decoded there and get a poster or waveform and
// a small proxy. Without a headless browser the gate fails closed. Every
// rejection is one plain sentence.
import path from 'node:path';
import { checkPack } from '../../src/creator-pack/check';
import type { CreatorItem } from '../../src/creator-pack/schemas';
import { libraryItemSchema, type LibraryItem } from '../../src/library/schema';
import { formatProblem } from '../../src/library-client/format';
import type { RuntimeResult } from '../../src/ui/creator-checks';
import type { MediaProbe } from '../gate/harness';
import {
  libraryItemCandidate,
  mediaCandidate,
  recordVersion,
  styleCandidate,
  themeCandidate,
} from './candidates';
import type { Candidate, ItemStore } from './store';
import { readZip } from './zip';

export interface GateFile {
  readonly name: string;
  readonly bytes: Uint8Array;
}
export interface GateRejection {
  readonly file: string;
  readonly item?: string;
  /** One plain sentence. */
  readonly reason: string;
}
export interface GateResult {
  readonly candidates: Candidate[];
  readonly accepted: { file: string; item: string }[];
  readonly rejected: GateRejection[];
}
/** The headless part of the gate (a browser page with the editor's code). */
export interface GateBrowser {
  checkItems(items: CreatorItem[]): Promise<RuntimeResult[]>;
  probeMedia(bytes: Uint8Array, mime: string): Promise<MediaProbe>;
  close(): Promise<void>;
}
export interface GateOptions {
  readonly openBrowser: () => Promise<GateBrowser>;
  readonly fxCatalog: readonly string[];
  readonly knownLibraryIds: readonly string[];
  readonly license?: { name: string; credit?: string; url?: string };
}

export const NO_BROWSER =
  'The publish gate needs a headless browser for its render checks and none could be started, so nothing was published. Install one with: npx playwright install chromium (or set PLAYWRIGHT_CHROMIUM_PATH to a Chrome or Chromium program), then publish again.';
const MAX_MEDIA = 500 * 1024 * 1024;
const MEDIA_TYPES: Record<string, string> = {
  wav: 'audio/wav',
  mp3: 'audio/mpeg',
  ogg: 'audio/ogg',
  m4a: 'audio/mp4',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  mp4: 'video/mp4',
  webm: 'video/webm',
};
const DEFAULT_LICENSE = { name: "Owner's own" };

/** Pack checker messages that start with a field path read as a sentence. */
export function sentence(reason: string): string {
  const field = /^([\w.[\]]+): (.*)$/.exec(reason);
  const text = field ? `The field "${field[1]}" is wrong: ${field[2]}` : reason;
  const capital = text.charAt(0).toUpperCase() + text.slice(1);
  return /[.!?)]$/.test(capital) ? capital : `${capital}.`;
}
const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'item';

/** Unpacks zips; returns every file with its name. */
export function expandFiles(files: readonly GateFile[]): GateFile[] {
  return files.flatMap((file) =>
    file.name.toLowerCase().endsWith('.zip') ? readZip(file.bytes) : [file],
  );
}

interface MediaMeta {
  id?: string;
  name?: { en: string; hi?: string };
  tags?: string[];
  license?: { name: string; credit?: string; url?: string };
}

export async function runGate(
  input: readonly GateFile[],
  store: ItemStore,
  options: GateOptions,
): Promise<GateResult> {
  const result: GateResult = { candidates: [], accepted: [], rejected: [] };
  let files: GateFile[];
  try {
    files = expandFiles(input);
  } catch (error) {
    result.rejected.push({
      file: input.map((file) => file.name).join(', '),
      reason: error instanceof Error ? error.message : String(error),
    });
    return result;
  }
  const metas = new Map<string, MediaMeta>();
  for (const file of files)
    if (file.name.endsWith('.meta.json'))
      try {
        metas.set(
          file.name.slice(0, -'.meta.json'.length),
          JSON.parse(new TextDecoder().decode(file.bytes)) as MediaMeta,
        );
      } catch {
        result.rejected.push({
          file: file.name,
          reason: 'The details file is not valid JSON.',
        });
      }
  let browser: GateBrowser | null = null;
  const page = async () => {
    if (browser) return browser;
    try {
      browser = await options.openBrowser();
      return browser;
    } catch {
      throw new Error(NO_BROWSER);
    }
  };
  try {
    for (const file of files) {
      if (file.name.endsWith('.meta.json')) continue;
      const ext = path.extname(file.name).slice(1).toLowerCase();
      if (ext === 'json' || ext === 'txt')
        await gatePack(file, store, options, page, result);
      else if (MEDIA_TYPES[ext])
        await gateMedia(
          file,
          ext,
          metas.get(file.name),
          store,
          options,
          page,
          result,
        );
      else
        result.rejected.push({
          file: file.name,
          reason:
            'This is not a Creator Pack (.json) or a picture, sound or video file, so it cannot go into the library.',
        });
    }
  } catch (error) {
    if (error instanceof Error && error.message === NO_BROWSER) {
      result.candidates.length = 0;
      result.accepted.length = 0;
      result.rejected.push({
        file: input.map((f) => f.name).join(', '),
        reason: NO_BROWSER,
      });
    } else throw error;
  } finally {
    await (browser as GateBrowser | null)?.close();
  }
  return result;
}

/** The first reason that is a problem, not a hint (a missing Hindi name). */
const realReason = (reasons: readonly string[]) =>
  reasons.find((reason) => !reason.includes('supply a distinct Hindi name')) ??
  reasons[0];

async function gatePack(
  file: GateFile,
  store: ItemStore,
  options: GateOptions,
  page: () => Promise<GateBrowser>,
  result: GateResult,
) {
  const text = new TextDecoder().decode(file.bytes);
  const checked = checkPack(text, {
    fxCatalog: options.fxCatalog,
    knownLibraryIds: options.knownLibraryIds,
  });
  if (!checked.items.length) {
    result.rejected.push({
      file: file.name,
      reason: sentence(checked.reasons[0] ?? 'The pack could not be read.'),
    });
    return;
  }
  const passing = checked.items.filter(
    (item) => item.status !== 'rejected' && item.item,
  );
  for (const item of checked.items)
    if (item.status === 'rejected' || !item.item)
      result.rejected.push({
        file: file.name,
        item: item.id,
        reason: sentence(
          realReason(item.reasons) ?? 'The item did not pass the checks.',
        ),
      });
  if (!passing.length) return;
  // A plan (composition) is built by the editor, not rendered by a check:
  // the offline pack check above is its gate.
  const toRender = passing.filter((item) => item.item!.type !== 'composition');
  const rendered = toRender.length
    ? await (await page()).checkItems(toRender.map((item) => item.item!))
    : [];
  const runtime = passing.map((checkedItem) =>
    checkedItem.item!.type === 'composition'
      ? ({
          status: 'ok',
          reasons: ['A plan is built by the editor when it is used.'],
        } as RuntimeResult)
      : rendered[toRender.indexOf(checkedItem)]!,
  );
  const license = options.license ?? DEFAULT_LICENSE;
  passing.forEach((checkedItem, index) => {
    const item = checkedItem.item!;
    const render = runtime[index]!;
    if (render.status === 'rejected' || render.status === 'unsupported') {
      result.rejected.push({
        file: file.name,
        item: item.id,
        reason: sentence(render.reasons[0] ?? 'The render check did not pass.'),
      });
      return;
    }
    // Pack items are named `<packId>-<itemId>` in the shared library, so a
    // pack never overwrites another pack's item by accident (D-331).
    const id = `${checked.packId ?? slug(file.name)}-${item.id}`.slice(0, 64);
    const candidate = toCandidate(
      store,
      { ...item, id } as CreatorItem,
      render,
      file.name,
      license,
    );
    if (typeof candidate === 'string') {
      result.rejected.push({
        file: file.name,
        item: item.id,
        reason: candidate,
      });
      return;
    }
    result.candidates.push(candidate);
    result.accepted.push({ file: file.name, item: id });
  });
}

function toCandidate(
  store: ItemStore,
  item: CreatorItem,
  render: RuntimeResult,
  source: string,
  license: NonNullable<GateOptions['license']>,
): Candidate | string {
  const name = { en: item.name.en, hi: item.name.hi ?? item.name.en };
  switch (item.type) {
    case 'shape':
    case 'text':
    case 'background':
    case 'template': {
      const record = {
        id: item.id,
        name,
        tags: item.tags,
        type: item.type,
        data: item.data,
      } as unknown as LibraryItem;
      const problem = formatProblem(libraryItemSchema, record);
      if (problem) return `It does not fit the library format (${problem}).`;
      return libraryItemCandidate(store, record, source, license);
    }
    case 'theme':
      return themeCandidate(
        store,
        { id: item.id, name: name.en, ...(item.data as object) } as never,
        source,
        name.hi,
        license,
      );
    case 'style':
      return styleCandidate(store, item as never, source, license);
    case 'motion':
    case 'preset':
    case 'composition':
    case 'adjust':
    case 'filter':
    case 'effect':
    case 'transition': {
      const payload = {
        creator: item,
        ...(render.motionMeta ? { motionMeta: render.motionMeta } : {}),
      };
      const thumb = render.thumbnail
        ? store.putFile(
            Buffer.from(render.thumbnail.split(',')[1] ?? '', 'base64'),
            'png',
            'image/png',
          )
        : undefined;
      return {
        id: item.id,
        // The Creator Pack "transition" is the catalog's `xtransition`
        // (the library's own `transition` is a different thing).
        kind: item.type === 'transition' ? 'xtransition' : item.type,
        category: 'styles',
        name,
        tags: item.tags,
        license,
        version: {
          ...recordVersion(store, payload),
          ...(thumb ? { thumb } : {}),
          blur:
            render.thumbnail && render.thumbnail.length < 1600
              ? render.thumbnail
              : 'data:image/svg+xml;base64,' +
                Buffer.from(
                  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 9"><rect width="16" height="9" fill="#2a2440"/></svg>',
                ).toString('base64'),
          source,
        },
      };
    }
    default:
      return 'This kind of item cannot go into the shared library yet.';
  }
}

async function gateMedia(
  file: GateFile,
  ext: string,
  meta: MediaMeta | undefined,
  store: ItemStore,
  options: GateOptions,
  page: () => Promise<GateBrowser>,
  result: GateResult,
) {
  if (file.bytes.length > MAX_MEDIA) {
    result.rejected.push({
      file: file.name,
      reason: 'The file is larger than 500 MB.',
    });
    return;
  }
  const license = meta?.license ?? options.license;
  if (!license?.name) {
    result.rejected.push({
      file: file.name,
      reason:
        'The file has no licence: add a details file (name.meta.json) or pick a licence.',
    });
    return;
  }
  const mime = MEDIA_TYPES[ext]!;
  const probe = await (await page()).probeMedia(file.bytes, mime);
  if (!probe.ok || !probe.kind) {
    result.rejected.push({
      file: file.name,
      reason: probe.reason ?? 'The file could not be opened.',
    });
    return;
  }
  const id = meta?.id ?? slug(file.name);
  const from = (part?: { b64: string; ext: string; mime: string }) =>
    part
      ? {
          bytes: Buffer.from(part.b64, 'base64'),
          ext: part.ext,
          mime: part.mime,
        }
      : undefined;
  const poster = from(probe.poster);
  const proxy = from(probe.proxy);
  const blur =
    probe.blur ??
    'data:image/svg+xml;base64,' +
      Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 9"><rect width="16" height="9" fill="#1d2030"/></svg>',
      ).toString('base64');
  const name = meta?.name ?? { en: file.name };
  result.candidates.push(
    mediaCandidate(
      store,
      {
        id,
        kind: probe.kind,
        name: { en: name.en, hi: name.hi ?? name.en },
        tags: meta?.tags ?? [probe.kind],
        full: { bytes: file.bytes, ext, mime },
        ...(proxy ? { proxy } : {}),
        ...(poster ? { poster } : {}),
        blur,
        ...(probe.width ? { width: probe.width } : {}),
        ...(probe.height ? { height: probe.height } : {}),
        ...(probe.duration !== undefined ? { duration: probe.duration } : {}),
      },
      file.name,
      license,
    ),
  );
  result.accepted.push({ file: file.name, item: id });
}
