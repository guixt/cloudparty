// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { AiPanel } from './AiPanel';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('AiPanel', () => {
  it('zeigt Modellausgabe nur als Text', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    let source = '';
    await act(async () => {
      root.render(
        createElement(AiPanel, {
          entityName: 'X', otherNames: [], getSource: () => source, setSource: (s) => (source = s),
          getLogLines: () => [{ ts: 0, level: 'error' as const, message: 'boom' }], getStatus: () => undefined,
          hasKey: true,
          ask: async () => ({ text: '<img src=x onerror=alert(1)>', inputTokens: 0, outputTokens: 0 }),
        }),
      );
    });
    await act(async () => {
      (host.querySelector('[data-testid=ai-explain]') as HTMLButtonElement).click();
    });
    await act(async () => {});
    expect(host.querySelector('img')).toBeNull();
    expect(host.querySelector('[data-testid=ai-explanation]')?.textContent).toContain('<img src=x onerror=alert(1)>');
    act(() => root.unmount());
  });
  it('zeigt Hinweis ohne Key', async () => {
    const host = document.createElement('div');
    const root = createRoot(host);
    await act(async () => {
      root.render(createElement(AiPanel, { entityName: 'X', otherNames: [], getSource: () => '', setSource: () => {}, getLogLines: () => [], getStatus: () => undefined, hasKey: false }));
    });
    expect(host.textContent).toContain('KI-Key in den KI-Einstellungen eintragen');
    expect((host.querySelector('[data-testid=ai-generate]') as HTMLButtonElement).disabled).toBe(true);
    act(() => root.unmount());
  });
});
