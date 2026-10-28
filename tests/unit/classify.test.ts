import { describe, expect, it } from 'vitest';
import { classifyApp, isCodingCategory, languageFromExtension } from '../../src/main/tracking/classify';

describe('classifyApp', () => {
  it('classifies known development tools', () => {
    expect(classifyApp('Code.exe', 'Visual Studio Code').category).toBe('development');
    expect(classifyApp('devenv.exe', 'Microsoft Visual Studio').category).toBe('development');
    expect(classifyApp('WindowsTerminal.exe', 'Windows Terminal').category).toBe('development');
    expect(classifyApp('powershell.exe', 'Windows PowerShell').category).toBe('development');
  });

  it('classifies browsers and communication apps', () => {
    expect(classifyApp('chrome.exe', 'Google Chrome').category).toBe('browser');
    expect(classifyApp('msedge.exe', 'Microsoft Edge').category).toBe('browser');
    expect(classifyApp('slack.exe', 'Slack').category).toBe('communication');
  });

  it('leaves unknown applications uncategorized', () => {
    const result = classifyApp('some-obscure-tool.exe', 'Some Obscure Tool');
    expect(result.category).toBe('uncategorized');
    expect(result.classification).toBe('neutral');
  });

  it('prefers user rules over built-in rules', () => {
    const result = classifyApp('chrome.exe', 'Google Chrome', [
      { match: 'chrome', category: 'entertainment', classification: 'distracting' },
    ]);
    expect(result.category).toBe('entertainment');
    expect(result.classification).toBe('distracting');
  });

  it('matches user rules against the application name too', () => {
    const result = classifyApp('unknown.exe', 'Figma', [
      { match: 'figma', category: 'productivity', classification: 'productive' },
    ]);
    expect(result.category).toBe('productivity');
  });

  it('isCodingCategory only matches development', () => {
    expect(isCodingCategory('development')).toBe(true);
    expect(isCodingCategory('browser')).toBe(false);
  });
});

describe('languageFromExtension', () => {
  it('maps common extensions', () => {
    expect(languageFromExtension('.ts')).toBe('TypeScript');
    expect(languageFromExtension('.py')).toBe('Python');
    expect(languageFromExtension('.rs')).toBe('Rust');
  });

  it('is case-insensitive and returns null for unknown extensions', () => {
    expect(languageFromExtension('.TS')).toBe('TypeScript');
    expect(languageFromExtension('.xyz')).toBeNull();
  });
});
