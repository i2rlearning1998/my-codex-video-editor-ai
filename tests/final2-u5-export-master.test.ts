// @vitest-environment jsdom
// FINAL2 U5: the export dialog hands the project's master volume to the
// export (ExportInput.masterVolume), the same value playback uses.
import { afterEach, expect, test, vi } from 'vitest';
import type { ExportInput } from '../src/export/client';

const started: ExportInput[] = [];
vi.mock('../src/export/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/export/client')>();
  return {
    ...actual,
    probeMp4: () => Promise.resolve(false),
    missingMedia: () => Promise.resolve([]),
    startExport: (input: ExportInput) => {
      started.push(input);
      return { result: new Promise(() => undefined), cancel: () => undefined };
    },
  };
});

afterEach(() => {
  document.body.replaceChildren();
  started.length = 0;
});

async function exportWith(masterVolume?: number) {
  const { openExportDialog } = await import('../src/ui/export-dialog');
  const { createExampleProject } = await import('../src/ui/example');
  const project = createExampleProject();
  openExportDialog({
    composition: project.compositions[0] as never,
    assets: project.assets as never,
    background: '#000000',
    projectName: 'Mix',
    ...(masterVolume !== undefined ? { masterVolume } : {}),
    store: Promise.resolve(null),
    decoder: {} as never,
    renderFrame: () => Promise.resolve(new Blob()),
    toast: () => undefined,
  });
  const form = document.querySelector<HTMLFormElement>('#export-form')!;
  form.dispatchEvent(new Event('submit', { cancelable: true }));
  await vi.waitFor(() => expect(started).toHaveLength(1));
  return started[0]!;
}

test('[F2-022] the export input carries the project master volume', async () => {
  expect((await exportWith(1.5)).masterVolume).toBe(1.5);
});

test('[F2-022] without a stored master volume the export stays at unity', async () => {
  expect((await exportWith()).masterVolume).toBeUndefined();
});
