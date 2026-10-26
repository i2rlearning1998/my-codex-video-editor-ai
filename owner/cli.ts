// Phase 1 library: the owner's command line (run through owner/run.mjs).
//   library:keys            make the catalog signing key (owner/keys/)
//   library:seed            publish the first catalog from the seed content
//   library:publish <path>  gate and publish packs, media, folders or zips
//   library:rollback <n>    re-point the catalog to version n
//   library:versions        list the published versions
// Folders: LIBRARY_DATA_DIR (owner-data/), LIBRARY_CATALOG_DIR
// (catalog-out/), LIBRARY_KEYS_DIR (owner/keys/).
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { generateKeys, loadKeys, ensureKeys } from './catalog/keys';
import { seedCatalog } from './catalog/seed';
import { defaultSeedSources, fxCatalog } from './catalog/sources';
import { publish, summary } from './catalog/publish';
import { openGateBrowser } from './catalog/browser';
import { listVersions, readManifest, rollbackCatalog } from './catalog/build';
import { ItemStore } from './catalog/store';
import type { GateFile } from './catalog/gate';

export const dirs = () => ({
  dataDir: path.resolve(process.env.LIBRARY_DATA_DIR ?? 'owner-data'),
  outDir: path.resolve(process.env.LIBRARY_CATALOG_DIR ?? 'catalog-out'),
  keysDir: path.resolve(process.env.LIBRARY_KEYS_DIR ?? 'owner/keys'),
});

function readInputs(paths: readonly string[]): GateFile[] {
  return paths.flatMap((input): GateFile[] => {
    const full = path.resolve(input);
    if (!existsSync(full)) throw new Error(`${input} does not exist.`);
    if (statSync(full).isDirectory())
      return readdirSync(full)
        .sort()
        .filter((name) => statSync(path.join(full, name)).isFile())
        .map((name) => ({ name, bytes: readFileSync(path.join(full, name)) }));
    return [{ name: path.basename(full), bytes: readFileSync(full) }];
  });
}
const flag = (args: string[], name: string) => {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  args.splice(index, 2);
  return value;
};

export async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;
  const { dataDir, outDir, keysDir } = dirs();
  const say = (line: string) => console.log(line);
  switch (command) {
    case 'keys': {
      const keys = generateKeys(keysDir, rest.includes('--force'));
      say(`A new signing key is in ${keysDir} (key id ${keys.keyId}).`);
      say('The private key never leaves that folder; it is ignored by git.');
      return 0;
    }
    case 'seed': {
      const keys = ensureKeys(keysDir);
      const result = seedCatalog(defaultSeedSources(), {
        dataDir,
        outDir,
        keys,
      });
      say(
        `Seed: ${result.added} added, ${result.updated} updated, ${result.unchanged} unchanged. ` +
          (result.changed
            ? `Catalog version ${result.catalogVersion} is in ${outDir}.`
            : 'The catalog did not change.'),
      );
      return 0;
    }
    case 'publish': {
      const license = flag(rest, '--license');
      const credit = flag(rest, '--credit');
      if (!rest.length) {
        say(
          'Usage: npm run library:publish -- <pack.json | folder | file.zip ...> [--license name] [--credit text]',
        );
        return 2;
      }
      const keys = loadKeys(keysDir);
      const store = new ItemStore(dataDir);
      const result = await publish(readInputs(rest), {
        dataDir,
        outDir,
        keys,
        openBrowser: openGateBrowser,
        fxCatalog: fxCatalog(),
        knownLibraryIds: store.data.items.map((item) => item.id),
        ...(license
          ? { license: { name: license, ...(credit ? { credit } : {}) } }
          : {}),
      });
      summary(result).forEach(say);
      return result.gate.rejected.length && !result.gate.accepted.length
        ? 1
        : 0;
    }
    case 'rollback': {
      const to = Number(rest[0]);
      if (!Number.isInteger(to) || to < 1) {
        say('Usage: npm run library:rollback -- <version>');
        return 2;
      }
      const result = rollbackCatalog(
        new ItemStore(dataDir),
        outDir,
        loadKeys(keysDir),
        to,
      );
      say(
        result.changed
          ? `Catalog version ${result.catalogVersion} now lists what version ${to} listed.`
          : `The catalog already lists what version ${to} listed.`,
      );
      return 0;
    }
    case 'versions': {
      const current = existsSync(path.join(outDir, 'manifest.json'))
        ? readManifest(outDir).manifest.catalogVersion
        : null;
      for (const version of listVersions(outDir)) {
        const { manifest } = readManifest(outDir, `versions/${version}.json`);
        say(
          `${version}${version === current ? ' (live)' : ''}  ${manifest.generatedAt}` +
            (manifest.rolledBackTo
              ? `  rollback to ${manifest.rolledBackTo}`
              : ''),
        );
      }
      return 0;
    }
    default:
      say('Commands: keys, seed, publish, rollback, versions');
      return 2;
  }
}
