import type { PageCapture } from './pageCapture.ts';

/**
 * A guess at whether the tab is something other than a single job posting: a search page, a profile, a list of openings.
 * Only a guess, so the overlay offers "Try anyway". Returns why it isn't a posting, or null when it might be one.
 */
export function notAJobListing(capture: PageCapture): string | null {
  const byUrl = pageKindFromUrl(capture.url);
  if (byUrl) return `This looks like ${byUrl}, not a job posting.`;
  // An application form is about as sure a sign as there is.
  if (capture.applicationForm.found) return null;

  const signals = postingSignals(capture.text);
  if (capture.jobLinks >= MANY_JOB_LINKS && signals < LIST_MAX_SIGNALS) {
    return `This looks like a list of ${capture.jobLinks} jobs, not one posting. Open the one you want first.`;
  }
  if (signals < MIN_SIGNALS) return "This page doesn't read like a job description.";
  return null;
}

/** Phrases a job description almost always has a few of. Each counts once. */
const POSTING_SIGNALS = [
  /responsibilit(?:y|ies)/i,
  /requirements/i,
  /qualifications/i,
  /what you(?:'|’)?ll (?:do|bring|need)|what you will (?:do|bring|need)/i,
  /who you are/i,
  /what we(?:'|’)?re looking for|what we are looking for/i,
  /about (?:the|this) (?:role|job|position|opportunity|team)/i,
  /\byou(?:'|’)?ll\b|\byou will\b/i,
  /nice to have|bonus points|preferred/i,
  /\d\+? years(?: of)?(?: \w+)? experience/i,
  /ideal candidate|must have/i,
  /compensation|salary|pay range|base pay/i,
];

const MIN_SIGNALS = 2;
/** A careers page with this many links to postings is a list, unless it reads strongly like a posting itself. */
const MANY_JOB_LINKS = 5;
const LIST_MAX_SIGNALS = 4;

export function postingSignals(text: string): number {
  return POSTING_SIGNALS.filter((re) => re.test(text)).length;
}

/** What the URL alone says this is, for sites where it says enough ("a LinkedIn profile"), or null. */
export function pageKindFromUrl(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\./, '');
  const path = u.pathname.replace(/\/+$/, '');
  const segments = path.split('/').filter(Boolean);

  if (/(^|\.)google\.[a-z.]+$/.test(host) && path === '/search') return 'a Google search';
  if (host === 'bing.com' && path === '/search') return 'a Bing search';
  if (host === 'duckduckgo.com') return 'a DuckDuckGo search';

  if (host.endsWith('linkedin.com')) {
    if (path.startsWith('/in/')) return 'a LinkedIn profile';
    if (path.startsWith('/company/') || path.startsWith('/school/')) return 'a LinkedIn company page';
    if (path.startsWith('/jobs/view/') || u.searchParams.has('currentJobId')) return null;
    if (path.startsWith('/jobs')) return 'a list of LinkedIn jobs';
    if (path.startsWith('/search/')) return 'a LinkedIn search';
    return 'a LinkedIn page';
  }

  // ATS job boards: the company's board root lists its openings; a posting has more to its path.
  const atsBoard =
    (/^(?:job-)?boards\.greenhouse\.io$/.test(host) && segments.length === 1 && !u.searchParams.has('gh_jid')) ||
    (/^jobs\.(?:eu\.)?lever\.co$/.test(host) && segments.length === 1) ||
    (host === 'jobs.ashbyhq.com' && segments.length === 1);
  if (atsBoard) return 'a list of openings';

  return null;
}

/** Hrefs that look like one job posting: /jobs/123, /careers/senior-engineer, ?gh_jid=, etc. */
const JOB_LINK = /\/(?:jobs?|careers?|positions?|openings?|roles?|vacanc(?:y|ies)|requisitions?)\/[^/?#]+|[?&](?:gh_jid|jobId|currentJobId)=/i;

/** How many distinct links on the page go to what look like individual postings (other than this page). */
export function countJobLinks(doc: Document, url: string): number {
  const here = url.replace(/#.*$/, '');
  const hrefs = new Set<string>();
  for (const a of Array.from(doc.querySelectorAll<HTMLAnchorElement>('a[href]'))) {
    let href: string;
    try {
      href = new URL(a.getAttribute('href') ?? '', url).href.replace(/#.*$/, '');
    } catch {
      continue;
    }
    if (href !== here && /^https?:/.test(href) && JOB_LINK.test(href)) hrefs.add(href);
  }
  return hrefs.size;
}
