/**
 * Reads the application form on the page, if there is one, down to the fields that might take real work: free text
 * (textareas, text inputs) and a cover letter upload. Choices (selects, comboboxes, checkboxes, radios) and standard
 * contact fields are dropped here, in code, so the AI only has to judge the rest. Runs inside the page: DOM APIs only.
 */
export interface FormField {
  kind: 'long text' | 'short text' | 'file upload';
  label: string;
  required: boolean;
}

export interface ApplicationForm {
  /** Whether the page has an application form at all. Every ATS form has a resume upload, so a file input is the tell. */
  found: boolean;
  /** Candidate fields, in page order, deduped by label. */
  fields: FormField[];
}

const MAX_LABEL_CHARS = 400;

/** Text inputs that are just contact details: the whole label is one of these, give or take "your", a suffix, or a note in parens. */
const CONTACT_FIELD = new RegExp(
  String.raw`^(?:your\s+)?(?:(?:first|last|full|legal|preferred|given|family|middle)\s+name|name|e-?mail(?:\s+address)?|phone(?:\s+number)?|mobile(?:\s+number)?|linked\s*in|github|website|portfolio|personal\s+(?:website|site)|twitter|x|location|current\s+location|city|state|country|address|zip(?:\s+code)?|postal\s+code|pronouns?|current\s+(?:company|employer|title)|school|university|degree)(?:\s+(?:url|profile|link))?(?:\s*\(.*\))?$`,
  'i',
);

const COVER_LETTER = /cover\s*letter/i;

const TEXT_INPUT_TYPES = new Set(['', 'text']);

const clean = (s: string) =>
  s
    .replace(/\s+/g, ' ')
    .replace(/\s*[*✱]\s*$/, '')
    .trim()
    .slice(0, MAX_LABEL_CHARS);

/** Text of a node without the text of any form controls inside it (select options, prefilled values). */
function textWithoutControls(el: Element): string {
  const copy = el.cloneNode(true) as Element;
  copy.querySelectorAll('input, textarea, select, option, button, script, style').forEach((n) => n.remove());
  return copy.textContent ?? '';
}

/**
 * Text inside `container` that comes before `el`. Lever wraps the whole question in a <label>, so the question is what
 * precedes the input, and what follows it is widget chrome ("No location found...").
 */
function textBefore(container: Element, el: Element, doc: Document): string {
  const SHOW_TEXT = 4; // NodeFilter.SHOW_TEXT
  const walker = doc.createTreeWalker(container, SHOW_TEXT);
  let text = '';
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!(n.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING)) break;
    const parent = n.parentElement;
    if (parent?.closest('button, select, option, script, style')) continue;
    text += ` ${n.textContent ?? ''}`;
  }
  return text;
}

/** Labels on upload buttons that say what to do, not what the file is. */
const GENERIC_LABEL = /^\s*(?:attach|upload|browse|choose (?:a )?file|select (?:a )?file|drop files? here|enter manually)\s*$/i;

function rawLabel(el: HTMLElement, doc: Document): string {
  const label = specificLabel(el, doc);
  if (label.trim() && !GENERIC_LABEL.test(label)) return label;
  // Greenhouse's uploads: <div role="group" aria-labelledby="upload-label-cover_letter"> around an "Attach" button.
  const group = el.closest('[role="group"][aria-labelledby]');
  const groupLabel = group && labelledByText(group, doc);
  return groupLabel?.trim() ? groupLabel : nearbyText(el, doc);
}

function labelledByText(el: Element, doc: Document): string {
  return (el.getAttribute('aria-labelledby') ?? '')
    .split(/\s+/)
    .map((id) => (id ? (doc.getElementById(id)?.textContent ?? '') : ''))
    .join(' ');
}

function specificLabel(el: HTMLElement, doc: Document): string {
  const labelledBy = labelledByText(el, doc);
  if (labelledBy.trim()) return labelledBy;
  if (el.id) {
    const forLabel = Array.from(doc.querySelectorAll('label')).find((l) => l.getAttribute('for') === el.id);
    if (forLabel && textWithoutControls(forLabel).trim()) return textWithoutControls(forLabel);
  }
  const wrapping = el.closest('label');
  if (wrapping && textBefore(wrapping, el, doc).trim()) return textBefore(wrapping, el, doc);
  return el.getAttribute('aria-label') ?? '';
}

/** No usable label: the question text usually sits just before the field, a level or a few up. */
function nearbyText(el: HTMLElement, doc: Document): string {
  let node = el.parentElement;
  for (let depth = 0; node && depth < 6; depth++, node = node.parentElement) {
    const text = textBefore(node, el, doc).trim();
    if (text && !GENERIC_LABEL.test(text)) return text.length <= MAX_LABEL_CHARS * 2 ? text : '';
  }
  return el.getAttribute('placeholder') ?? el.getAttribute('name') ?? '';
}

function isRequired(el: HTMLElement, raw: string): boolean {
  return el.hasAttribute('required') || el.getAttribute('aria-required') === 'true' || /[*✱]\s*$/.test(raw.trim());
}

function isChoice(el: HTMLElement): boolean {
  const role = el.getAttribute('role');
  return (
    role === 'combobox' ||
    role === 'listbox' ||
    el.hasAttribute('list') ||
    el.getAttribute('aria-autocomplete') === 'list' ||
    el.getAttribute('aria-haspopup') === 'listbox'
  );
}

function classify(el: HTMLElement): FormField['kind'] | null {
  if (el.getAttribute('aria-hidden') === 'true') return null; // validation shims behind custom widgets
  if (el instanceof HTMLTextAreaElement || el.tagName === 'TEXTAREA') return 'long text';
  if (el.tagName !== 'INPUT') return null;
  const type = (el.getAttribute('type') ?? '').toLowerCase();
  if (type === 'file') return 'file upload';
  if (TEXT_INPUT_TYPES.has(type) && !isChoice(el)) return 'short text';
  return null;
}

/** Uploads only matter if they're a cover letter; short text only if it's more than contact details. */
export function worthListing(kind: FormField['kind'], label: string): boolean {
  if (kind === 'file upload') return COVER_LETTER.test(label);
  if (kind === 'short text') return !CONTACT_FIELD.test(label);
  return true;
}

export function readApplicationForm(doc: Document): ApplicationForm {
  const found = doc.querySelector('input[type="file" i]') !== null;
  const fields: FormField[] = [];
  const seen = new Set<string>();

  for (const el of Array.from(doc.querySelectorAll<HTMLElement>('textarea, input'))) {
    const kind = classify(el);
    if (!kind) continue;
    const raw = rawLabel(el, doc);
    const label = clean(raw);
    if (!label) continue;
    if (!worthListing(kind, label)) continue;

    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    fields.push({ kind, label, required: isRequired(el, raw) });
  }

  return { found, fields };
}
