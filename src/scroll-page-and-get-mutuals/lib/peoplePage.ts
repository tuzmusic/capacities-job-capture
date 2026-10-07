/**
 * Reads a LinkedIn company "People" page (runs inside the page). LinkedIn's markup changes, so each lookup has a
 * known class name first and a looser fallback.
 */

export type Degree = '1' | '2' | '3+';

export interface Person {
  name: string;
  /** Headline, with the company name and parentheticals taken out. */
  title: string;
  /** Profile URL without the query string. */
  url: string;
  degree: Degree;
  /** The 1st-degree connections you have in common, by name ("and 3 others" isn't named, so isn't here). */
  mutuals: string[];
}

const PROFILE_LINK = 'a[href*="/in/"]';
const LOAD_MORE_BUTTON = 'button.scaffold-finite-scroll__load-button';

const collapse = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

/** One element per person: the info part of each profile card. */
export function findPeopleCards(doc: Document): Element[] {
  const cards = [...doc.querySelectorAll('.org-people-profile-card__profile-info')];
  if (cards.length) return cards;
  // Fallback: list items in the main column that link to a profile, outermost only.
  const items = [...doc.querySelectorAll('main li')].filter((li) => li.querySelector(PROFILE_LINK));
  return items.filter((li) => !items.some((other) => other !== li && other.contains(li)));
}

export function findLoadMoreButton(doc: Document): HTMLButtonElement | null {
  return (
    doc.querySelector<HTMLButtonElement>(LOAD_MORE_BUTTON) ??
    [...doc.querySelectorAll<HTMLButtonElement>('main button, button')].find((b) =>
      /^show more results$/i.test(collapse(b.textContent)),
    ) ??
    null
  );
}

/**
 * Scrolls to the bottom (some lists load on scroll) and clicks "Show more results" once, if it's there.
 * `clicked` is false when there's no button to click (or it's disabled): either everything's loaded, or a batch is
 * still loading.
 */
export function clickLoadMore(doc: Document): { cards: number; clicked: boolean } {
  doc.defaultView?.scrollTo(0, doc.documentElement.scrollHeight);
  const button = findLoadMoreButton(doc);
  const cards = findPeopleCards(doc).length;
  if (!button || button.disabled) return { cards, clicked: false };
  button.scrollIntoView?.({ block: 'center' });
  button.dispatchEvent(new MouseEvent('click', { view: doc.defaultView, bubbles: true, cancelable: true }));
  return { cards, clicked: true };
}

/** The company name from the page header, else the page title, else '' (the caller falls back to the URL). */
export function readCompanyName(doc: Document): string {
  const heading = collapse(doc.querySelector('.org-top-card-summary__title, .org-top-card h1, main h1')?.textContent);
  if (heading) return heading;
  const title = doc.querySelector<HTMLMetaElement>('meta[property="og:title"]')?.content || doc.title;
  const parts = title
    .replace(/^\(\d+\)\s*/, '') // unread notifications count
    .split('|')
    .map(collapse)
    .filter((p) => p && !/^(linkedin|people)$/i.test(p));
  return parts[0]?.replace(/:\s*(people|overview|about)$/i, '') ?? '';
}

/** Text runs in document order: roughly the card's lines (name, "· 2nd", headline, mutuals, button). */
function textRuns(el: Element): string[] {
  const walker = el.ownerDocument.createTreeWalker(el, 4 /* NodeFilter.SHOW_TEXT */);
  const runs: string[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = collapse(n.textContent);
    if (t) runs.push(t);
  }
  return runs;
}

/** The smallest element whose text matches, so "<strong>Jane</strong> is a mutual connection" comes out whole. */
function deepestMatching(el: Element, pattern: RegExp): string {
  const matches = [...el.querySelectorAll('*')].filter((e) => pattern.test(e.textContent ?? ''));
  const deepest = matches.filter((e) => !matches.some((other) => other !== e && e.contains(other)));
  return collapse(deepest[0]?.textContent ?? (pattern.test(el.textContent ?? '') ? el.textContent : ''));
}

