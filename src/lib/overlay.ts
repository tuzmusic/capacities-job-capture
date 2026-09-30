import type { SaveResult } from './saveJob.ts';

export type OverlayState = { status: 'saving' } | SaveResult;
export const OVERLAY_ID = 'capacities-job-capture-overlay';

/**
 * Shows the save status in the page's top-right corner. Stays until dismissed and never takes focus, so it's
 * still there when you come back to the tab.
 *
 * Injected with chrome.scripting.executeScript({ func: showOverlay }), which serializes the function source:
 * everything it uses must be defined inside it.
 */
export function showOverlay(state: OverlayState): void {
  const id = 'capacities-job-capture-overlay';
  document.getElementById(id)?.remove();

  const host = document.createElement('div');
  host.id = id;
  const root = host.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = `
    :host { all: initial; }
    .card {
      position: fixed; top: 16px; right: 16px; z-index: 2147483647;
      width: min(340px, calc(100vw - 32px)); box-sizing: border-box;
      display: flex; gap: 10px; align-items: flex-start;
      padding: 12px 12px 12px 14px; border-radius: 10px; border-left: 4px solid var(--accent);
      background: #fff; color: #1d1d1f; box-shadow: 0 6px 24px rgba(0,0,0,.18);
      font: 14px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .saving { --accent: #8e8e93; }
    .saved { --accent: #2e9d5b; }
    .error { --accent: #d93a3a; }
    .body { flex: 1; min-width: 0; }
    .heading { font-weight: 600; }
    .detail { margin-top: 2px; overflow-wrap: anywhere; color: #555; }
    button {
      all: unset; cursor: pointer; padding: 0 4px; font-size: 18px; line-height: 1; color: #888;
    }
    button:hover { color: #1d1d1f; }
    @media (prefers-color-scheme: dark) {
      .card { background: #2c2c2e; color: #f2f2f7; box-shadow: 0 6px 24px rgba(0,0,0,.5); }
      .detail { color: #aeaeb2; }
      button:hover { color: #f2f2f7; }
    }
  `;

  const [heading, detail] =
    state.status === 'saving'
      ? ['Saving job to Capacities…', '']
      : state.status === 'saved'
        ? ['Saved to Capacities', state.title]
        : ['Not saved', state.message];

  const card = document.createElement('div');
  card.className = `card ${state.status}`;
  card.setAttribute('role', 'status');

  const body = document.createElement('div');
  body.className = 'body';
  const h = document.createElement('div');
  h.className = 'heading';
  h.textContent = heading;
  body.append(h);
  if (detail) {
    const d = document.createElement('div');
    d.className = 'detail';
    d.textContent = detail;
    body.append(d);
  }

  const dismiss = document.createElement('button');
  dismiss.type = 'button';
  dismiss.setAttribute('aria-label', 'Dismiss');
  dismiss.textContent = '×';
  dismiss.addEventListener('click', () => host.remove());

  card.append(body, dismiss);
  root.append(style, card);
  document.documentElement.append(host);
}
