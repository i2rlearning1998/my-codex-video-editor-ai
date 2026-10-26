// Phase 1 library brief, P1-31: the training-data record of an AI-built
// video (brief, final plan, later edits), kept locally.
import { describe, expect, it } from 'vitest';
import {
  MAX_EDITS,
  MemoryTrainingStore,
  TrainingLog,
} from '../../src/training/record';

describe('training-data record', () => {
  it('[LIB-031] keeps the copied brief, the plan and later edits for an AI-built project only, newest edits kept', async () => {
    let tick = 0;
    const clock = () =>
      new Date(Date.UTC(2026, 9, 26, 10, 0, tick++)).toISOString();
    const log = new TrainingLog(
      Promise.resolve(new MemoryTrainingStore()),
      clock,
    );
    log.noteBrief('A 30 second lesson about plants');
    await log.edit('other', 'Move', ['SET_PROPERTY']); // Not AI-built: ignored.
    await log.start('p1', { format: 'video-plan', scenes: [1] });
    await log.edit('p1', 'Move', ['SET_PROPERTY']);
    await log.edit('p1', 'Undo', []);
    const record = await log.get('p1');
    expect(record).toMatchObject({
      version: 1,
      projectId: 'p1',
      brief: 'A 30 second lesson about plants',
      plan: { format: 'video-plan', scenes: [1] },
    });
    expect(record!.edits).toEqual([
      {
        at: '2026-10-26T10:00:01.000Z',
        label: 'Move',
        commands: ['SET_PROPERTY'],
      },
      { at: '2026-10-26T10:00:02.000Z', label: 'Undo', commands: [] },
    ]);
    expect(await log.get('other')).toBeUndefined();
    // A second build keeps the edits; a reloaded log re-arms from the store.
    const store = new MemoryTrainingStore();
    const first = new TrainingLog(Promise.resolve(store), undefined, 10);
    await first.start('p2', {});
    for (let i = 0; i < 13; i++)
      await first.edit('p2', `Edit ${i}`, ['SET_PROPERTY']);
    const again = new TrainingLog(Promise.resolve(store), undefined, 10);
    expect(await again.has('p2')).toBe(true);
    await again.edit('p2', 'Last', []);
    const kept = (await again.get('p2'))!.edits;
    expect(kept).toHaveLength(10);
    expect(MAX_EDITS).toBe(5000);
    expect(kept.at(-1)!.label).toBe('Last');
    expect(kept[0]!.label).toBe('Edit 4');
  });
});