const DEGREE_RUN = /^(?:[·•]\s*)?\d(?:st|nd|rd|th)\+?(?:\s*degree.*)?$|degree connection/i;
const MUTUAL = /mutual connection/i;
const BUTTON_RUN = /^(connect|follow|message|pending|view .*profile|status is .*)$/i;

export function readDegree(text: string): Degree {
  const d =
    text.match(/(\d)(?:st|nd|rd|th)?\+?\s*degree/i)?.[1] ?? text.match(/[·•]\s*(\d)(?:st|nd|rd|th)/i)?.[1] ?? '';
  return d === '1' ? '1' : d === '2' ? '2' : '3+';
}

/**
 * "Jane Doe is a mutual connection" → ["Jane Doe"]; "Jane Doe, John Roe and 5 other mutual connections" → both names.
 * The line can start with other card text, like "808 followers • ", which is dropped.
 */
export function parseMutuals(line: string): string[] {
  const s = collapse(line).replace(/^.*[•·]\s*/, '');
  const names =
    s.match(/^(.+?)\s+(?:is|are)\s+(?:an?\s+)?mutual connections?\b/i)?.[1] ??
    s.match(/^(.*?)(?:,?\s*(?:and\s+)?)\d+\s+others?\s+mutual connections?\b/i)?.[1] ??
    '';
  return names
    .split(/\s*,\s*(?:and\s+)?|\s+and\s+/)
    .map((n) => n.trim())
    .filter(Boolean);
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Takes the company out of a headline: "Senior Engineer at Grafana Labs (Loki)" → "Senior Engineer". */
export function cleanTitle(title: string, company: string): string {
  let t = collapse(title);
  const first = company.trim().split(/\s+/)[0] ?? '';
  const names = [company.trim(), ...(first.length >= 4 && first !== company.trim() ? [first] : [])].filter(Boolean);
  for (const name of names) {
    const co = escapeRegExp(name);
    t = t.replace(new RegExp(`\\s*(?:\\bat\\b|@|\\||,|-|–|—)\\s*${co}\\b.*$`, 'i'), '');
    t = t.replace(new RegExp(`${co}[^,|]*`, 'i'), '');
  }
  return t
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s,|@·•–—-]+|[\s,|@·•–—-]+$/g, '')
    .trim();
}

export function readPerson(card: Element, company: string): Person | null {
  const link = [...card.querySelectorAll<HTMLAnchorElement>(PROFILE_LINK)].find((a) => a.href);
  if (!link) return null; // "LinkedIn Member": out of network, no profile to link
  const url = link.href.split('?')[0];

  const runs = textRuns(card);
  const name =
    collapse(card.querySelector('.artdeco-entity-lockup__title')?.textContent) ||
    runs.find((r) => !DEGREE_RUN.test(r) && !BUTTON_RUN.test(r)) ||
    '';
  if (!name) return null;

  const headline =
    collapse(card.querySelector('.artdeco-entity-lockup__subtitle')?.textContent) ||
    runs.find((r) => r !== name && !DEGREE_RUN.test(r) && !MUTUAL.test(r) && !BUTTON_RUN.test(r)) ||
    '';
  const mutualLine = deepestMatching(card, MUTUAL);

  return {
    name,
    title: cleanTitle(headline, company),
    url,
    degree: readDegree(collapse(card.textContent)),
    mutuals: mutualLine ? parseMutuals(mutualLine) : [],
  };
}

/** Everyone on the page with a profile link, once each. */
export function scrapePeople(doc: Document, company: string): Person[] {
  const byUrl = new Map<string, Person>();
  for (const card of findPeopleCards(doc)) {
    const p = readPerson(card, company);
    if (p && !byUrl.has(p.url)) byUrl.set(p.url, p);
  }
  return [...byUrl.values()];
}
