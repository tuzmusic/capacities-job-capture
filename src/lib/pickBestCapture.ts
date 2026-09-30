import type { PageCapture } from './pageCapture.ts';

/** The tab's frames each produce a capture; the posting is whichever has the most text. */
export function pickBestCapture(captures: (PageCapture | null | undefined)[]): PageCapture | null {
  let best: PageCapture | null = null;
  for (const c of captures) if (c && (!best || c.text.length > best.text.length)) best = c;
  return best;
}
