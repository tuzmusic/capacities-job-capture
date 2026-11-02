import type { Person } from './peoplePage.ts';

const escapeLinkText = (s: string) => s.replace(/[[\]\\]/g, (c) => `\\${c}`);

const personLine = (p: Person) => `[${escapeLinkText(p.name)}](${p.url})${p.title ? ` - ${p.title}` : ''}`;

export interface MutualsSummary {
  markdown: string;
  firstDegree: number;
  /** 2nd-degree people the markdown lists (each counted once). */
  secondDegree: number;
}

export const NO_CONTACTS = '_No 1st or 2nd degree connections._';

/** The group for 2nd-degree people whose card doesn't name a mutual (LinkedIn's Nov 2026 page often leaves it off). */
export const UNNAMED_MUTUAL = 'Mutual not shown';

const nameKey = (name: string) => name.replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * For the Job's "1st & 2nd Degree Contacts" section, as bullets (no headings). 2nd-degree people are grouped under
 * each mutual connection who could introduce you, so someone with two mutuals is listed under both. A mutual who
 * works at the company is already in the 1st-degree list, so they get no group: anyone you'd only reach through them
 * is left out.
 *
 * With 1st-degree people, both lists sit under "1st degree" / "2nd degree" bullets; with only 2nd-degree people, the
 * mutuals are the top-level bullets. 2nd-degree people whose card names no mutual go last, under "Mutual not shown".
 */
export function buildMutualsMarkdown(
  people: Person[],
  { complete, stopped = false }: { complete: boolean; stopped?: boolean },
): MutualsSummary {
  const first = people.filter((p) => p.degree === '1');
  const atCompany = new Set(first.map((p) => nameKey(p.name)));
  const groups = new Map<string, Person[]>();
  const unnamed: Person[] = [];
  for (const p of people) {
    if (p.degree !== '2') continue;
    if (!p.mutuals.length) unnamed.push(p);
    for (const mutual of p.mutuals) {
      if (!atCompany.has(nameKey(mutual))) groups.set(mutual, [...(groups.get(mutual) ?? []), p]);
    }
  }

  // The mutual who can introduce you to the most people first.
  const ranked = [...groups].sort((a, b) => b[1].length - a[1].length);
  if (unnamed.length) ranked.push([UNNAMED_MUTUAL, unnamed]);
  const second = ranked.flatMap(([mutual, reachable]) => [
    `- ${mutual}`,
    ...reachable.map((p) => `  - ${personLine(p)}`),
  ]);
  const indent = (lines: string[]) => lines.map((l) => `  ${l}`);

  const lines = first.length
    ? [
        '- 1st degree',
        ...indent(first.map((p) => `- ${personLine(p)}`)),
        ...(second.length ? ['- 2nd degree', ...indent(second)] : []),
      ]
    : second.length
      ? second
      : [NO_CONTACTS];
  if (!complete) {
    const n = people.length;
    const who = `${n} ${n === 1 ? 'person' : 'people'}`;
    lines.push('', `_${stopped ? 'Stopped' : 'LinkedIn stopped'} loading after ${who}, so there may be more._`);
  }

  return {
    markdown: lines.join('\n'),
    firstDegree: first.length,
    secondDegree: new Set([...groups.values(), unnamed].flat()).size,
  };
}

/** "/in/janedoe", so a URL matches with or without the domain, query, or trailing slash. */
const profileKey = (url: string) => url.match(/\/in\/([^/?#)\s]+)/i)?.[1].toLowerCase() ?? null;

/** How many of the profiles our markdown lists are already in the note's markdown. */
export function contactsAlreadyIn(ours: string, note: string): { listed: number; present: number } {
  const keys = (md: string) => new Set([...md.matchAll(/linkedin\.com\/in\/[^\s)]+/gi)].map((m) => profileKey(m[0])!));
  const listed = keys(ours);
  const inNote = keys(note);
  return { listed: listed.size, present: [...listed].filter((k) => inNote.has(k)).length };
}
