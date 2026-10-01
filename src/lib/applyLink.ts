import { parseGreenhouseUrl } from './greenhouse.ts';

/**
 * Where the application form lives when it isn't on the posting page. Runs inside the page: DOM APIs only.
 * Known ATS layouts first (Greenhouse's API, Lever's /apply, Ashby's /application tab), then the page's own "Apply" link.
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
