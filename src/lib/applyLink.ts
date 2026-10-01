import { parseGreenhouseUrl } from './greenhouse.ts';

/**
 * Where the application form lives when it isn't on the posting page. Runs inside the page: DOM APIs only.
 * Known ATS layouts first (Greenhouse's API, Lever's /apply, Ashby's /application tab), then the page's own "Apply" link,
 * and failing that, an "Apply" button that reveals the form without leaving the page.
 */
const LEVER_JOB = /^https:\/\/jobs\.(?:eu\.)?lever\.co\/[^/]+\/[0-9a-f-]{36}\/?$/i;
const ASHBY_JOB = /^https:\/\/jobs\.ashbyhq\.com\/[^/]+\/[0-9a-f-]{36}\/?$/i;

/** Job boards that link "Apply" to themselves or to a login, not to the company's form. */
const NOT_A_FORM = /linkedin\.com|indeed\.com|glassdoor\.com|ziprecruiter\.com|wellfound\.com|builtin\.com/i;

const APPLY_TEXT = /^\s*(?:apply(?: now| for this (?:job|position|role)| here| online|)|submit (?:an |your )?application|start (?:your )?application|application)\s*[→›>]?\s*$/i;

const withoutHashOrSlash = (u: string) => u.replace(/#.*$/, '').replace(/\/$/, '');

export function findApplyUrl(doc: Document, url: string): string | null {
  if (parseGreenhouseUrl(url)) return url; // the job board API has the form; see greenhouse.ts
  const clean = url.replace(/[?#].*$/, '');
  if (LEVER_JOB.test(clean)) return `${clean.replace(/\/$/, '')}/apply`;
  if (ASHBY_JOB.test(clean)) return `${clean.replace(/\/$/, '')}/application`;

  const here = withoutHashOrSlash(url);
  for (const a of Array.from(doc.querySelectorAll<HTMLAnchorElement>('a[href]'))) {
    if (!APPLY_TEXT.test(a.textContent ?? '')) continue;
    let href: string;
    try {
      href = new URL(a.getAttribute('href') ?? '', url).href;
    } catch {
      continue;
    }
    if (!/^https?:/.test(href) || NOT_A_FORM.test(href) || withoutHashOrSlash(href) === here) continue;
    return href;
  }
  return null;
}

/** Things that act like a button. Links count only when they don't go anywhere else (`#apply`, `javascript:`, no href). */
const CLICKABLE = 'button, [role="button"], [role="tab"], a, input[type="button"], input[type="submit"]';

/** An "Apply" control that switches views in place (a modal, a tab, a client-side route), for when there's no link. */
export function findApplyButton(doc: Document, url: string): HTMLElement | null {
  const here = withoutHashOrSlash(url);
  for (const el of Array.from(doc.querySelectorAll<HTMLElement>(CLICKABLE))) {
    const text = el instanceof HTMLInputElement ? el.value : (el.textContent ?? '');
    if (!APPLY_TEXT.test(text) || el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true') continue;
    const href = el.tagName === 'A' ? el.getAttribute('href') : null;
    if (href && !/^\s*(?:#|javascript:)/i.test(href)) {
      try {
        if (withoutHashOrSlash(new URL(href, url).href) !== here) continue; // a real link: findApplyUrl's job
      } catch {
        continue;
      }
    }
    return el;
  }
  return null;
}

/** Clicks the in-page "Apply" control, if there is one. Returns whether it clicked. */
export function clickApplyButton(doc: Document, url: string): boolean {
  const button = findApplyButton(doc, url);
  button?.click();
  return button !== null;
}
