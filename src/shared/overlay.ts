export type OverlayTone = 'busy' | 'success' | 'warning' | 'error';

export interface OverlayAction {
  label: string;
  /** Copies this text to the clipboard when clicked. */
  copy?: string;
  /** Sent to the background with chrome.runtime.sendMessage when clicked. */
  message?: unknown;
}

export interface OverlayState {
  tone: OverlayTone;
  heading: string;
  detail?: string;
  actions?: OverlayAction[];
}

export const OVERLAY_ID = 'capacities-job-capture-overlay';

/**
 * Shows a task's status in the page's top-right corner. Stays until dismissed and never takes focus, so it's
 * still there when you come back to the tab. Any task's overlay replaces the previous one.
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
    .busy { --accent: #8e8e93; }
    .success { --accent: #2e9d5b; }
    .warning { --accent: #d9a23a; }
    .error { --accent: #d93a3a; }
    .body { flex: 1; min-width: 0; }
    .heading { font-weight: 600; }
    .detail { margin-top: 2px; overflow-wrap: anywhere; white-space: pre-line; color: #555; }
    .actions { display: flex; flex-direction: column; gap: 6px; margin-top: 10px; }
    .dismiss {
      all: unset; cursor: pointer; padding: 0 4px; font-size: 18px; line-height: 1; color: #888;
    }
    .dismiss:hover { color: #1d1d1f; }
    .action {
      all: unset; cursor: pointer; box-sizing: border-box; padding: 6px 10px; border-radius: 6px;
      border: 1px solid #d2d2d7; overflow-wrap: anywhere;
    }
    .action:hover { border-color: var(--accent); }
    .action:disabled { cursor: default; opacity: .5; }
    @media (prefers-color-scheme: dark) {
      .card { background: #2c2c2e; color: #f2f2f7; box-shadow: 0 6px 24px rgba(0,0,0,.5); }
      .detail { color: #aeaeb2; }
      .dismiss:hover { color: #f2f2f7; }
      .action { border-color: #48484a; }
    }
  `;

  const card = document.createElement('div');
  card.className = `card ${state.tone}`;
  card.setAttribute('role', 'status');

  const body = document.createElement('div');
  body.className = 'body';
  const h = document.createElement('div');
  h.className = 'heading';
  h.textContent = state.heading;
  body.append(h);
  if (state.detail) {
    const d = document.createElement('div');
    d.className = 'detail';
    d.textContent = state.detail;
    body.append(d);
  }

  if (state.actions?.length) {
    const actions = document.createElement('div');
    actions.className = 'actions';
    const buttons = state.actions.map((action) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'action';
      b.textContent = action.label;
      b.addEventListener('click', () => {
        if (action.copy !== undefined) {
          navigator.clipboard.writeText(action.copy).then(
            () => (b.textContent = 'Copied'),
            () => (b.textContent = "Couldn't copy"),
          );
        }
        if (action.message !== undefined) {
          // Only one of these goes through; the background redraws the overlay with the outcome.
          for (const other of buttons) other.disabled = true;
          (globalThis as { chrome?: typeof chrome }).chrome?.runtime?.sendMessage(action.message);
        }
      });
      return b;
    });
    actions.append(...buttons);
    body.append(actions);
  }

  const dismiss = document.createElement('button');
  dismiss.type = 'button';
  dismiss.className = 'dismiss';
  dismiss.setAttribute('aria-label', 'Dismiss');
  dismiss.textContent = '×';
  dismiss.addEventListener('click', () => host.remove());

  card.append(body, dismiss);
  root.append(style, card);
  document.documentElement.append(host);
}
