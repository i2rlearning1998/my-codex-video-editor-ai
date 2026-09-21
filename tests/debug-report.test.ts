import { test, expect } from 'vitest';
import { EditorEngine, createProject, createLayer } from '../src/core';
import { EditorSession } from '../src/ui/session';
import { createDebugReport } from '../src/dev/debug-report';

const env = {
  userAgent: 'Test browser',
  language: 'en',
  viewport: { width: 1440, height: 1000 },
  devicePixelRatio: 1,
};
const diagnostics = {
  getCommands: () => Array.from({ length: 40 }, (_, i) => `step-${i}`),
  getErrors: () =>
    Array.from({ length: 60 }, () => ({
      time: '2026-09-21T00:00:00Z',
      kind: 'test',
      message: 'probe',
      stack: Array(8).fill('frame') as string[],
    })),
};

test('[DEV-007] debug report has bounded diagnostics and a detached JSON project', async () => {
  const engine = new EditorEngine(createProject('Debug test'));
  const session = new EditorSession(engine);
  const report = await createDebugReport(engine, session, diagnostics, env);
  expect(report.schema).toBe('aive-debug-report/1');
  expect(Number.isNaN(Date.parse(report.createdAt))).toBe(false);
  expect(report.app.version).toBe('0.1.0');
  expect(report.app.gitCommit).toMatch(/^[a-f0-9]{40}$|^unknown$/);
  expect(report.env).toEqual(env);
  expect(report.editor.compositionId).toBe(engine.state.compositions[0]!.id);
  expect(report.project).toEqual(engine.state);
  expect(report.project).not.toBe(engine.state);
  expect(report.recentCommands).toHaveLength(30);
  expect(report.recentErrors).toHaveLength(50);
  expect(report.recentErrors[0]!.stack).toHaveLength(5);
  session.dispose();
});

test('[DEV-007] oversized project is replaced by byte size and SHA-256', async () => {
  const project = createProject('Large project');
  project.compositions[0]!.layers = Array.from({ length: 400 }, (_, i) =>
    createLayer('large-' + i, 'shape', '界'.repeat(200)),
  );
  const engine = new EditorEngine(project);
  const session = new EditorSession(engine);
  const report = await createDebugReport(engine, session, diagnostics, env);
  const bytes = new TextEncoder().encode(JSON.stringify(engine.state));
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map((n) => n.toString(16).padStart(2, '0'))
    .join('');
  expect(report.project).toEqual({
    omitted: true,
    sizeBytes: bytes.length,
    sha256: hash,
  });
  session.dispose();
});
