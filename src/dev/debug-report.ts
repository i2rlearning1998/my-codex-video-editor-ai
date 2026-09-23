import type { EditorEngine } from '../core';
import type { EditorSession } from '../ui/session';

export interface DiagnosticError {
  time: string;
  kind: string;
  message: string;
  stack: string[];
}
export function observeDiagnostics(
  engine: EditorEngine,
  host: Window = window,
) {
  const commands: string[] = [];
  const errors: DiagnosticError[] = [];
  const recordError = (kind: string, value: unknown) => {
    const error = value instanceof Error ? value : undefined;
    errors.push({
      time: new Date().toISOString(),
      kind,
      message: error?.message ?? String(value),
      stack: error?.stack?.split('\n').slice(0, 5) ?? [],
    });
    if (errors.length > 50) errors.shift();
  };
  const recordCommand = (label: string) => {
    commands.push(label);
    if (commands.length > 30) commands.shift();
  };
  const unsubscribe = [
    engine.on('transaction:committed', ({ label }) => recordCommand(label)),
    engine.on('state:changed', ({ reason }) => {
      if (reason !== 'command' && reason !== 'transaction')
        recordCommand(reason);
    }),
    engine.on('command:failed', ({ error }) => recordError('command', error)),
  ];
  const onError = (event: ErrorEvent) =>
    recordError('pageerror', event.error ?? event.message);
  const onRejection = (event: PromiseRejectionEvent) =>
    recordError('unhandledrejection', event.reason);
  const originalError = console.error;
  const consoleError = (...args: unknown[]) => {
    recordError(
      'console',
      args.find((arg) => arg instanceof Error) ?? args.map(String).join(' '),
    );
    originalError.apply(console, args);
  };
  console.error = consoleError;
  host.addEventListener('error', onError);
  host.addEventListener('unhandledrejection', onRejection);
  return {
    getCommands: () => [...commands],
    getErrors: () =>
      errors.map((error) => ({ ...error, stack: [...error.stack] })),
    dispose: () => {
      unsubscribe.forEach((off) => off());
      host.removeEventListener('error', onError);
      host.removeEventListener('unhandledrejection', onRejection);
      if (console.error === consoleError) console.error = originalError;
    },
  };
}
type Diagnostics = Pick<
  ReturnType<typeof observeDiagnostics>,
  'getCommands' | 'getErrors'
>;

export async function createDebugReport(
  engine: EditorEngine,
  session: EditorSession,
  diagnostics: Diagnostics,
  env: {
    userAgent: string;
    language: string;
    viewport: { width: number; height: number };
    devicePixelRatio: number;
  },
  app = { version: __APP_VERSION__, gitCommit: __GIT_COMMIT__ },
) {
  const text = JSON.stringify(engine.state);
  const bytes = new TextEncoder().encode(text);
  const report = {
    schema: 'aive-debug-report/1',
    createdAt: new Date().toISOString(),
    app,
    env,
    editor: {
      compositionId: session.source.composition.id,
      selectedIds: [...session.selectedIds],
      time: session.currentTime,
      playing: session.playing,
      canvasZoom: session.canvasZoom,
      timelinePxPerSecond: session.timelineZoom,
      soloTrackIds: [...session.soloTrackIds],
    },
    recentCommands: diagnostics.getCommands().slice(-30),
    recentErrors: diagnostics
      .getErrors()
      .slice(-50)
      .map((error) => ({ ...error, stack: error.stack.slice(0, 5) })),
    project: JSON.parse(text) as unknown,
  };
  if (bytes.byteLength > 200_000) {
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    report.project = {
      omitted: true,
      sizeBytes: bytes.byteLength,
      sha256: [...new Uint8Array(digest)]
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join(''),
    };
  }
  return report;
}

export function installDebugReport(
  engine: EditorEngine,
  session: EditorSession,
  diagnostics: Diagnostics,
  statusbar: Element,
  message: (text: string) => void,
) {
  const button = document.createElement('button');
  button.textContent = 'Copy debug report';
  button.title = 'Copy debug report (Ctrl+Shift+D)';
  statusbar.append(button);
  const copy = async () => {
    try {
      const report = await createDebugReport(engine, session, diagnostics, {
        userAgent: navigator.userAgent,
        language: navigator.language,
        viewport: { width: innerWidth, height: innerHeight },
        devicePixelRatio,
      });
      const text = JSON.stringify(report, null, 2);
      try {
        await navigator.clipboard.writeText(text);
        message('Debug report copied.');
      } catch {
        const url = URL.createObjectURL(
          new Blob([text], { type: 'application/json' }),
        );
        const link = document.createElement('a');
        link.href = url;
        link.download = 'aive-debug-report.json';
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        message('Clipboard unavailable. Debug report downloaded.');
      }
    } catch (error) {
      message(`Debug report failed: ${String(error)}`);
    }
  };
  button.onclick = () => {
    void copy();
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'd') {
      event.preventDefault();
      event.stopImmediatePropagation();
      void copy();
    }
  };
  window.addEventListener('keydown', onKey, true);
  return () => {
    window.removeEventListener('keydown', onKey, true);
    button.remove();
  };
}
