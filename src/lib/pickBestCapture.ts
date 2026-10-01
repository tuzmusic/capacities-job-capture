import type { PageCapture } from './pageCapture.ts';

/**
 * The tab's frames each produce a capture; the posting is whichever has the most text. If the application form lives in
 * a different frame than the posting, borrow it.
 */
export function pickBestCapture(captures: (PageCapture | null | undefined)[]): PageCapture | null {
  let best: PageCapture | null = null;
  for (const c of captures) if (c && (!best || c.text.length > best.text.length)) best = c;
  if (!best || best.applicationForm.found) return best;
  const withForm = captures.find((c) => c?.applicationForm.found);
  return withForm ? { ...best, applicationForm: withForm.applicationForm } : best;
}
