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

  it('puts the fields’ values into copied text and sent messages', () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const sendMessage = vi.fn();
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    vi.stubGlobal('chrome', { runtime: { sendMessage } });
    showOverlay({
      tone: 'success',
      heading: '2 reachouts',
      fields: [
        { id: 'company', label: 'Company', value: 'Sardine' },
        { id: 'type', label: 'Type', value: 'Connection Request', options: ['Connection Request', 'Message'] },
      ],
      actions: [
        { label: 'Copy', copy: '{company}\t{type}\n{company}\t{unknown}' },
        { label: 'Add', message: { type: 'add' } },
      ],
    });
    const input = host()!.shadowRoot!.querySelector('input')!;
    expect(input.value).toBe('Sardine');
    input.value = '  Sardine\tAI ';
    host()!.shadowRoot!.querySelector('select')!.value = 'Message';
    buttons()[0].click();
    expect(writeText).toHaveBeenCalledWith('Sardine AI\tMessage\nSardine AI\t{unknown}');
    buttons()[1].click();
    expect(sendMessage).toHaveBeenCalledWith({ type: 'add', fields: { company: 'Sardine AI', type: 'Message' } });
  });

  it('with both copy and message, sends the message only once the copy has worked', async () => {
    const sendMessage = vi.fn();
    vi.stubGlobal('chrome', { runtime: { sendMessage } });
    const action = { label: 'Copy', copy: '{company}', message: { type: 'copied' } };
    const fields = [{ id: 'company', label: 'Company', value: 'Sardine' }];

    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });
    showOverlay({ tone: 'success', heading: 'x', fields, actions: [action] });
    buttons()[0].click();
    await vi.waitFor(() => expect(buttons()[0].textContent).toBe("Couldn't copy"));
    expect(sendMessage).not.toHaveBeenCalled();

    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    showOverlay({ tone: 'success', heading: 'x', fields, actions: [action] });
    buttons()[0].click();
    await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledWith({ type: 'copied', fields: { company: 'Sardine' } }));
  });

  it('copies text and HTML together when there is HTML, escaping the input in the HTML', async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { write } });
    vi.stubGlobal('ClipboardItem', class {
      constructor(public items: Record<string, Blob>) {}
    });
    showOverlay({
      tone: 'success',
      heading: 'x',
      fields: [{ id: 'company', label: 'Company', value: 'A&B' }],
      actions: [{ label: 'Copy', copy: '{company}\tx', copyHtml: '<td>{company}</td>' }],
    });
    buttons()[0].click();
    const [[item]] = write.mock.calls[0] as [[{ items: Record<string, Blob> }]];
    expect(await item.items['text/plain'].text()).toBe('A&B\tx');
    expect(await item.items['text/html'].text()).toBe('<td>A&amp;B</td>');
  });

  it('runs the first action on Enter in the input', () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    showOverlay({ tone: 'success', heading: 'x', fields: [{ id: 'c', label: 'Company', value: 'Figma' }], actions: [{ label: 'Copy', copy: '{c}' }] });
    host()!.shadowRoot!.querySelector('input')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(writeText).toHaveBeenCalledWith('Figma');
  });

  it('a checked checkbox greys out the field it disables and switches what gets copied', () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const sendMessage = vi.fn();
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    vi.stubGlobal('chrome', { runtime: { sendMessage } });
    showOverlay({
      tone: 'success',
      heading: 'x',
      fields: [
        { id: 'company', label: 'Company', value: 'Sardine' },
        { id: 'each', label: "Each person's own company", value: '', checkbox: true, disables: 'company' },
      ],
      actions: [
        { label: 'Copy', copy: '{company}\tA', whenChecked: { field: 'each', copy: 'Stripe\tA' } },
        { label: 'Add', message: { type: 'add' } },
      ],
    });
    const [company, each] = host()!.shadowRoot!.querySelectorAll('input');
    buttons()[0].click();
    expect(writeText).toHaveBeenLastCalledWith('Sardine\tA');

    each.checked = true;
    each.dispatchEvent(new Event('change'));
    expect(company.disabled).toBe(true);
    buttons()[0].click();
    expect(writeText).toHaveBeenLastCalledWith('Stripe\tA');
    buttons()[1].click();
    expect(sendMessage).toHaveBeenCalledWith({ type: 'add', fields: { company: 'Sardine', each: 'true' } });
  });

  it('takes the placeholder on Tab in an empty box and selects its last word', () => {
    showOverlay({ tone: 'success', heading: 'x', fields: [{ id: 'note', label: 'Note', value: '', placeholder: 'thanks for the x' }] });
    const input = host()!.shadowRoot!.querySelector('input')!;
    const tab = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true });
    input.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(true);
    expect(input.value).toBe('thanks for the x');
    expect([input.selectionStart, input.selectionEnd]).toEqual([15, 16]);

    const again = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true });
    input.dispatchEvent(again);
    expect(again.defaultPrevented).toBe(false); // not empty any more: Tab moves on as usual
  });

  it('is self-contained so it can be injected with chrome.scripting.executeScript', () => {
    // executeScript serializes the function source; any closure over module scope would break at runtime.
    const src = showOverlay.toString();
    expect(src).not.toMatch(/\bOVERLAY_ID\b/);
    expect(src).not.toMatch(/__vite|import\(/);
  });
});
