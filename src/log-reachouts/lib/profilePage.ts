/**
 * Reads a LinkedIn profile page (runs inside the page). LinkedIn's markup changes, so each lookup has a stable hook
 * first (aria-labels, section ids) and a looser fallback. Imports nothing, so it stays one self-contained injected script.
 */

export interface Profile {
  name: string;
  /** Current company, or '' when the page doesn't say. */
  company: string;
  headline: string;
}

const collapse = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

/** "Senior Engineer at Sardine | ex-Stripe" → "Sardine". */
export function companyFromHeadline(headline: string): string {
  return collapse(headline.match(/(?:\bat\b|@)\s*([^|,·•()]+)/i)?.[1]);
}

/** The top card: the section with the profile's name in it. */
function topCard(doc: Document): { card: Element | null; name: string } {
  const h1 = doc.querySelector('main h1') ?? doc.querySelector('h1');
  return { card: h1?.closest('section') ?? doc.querySelector('main section'), name: collapse(h1?.textContent) };
}

/** The top card's "Current company: Sardine. Click to skip to experience card" button. */
function companyFromTopCard(doc: Document): string {
  const label = doc.querySelector('[aria-label*="Current company" i]')?.getAttribute('aria-label') ?? '';
  return collapse(label.replace(/^.*?current company:?\s*/i, '').replace(/\.\s*click.*$/i, ''));
}

/** Visible text lines of an Experience entry. LinkedIn repeats each one in a visually-hidden span, so those are skipped. */
function lines(el: Element): string[] {
  const shown = [...el.querySelectorAll('span[aria-hidden="true"]')].map((s) => collapse(s.textContent));
  const runs = shown.length ? shown : collapse(el.textContent) ? [collapse(el.textContent)] : [];
  return runs.filter((r, i) => r && r !== runs[i - 1]);
}

const DURATION = /\b\d+\s*(?:yrs?|mos?|years?|months?)\b/i;

/**
 * The first Experience entry's company. A single role reads "Title / Company · Full-time / dates"; several roles at
 * one company read "Company / Full-time · 3 yrs / Title / …".
 */
function companyFromExperience(doc: Document): string {
  const section = doc.getElementById('experience')?.closest('section');
  const entry = section?.querySelector('li');
  if (!entry) return '';
  const [first = '', second = ''] = lines(entry);
  if (DURATION.test(second) && !second.includes(' - ')) return first;
  return collapse(second.split('·')[0]);
}

export function readProfile(doc: Document): Profile {
  const { card, name } = topCard(doc);
  const headline = collapse(card?.querySelector('.text-body-medium')?.textContent);
  return {
    name, // the caller falls back on the tab title
    company: companyFromTopCard(doc) || companyFromExperience(doc) || companyFromHeadline(headline),
    headline,
  };
}
