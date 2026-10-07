import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OVERLAY_ID, showOverlay } from './overlay.ts';

const host = () => document.getElementById(OVERLAY_ID);
const text = () => host()?.shadowRoot?.textContent ?? '';
const buttons = () => [...host()!.shadowRoot!.querySelectorAll<HTMLButtonElement>('button.action')];

describe('showOverlay', () => {
  beforeEach(() => {
    document.body.innerHTML = '<input id="field">';
  });
  afterEach(() => vi.unstubAllGlobals());

  it('shows the heading and detail', () => {
    showOverlay({ tone: 'success', heading: 'Saved to Capacities', detail: 'Postscript - Sr FE' });
    expect(text()).toContain('Saved to Capacities');
    expect(text()).toContain('Postscript - Sr FE');
    expect(host()!.shadowRoot!.querySelector('.card')!.className).toContain('success');
  });

  it('replaces the previous state instead of stacking dialogs', () => {
    showOverlay({ tone: 'busy', heading: 'Saving job…' });
    showOverlay({ tone: 'success', heading: 'Saved' });
    expect(document.querySelectorAll(`#${OVERLAY_ID}`)).toHaveLength(1);
    expect(text()).not.toMatch(/Saving job/);
  });

  it('stays until dismissed, then removes itself', () => {
    showOverlay({ tone: 'success', heading: 'Saved' });
    const dismiss = host()!.shadowRoot!.querySelector('button')!;
    expect(dismiss.getAttribute('aria-label')).toBe('Dismiss');
    dismiss.click();
    expect(host()).toBeNull();
  });

  it('does not take focus from the page', () => {
    const field = document.getElementById('field') as HTMLInputElement;
    field.focus();
    showOverlay({ tone: 'success', heading: 'Saved' });
    expect(document.activeElement).toBe(field);
  });

  it('renders page-provided text as text, not HTML', () => {
    showOverlay({ tone: 'error', heading: 'Not saved', detail: '<img src=x onerror=alert(1)>' });
    expect(host()!.shadowRoot!.querySelector('img')).toBeNull();
    expect(text()).toContain('<img src=x onerror=alert(1)>');
  });

  it('copies an action’s text to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    showOverlay({ tone: 'warning', heading: 'No note found', actions: [{ label: 'Copy markdown', copy: '## Hi' }] });
    buttons()[0].click();
    expect(writeText).toHaveBeenCalledWith('## Hi');
  });

  it('sends an action’s message to the background once, then disables the choices', () => {
    const sendMessage = vi.fn();
    vi.stubGlobal('chrome', { runtime: { sendMessage } });
    showOverlay({
      tone: 'warning',
      heading: 'Which job?',
      actions: [
        { label: 'A', message: { pick: 'a' } },
        { label: 'B', message: { pick: 'b' } },
      ],
    });
    buttons()[1].click();
    expect(sendMessage).toHaveBeenCalledWith({ pick: 'b' });
    expect(buttons().every((b) => b.disabled)).toBe(true);
  });

  it('is self-contained so it can be injected with chrome.scripting.executeScript', () => {
    // executeScript serializes the function source; any closure over module scope would break at runtime.
    const src = showOverlay.toString();
    expect(src).not.toMatch(/\bOVERLAY_ID\b/);
    expect(src).not.toMatch(/__vite|import\(/);
  });
});
