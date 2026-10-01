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

function rawLabel(el: HTMLElement, doc: Document): string {
  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    const text = labelledBy
      .split(/\s+/)
      .map((id) => doc.getElementById(id)?.textContent ?? '')
      .join(' ');
    if (text.trim()) return text;
  }
  if (el.id) {
    const forLabel = Array.from(doc.querySelectorAll('label')).find((l) => l.getAttribute('for') === el.id);
    if (forLabel && textWithoutControls(forLabel).trim()) return textWithoutControls(forLabel);
  }
  const wrapping = el.closest('label');
  if (wrapping && textWithoutControls(wrapping).trim()) return textWithoutControls(wrapping);
  const aria = el.getAttribute('aria-label');
  if (aria?.trim()) return aria;
  // Lever and friends: the question text sits in a sibling div, a level or two up.
  let node = el.parentElement;
  for (let depth = 0; node && depth < 4; depth++, node = node.parentElement) {
    const text = textWithoutControls(node).trim();
    if (text) return text.length <= MAX_LABEL_CHARS * 2 ? text : '';
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
  if (el instanceof HTMLTextAreaElement || el.tagName === 'TEXTAREA') return 'long text';
  if (el.tagName !== 'INPUT') return null;
  const type = (el.getAttribute('type') ?? '').toLowerCase();
  if (type === 'file') return 'file upload';
  if (TEXT_INPUT_TYPES.has(type) && !isChoice(el)) return 'short text';
  return null;
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
    if (kind === 'file upload' && !COVER_LETTER.test(label)) continue;
    if (kind === 'short text' && CONTACT_FIELD.test(label)) continue;

    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    fields.push({ kind, label, required: isRequired(el, raw) });
  }

  return { found, fields };
}
