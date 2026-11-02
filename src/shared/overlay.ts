export type OverlayTone = 'busy' | 'success' | 'warning' | 'error';

export interface OverlayAction {
  label: string;
  /** Copies this text to the clipboard when clicked. Each `{id}` in it becomes that field's value, on one line. */
  copy?: string;
  /** With `copy`: also put this on the clipboard as text/html, which rich-text targets like Sheets prefer. `{id}` too. */
  copyHtml?: string;
  /** Sent to the background with chrome.runtime.sendMessage when clicked, with the fields' values as `fields` if any.
   * With `copy`, only once the copy has worked. */
  message?: unknown;
  /** While the checkbox `field` is checked, copy these instead. */
  whenChecked?: { field: string; copy: string; copyHtml?: string };
}

/** A box above the buttons, for something to check or fix before acting. */
export interface OverlayField {
  /** Names the field in `{id}` placeholders and in a message's `fields`. */
  id: string;
  label: string;
  value: string;
  /** Makes it a dropdown of these instead of a text box. */
  options?: string[];
  /** Shown while the text box is empty. Tab takes it as the value and selects its last word, to type over. */
  placeholder?: string;
  /** Makes it a checkbox, checked when `value` is 'true'. Its value is then 'true' or ''. */
  checkbox?: boolean;
  /** With `checkbox`: the id of a field it greys out while checked. */
  disables?: string;
}

export interface OverlayState {
  tone: OverlayTone;
  heading: string;
  detail?: string;
  fields?: OverlayField[];
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
    .actions { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; margin-top: 10px; }
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
    .field { display: flex; flex-direction: column; gap: 4px; margin-top: 10px; font-weight: 600; }
    .field.check { flex-direction: row-reverse; justify-content: flex-end; align-items: center; gap: 6px; font-weight: normal; }
    .field input:disabled { opacity: .5; }
    .field input:not([type=checkbox]), .field select {
      font: inherit; font-weight: normal; padding: 5px 8px; border-radius: 6px; border: 1px solid #d2d2d7;
      background: transparent; color: inherit;
    }
    @media (prefers-color-scheme: dark) {
      .card { background: #2c2c2e; color: #f2f2f7; box-shadow: 0 6px 24px rgba(0,0,0,.5); }
      .detail { color: #aeaeb2; }
      .dismiss:hover { color: #f2f2f7; }
      .action, .field input:not([type=checkbox]), .field select { border-color: #48484a; }
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

  const clean = (v: string) => v.replace(/\s+/g, ' ').trim();
  const option = (text: string, value: string, selected: boolean) => {
    const o = document.createElement('option');
    o.textContent = text;
    o.value = value;
    o.selected = selected;
    return o;
  };
  type Control = { id: string; el: HTMLInputElement | HTMLSelectElement; text: HTMLInputElement | null; disables?: string };
  const controls = (state.fields ?? []).map((f): Control => {
    const label = document.createElement('label');
    label.className = 'field';
    label.textContent = f.label;
    body.append(label);
    if (f.options) {
      const select = document.createElement('select');
      for (const o of f.options) select.append(option(o, o, o === f.value));
      label.append(select);
      return { id: f.id, el: select, text: null };
    }
    const input = document.createElement('input');
    if (f.checkbox) {
      input.type = 'checkbox';
      input.checked = f.value === 'true';
      label.classList.add('check');
      label.append(input);
      return { id: f.id, el: input, text: null, disables: f.disables };
    }
    input.type = 'text';
    input.value = f.value;
    input.spellcheck = false;
    label.append(input);
    if (f.placeholder) {
      const placeholder = f.placeholder;
      input.placeholder = placeholder;
      input.addEventListener('keydown', (e) => {
        if (e.key !== 'Tab' || e.shiftKey || input.value) return;
        e.preventDefault();
        input.value = placeholder;
        const lastWord = placeholder.search(/\S+\s*$/);
        input.setSelectionRange(lastWord < 0 ? placeholder.length : lastWord, placeholder.trimEnd().length);
      });
    }
    return { id: f.id, el: input, text: input };
  });
  const checked = (id: string) => controls.some((c) => c.id === id && c.el instanceof HTMLInputElement && c.el.checked);
  for (const c of controls) {
    const target = controls.find((t) => t.id === c.disables)?.el;
    if (!target) continue;
    const sync = () => (target.disabled = checked(c.id));
    c.el.addEventListener('change', sync);
    sync();
  }
  const values = () =>
    Object.fromEntries(
      controls.map((c) => [
        c.id,
        c.el instanceof HTMLInputElement && c.el.type === 'checkbox' ? (c.el.checked ? 'true' : '') : clean(c.el.value),
      ]),
    );
  const fill = (template: string, escape: (v: string) => string) => {
    const v = values();
    return template.replace(/\{([\w-]+)\}/g, (m, id: string) => (id in v ? escape(v[id]) : m));
  };

  if (state.actions?.length) {
    const actions = document.createElement('div');
    actions.className = 'actions';
    const buttons = state.actions.map((action) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'action';
      b.textContent = action.label;
      const send = () => {
        // Only one of these goes through; the background redraws the overlay with the outcome.
        for (const other of buttons) other.disabled = true;
        const message = controls.length ? { ...(action.message as object), fields: values() } : action.message;
        (globalThis as { chrome?: typeof chrome }).chrome?.runtime?.sendMessage(message);
      };
      b.addEventListener('click', () => {
        if (action.copy !== undefined) {
          const chosen = action.whenChecked && checked(action.whenChecked.field) ? action.whenChecked : action;
          const text = fill(chosen.copy!, (v) => v);
          const html =
            chosen.copyHtml === undefined
              ? undefined
              : fill(chosen.copyHtml, (v) => v.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'));
          const written =
            html === undefined || typeof ClipboardItem === 'undefined'
              ? navigator.clipboard.writeText(text)
              : navigator.clipboard.write([
                  new ClipboardItem({
                    'text/plain': new Blob([text], { type: 'text/plain' }),
                    'text/html': new Blob([html], { type: 'text/html' }),
                  }),
                ]);
          written.then(
            () => {
              b.textContent = 'Copied';
              if (action.message !== undefined) send();
            },
            () => (b.textContent = "Couldn't copy"),
          );
        } else if (action.message !== undefined) {
          send();
        }
      });
      return b;
    });
    actions.append(...buttons);
    body.append(actions);
    // Enter in a text box is the first button.
    for (const { text } of controls) {
      text?.addEventListener('keydown', (e) => e.key === 'Enter' && buttons[0]?.click());
    }
  }
  // Keys stay out of the page, so its shortcuts don't fire while typing.
  for (const { el } of controls) {
    for (const type of ['keydown', 'keyup', 'keypress']) el.addEventListener(type, (e) => e.stopPropagation());
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
