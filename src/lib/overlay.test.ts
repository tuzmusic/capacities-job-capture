import { beforeEach, describe, expect, it } from 'vitest';
import { OVERLAY_ID, showOverlay } from './overlay.ts';

const host = () => document.getElementById(OVERLAY_ID);
const text = () => host()?.shadowRoot?.textContent ?? '';

describe('showOverlay', () => {
  beforeEach(() => {
    document.body.innerHTML = '<input id="field">';
  });

  it('shows a saving state', () => {
    showOverlay({ status: 'saving' });
    expect(text()).toMatch(/Saving job to Capacities/);
  });

  it('shows the saved title', () => {
    showOverlay({ status: 'saved', title: 'Postscript - Sr FE', objectId: 'x' });
    expect(text()).toMatch(/Saved to Capacities/);
    expect(text()).toContain('Postscript - Sr FE');
  });

  it('shows the error message', () => {
    showOverlay({ status: 'error', message: 'Capacities rate limit hit.' });
    expect(text()).toMatch(/Not saved/);
    expect(text()).toContain('Capacities rate limit hit.');
  });

  it('replaces the previous state instead of stacking dialogs', () => {
    showOverlay({ status: 'saving' });
    showOverlay({ status: 'saved', title: 'T', objectId: 'x' });
    expect(document.querySelectorAll(`#${OVERLAY_ID}`)).toHaveLength(1);
    expect(text()).not.toMatch(/Saving job/);
  });

  it('stays until dismissed, then removes itself', () => {
    showOverlay({ status: 'saved', title: 'T', objectId: 'x' });
    const dismiss = host()!.shadowRoot!.querySelector('button')!;
    expect(dismiss.getAttribute('aria-label')).toBe('Dismiss');
    dismiss.click();
    expect(host()).toBeNull();
  });

  it('does not take focus from the page', () => {
    const field = document.getElementById('field') as HTMLInputElement;
    field.focus();
    showOverlay({ status: 'saved', title: 'T', objectId: 'x' });
    expect(document.activeElement).toBe(field);
  });

  it('renders page-provided text as text, not HTML', () => {
    showOverlay({ status: 'error', message: '<img src=x onerror=alert(1)>' });
    expect(host()!.shadowRoot!.querySelector('img')).toBeNull();
    expect(text()).toContain('<img src=x onerror=alert(1)>');
  });

  it('is self-contained so it can be injected with chrome.scripting.executeScript', () => {
    // executeScript serializes the function source; any closure over module scope would break at runtime.
    const src = showOverlay.toString();
    expect(src).not.toMatch(/\bOVERLAY_ID\b/);
    expect(src).not.toMatch(/__vite|import\(/);
  });
});
