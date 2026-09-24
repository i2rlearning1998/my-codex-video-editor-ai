import { afterEach, expect, test, vi } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import ts from 'typescript';
import en from '../src/i18n/locales/en.json';
import hi from '../src/i18n/locales/hi.json';
import {
  t,
  translate,
  setLanguage,
  preferredLanguage,
  formatNumber,
  formatDate,
  formatDuration,
} from '../src/i18n';

afterEach(() => {
  setLanguage('en');
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
test('[LOC-001] shell and standalone modules use translation keys for visible literals; catalogs have parity', () => {
  expect(Object.keys(hi).sort()).toEqual(Object.keys(en).sort());
  const files = [
    'src/ui/shell.ts',
    ...['src/i18n', 'src/commands', 'src/project'].flatMap((dir) =>
      existsSync(dir)
        ? readdirSync(dir)
            .filter((name) => name.endsWith('.ts'))
            .map((name) => `${dir}/${name}`)
        : [],
    ),
    ...['command-palette', 'shortcut-sheet', 'new-project-form', 'media-panel']
      .map((name) => `src/ui/${name}.ts`)
      .filter(existsSync),
  ];
  const violations: string[] = [];
  for (const file of files) {
    const source = ts.createSourceFile(
      file,
      readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    );
    const visit = (node: ts.Node) => {
      if (
        ts.isBinaryExpression(node) &&
        /\.(textContent|innerText|title|placeholder)$/.test(
          node.left.getText(source),
        ) &&
        ts.isStringLiteralLike(node.right) &&
        /[A-Za-z]{2}/.test(node.right.text)
      )
        violations.push(`${file}: ${node.right.text}`);
      if (
        ts.isStringLiteralLike(node) ||
        ts.isTemplateHead(node) ||
        ts.isTemplateMiddle(node) ||
        ts.isTemplateTail(node)
      ) {
        if (/>\s*[A-Za-z][A-Za-z ]{2,}</.test(node.text))
          violations.push(`${file}: HTML text`);
        if (
          /\b(?:aria-label|placeholder|title)="[A-Za-z][^"$]*"/.test(node.text)
        )
          violations.push(`${file}: HTML label`);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  expect(violations).toEqual([]);
});
test('[LOC-005] missing Hindi entries fall back to English and warn only in development', () => {
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const dictionaries = { en: { greeting: 'Hello {name}' }, hi: {} };
  expect(translate('greeting', { name: 'Ada' }, 'hi', dictionaries)).toBe(
    'Hello Ada',
  );
  expect(warning).toHaveBeenCalledOnce();
  warning.mockClear();
  vi.stubEnv('DEV', false);
  expect(translate('greeting', {}, 'hi', dictionaries)).toBe('Hello {name}');
  expect(warning).not.toHaveBeenCalled();
});
test('[LOC-006] parameters, plurals, numbers, dates and durations follow the active locale', () => {
  expect(preferredLanguage(['fr-FR', 'hi-IN'])).toBe('hi');
  expect(preferredLanguage(['fr-FR'])).toBe('en');
  for (const locale of ['en', 'hi'] as const) {
    setLanguage(locale);
    expect(formatNumber(1234567.125)).toBe(
      new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(
        1234567.125,
      ),
    );
    expect(
      formatDate(new Date('2026-09-22T12:00:00Z'), { timeZone: 'UTC' }),
    ).toBe(
      new Intl.DateTimeFormat(locale, { timeZone: 'UTC' }).format(
        new Date('2026-09-22T12:00:00Z'),
      ),
    );
    expect(formatDuration(3661.9)).toBe('01:01:01');
    expect(t('selection.one', { name: 'Ada' })).toContain('Ada');
    expect(t('selection.count', { count: 1 })).toBe(
      (locale === 'en' ? en : hi)['selection.count_one'].replace(
        '{count}',
        '1',
      ),
    );
    expect(t('selection.count', { count: 2 })).toBe(
      (locale === 'en' ? en : hi)['selection.count_other'].replace(
        '{count}',
        '2',
      ),
    );
  }
});
