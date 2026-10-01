import type { PageCapture } from './pageCapture.ts';

/**
 * The tab's frames each produce a capture; the posting is whichever has the most text. If the application form (or a
 * link to it) lives in a different frame than the posting, borrow it.
 */
export function pickBestCapture(captures: (PageCapture | null | undefined)[]): PageCapture | null {
  let best: PageCapture | null = null;
  for (const c of captures) if (c && (!best || c.text.length > best.text.length)) best = c;
  if (!best || best.applicationForm.found) return best;
  const withForm = captures.find((c) => c?.applicationForm.found);
  if (withForm) return { ...best, applicationForm: withForm.applicationForm, applyUrl: null };
  const withLink = best.applyUrl ? best : captures.find((c) => c?.applyUrl);
  return withLink ? { ...best, applyUrl: withLink.applyUrl } : best;
}
