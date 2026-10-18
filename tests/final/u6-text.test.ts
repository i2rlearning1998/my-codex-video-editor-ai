import { describe, expect, it } from 'vitest';
import { fontCoverage, parseUnicodeRange } from '../../src/ui/font-picker';
import {
  cleanEngine,
  newTable,
  resizeTable,
  setCell,
  tablePlainText,
} from '../../src/ui/text-structure-model';
import { parseTextEngine, textEngineProperty } from '../../src/text-engine';

describe('FINAL2 U6 text helpers', () => {
  it('[F2-032] tables resize, keep cells and stay valid for the engine', () => {
    let table = newTable(2, 3);
    table = setCell(table, 1, 2, 'हिंदी');
    table = resizeTable(table, 3, 4);
    expect(table.rows).toHaveLength(3);
    expect(table.columnWidths).toHaveLength(4);
    expect(table.rows[1]![2]!.text).toBe('हिंदी');
    expect(tablePlainText(resizeTable(table, 2, 3)).split('\n')[1]).toBe(
      '\t\tहिंदी',
    );
    const stored = textEngineProperty(
      cleanEngine({ table, direction: undefined }),
    );
    expect(parseTextEngine(stored.value)?.table?.rows).toHaveLength(3);
  });
  it('[F2-030] coverage uses the faces’ unicode ranges', () => {
    expect(parseUnicodeRange('U+0900-097F, U+25CC, U+4??')).toEqual([
      [0x900, 0x97f],
      [0x25cc, 0x25cc],
      [0x400, 0x4ff],
    ]);
    expect(fontCoverage('नमस्ते', 'Noto Sans Devanagari')?.covered).toBe(true);
    expect(fontCoverage('नमस्ते', 'Inter')?.missing.length).toBeGreaterThan(0);
    expect(fontCoverage('Hello', 'Arial')).toBeNull();
  });
});
