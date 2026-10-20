// FIX1 F4: "Copy diagnostics". One plain-text report for a failed feature
// (stock search or download, text to speech, captions, key tests, model
// downloads): version, browser, window, the feature and step, the provider
// and its endpoint without the query, the HTTP status, timings, the error
// class and message and a cleaned stack. Saved keys, tokens and query
// strings are removed; no user media is ever included. The same report is
// written to console.debug.
import { t } from '../i18n';
import { ProviderError } from '../providers';
import { iconSvg } from './icons';

export interface DiagnosticsInput {
  /** The feature, for example "Elements › Videos" or "Auto captions". */
  feature: string;
  step?: string;
  providerId?: string;
  endpoint?: string;
  status?: number;
  /** Named durations in milliseconds. */
  timings?: Record<string, number>;
  error?: unknown;
  /** Further plain facts (model progress, worker errors, backend …). */
  extra?: Record<string, string | number | boolean | null | undefined>;
}

const KEY_PREFIX = 'aive.provider-key.';
/** Every saved key value, so the report can never carry one. */
function savedSecrets(): string[] {
  const out: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const name = localStorage.key(i);
      if (!name?.startsWith(KEY_PREFIX)) continue;
      const raw = localStorage.getItem(name);
      const value = raw ? (JSON.parse(raw) as unknown) : '';
      if (typeof value === 'string' && value.length >= 4) out.push(value);
    }
  } catch {
    /* Storage blocked: nothing saved to hide. */
  }
  return out;
}

/** Removes keys, tokens and query strings from any text. */
export function sanitize(text: string, secrets = savedSecrets()): string {
  let clean = text;
  for (const secret of secrets) clean = clean.split(secret).join('[key]');
  return clean
    .replace(/(https?:\/\/[^\s?#"')]+)\?[^\s#"')]*/g, '$1?[query removed]')
    .replace(
      /\b(authorization|api[-_]?key|key|token|access_token|xi-api-key|bearer)(["'\s:=]+)([A-Za-z0-9._~+/=-]{6,})/gi,
      '$1$2[removed]',
    );
}

const browser = () => {
  const ua = navigator.userAgent;
  const chrome = /(?:Chrome|Chromium|Edg)\/([\d.]+)/.exec(ua);
  const os = /Windows NT [\d.]+|Mac OS X [\d_]+|Android [\d.]+|Linux|CrOS/.exec(
    ua,
  );
  return `${chrome ? chrome[0] : ua.slice(0, 80)} on ${os ? os[0] : 'unknown OS'}`;
};

/** The report as plain text (already sanitised). */
export function diagnosticsText(input: DiagnosticsInput): string {
  const error = input.error;
  const provider = error instanceof ProviderError ? error : null;
  const lines = [
    'Diagnostics',
    `App: ${__APP_VERSION__} (${__GIT_COMMIT__.slice(0, 12)})`,
    `Browser: ${browser()}`,
    `Online: ${navigator.onLine ? 'yes' : 'no'}`,
    `Window: ${innerWidth} × ${innerHeight} (device pixel ratio ${devicePixelRatio})`,
    `Time: ${new Date().toISOString()}`,
    `Feature: ${input.feature}`,
  ];
  const step = input.step ?? provider?.step;
  if (step) lines.push(`Step: ${step}`);
  if (input.providerId) lines.push(`Provider: ${input.providerId}`);
  const endpoint = input.endpoint ?? provider?.endpoint;
  if (endpoint) lines.push(`Endpoint: ${endpoint}`);
  const status = input.status ?? provider?.status;
  if (status !== undefined) lines.push(`HTTP status: ${status}`);
  for (const [name, ms] of Object.entries(input.timings ?? {}))
    lines.push(`Timing ${name}: ${Math.round(ms)} ms`);
  for (const [name, value] of Object.entries(input.extra ?? {}))
    if (value !== undefined) lines.push(`${name}: ${String(value)}`);
  if (error !== undefined) {
    const name =
      error instanceof ProviderError
        ? `ProviderError ${error.code}`
        : error instanceof Error
          ? error.name
          : typeof error;
    const message = error instanceof Error ? error.message : String(error);
    lines.push(`Error: ${name}: ${message}`);
    const stack = error instanceof Error ? error.stack : undefined;
    if (stack)
      lines.push(
        'Stack:',
        ...stack
          .split('\n')
          .slice(1, 9)
          .map((line) => `  ${line.trim()}`),
      );
  }
  return sanitize(lines.join('\n'));
}

/** Copies the report (and logs it); resolves false when the clipboard is blocked. */
export async function copyDiagnostics(
  input: DiagnosticsInput,
): Promise<boolean> {
  const text = diagnosticsText(input);
  console.debug(text);
  lastDiagnostics = text;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
/** The last report copied (read by tests through the clipboard fallback). */
export let lastDiagnostics = '';

/** A "Copy diagnostics" button for an error state. */
export function diagnosticsButton(
  input: () => DiagnosticsInput,
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'button ghost sm diagnostics-button';
  button.dataset.action = 'copy-diagnostics';
  button.innerHTML = `${iconSvg('copy', 14)}<span>${t('diagnostics.copy')}</span>`;
  button.onclick = async (event) => {
    event.stopPropagation();
    const copied = await copyDiagnostics(input());
    const label = button.querySelector('span')!;
    label.textContent = t(copied ? 'diagnostics.copied' : 'diagnostics.logged');
    button.dataset.copied = String(copied);
  };
  return button;
}
