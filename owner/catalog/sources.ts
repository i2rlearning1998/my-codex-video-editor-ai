// Phase 1 library (P1-09): where the seed content comes from (the "moves"
// list of reports/PHASE1-LIB-AUDIT.md), and the editor's FX ids for the
// publish gate's `checkPack`.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readStylePacks, type SeedSources } from './seed';
import { FONT_COMBINATIONS } from '../../library/seed/text-combinations';
import { SEED_THEMES } from '../../library/seed/themes';
import {
  SOUND_PACK,
  SOUND_RATE,
  soundSamples,
} from '../../library/seed/sound-pack';
import { encodeWav } from '../../src/audio/wav';
import * as fx from '../../src/fx';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);

export function defaultSeedSources(): SeedSources {
  const en = JSON.parse(
    readFileSync(path.join(root, 'src/i18n/locales/en.json'), 'utf8'),
  ) as Record<string, string>;
  const hi = JSON.parse(
    readFileSync(path.join(root, 'src/i18n/locales/hi.json'), 'utf8'),
  ) as Record<string, string>;
  return {
    starterPack: JSON.parse(
      readFileSync(path.join(root, 'library/seed/starter-pack-1.json'), 'utf8'),
    ) as unknown,
    extraItems: FONT_COMBINATIONS,
    themes: SEED_THEMES,
    sounds: SOUND_PACK.map((sound) => ({
      id: `sound-${sound.id}`,
      name: {
        en: en[sound.key] ?? sound.id,
        hi: hi[sound.key] ?? en[sound.key] ?? sound.id,
      },
      tags: ['sound', sound.id],
      samples: soundSamples(sound),
      rate: SOUND_RATE,
    })),
    encodeWav,
    stylePacks: readStylePacks(path.join(root, 'examples/creator-packs')),
  };
}

/** Every filter, effect, adjustment and transition id (as pack:check). */
export function fxCatalog(): string[] {
  const lists = fx as unknown as Record<string, unknown>;
  return ['filters', 'effects', 'adjustments', 'transitions'].flatMap((name) =>
    Array.isArray(lists[name]) ? (lists[name] as string[]) : [],
  );
}
