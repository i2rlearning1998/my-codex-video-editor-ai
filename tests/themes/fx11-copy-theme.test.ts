import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { EditorEngine, deserializeProject } from '../../src/core';
import { MemoryMediaStore } from '../../src/media/store';
import { createThemeLibrary } from '../../src/themes/library';

describe('[FX11-002] copying a saved theme', () => {
  it('makes a new theme with its own id and a free name; the original stays', async () => {
    const engine = new EditorEngine(
      deserializeProject(
        readFileSync('tests/fixtures/projects/h1-rotated.json', 'utf8'),
      ),
    );
    const library = createThemeLibrary(new MemoryMediaStore());
    const saved = await library.saveTheme('Studio blue', engine.state);
    const first = await library.copyTheme(saved.id);
    const second = await library.copyTheme(saved.id);
    expect(first.id).not.toBe(saved.id);
    expect(first.name).toBe('Studio blue (2)');
    expect(second.name).toBe('Studio blue (3)');
    expect(first.palette).toEqual(saved.palette);
    const names = (await library.listThemes()).map((theme) => theme.name);
    expect(names).toContain('Studio blue');
    await expect(library.copyTheme('nope')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});
