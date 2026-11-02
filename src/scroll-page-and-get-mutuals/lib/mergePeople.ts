import type { Person } from './peoplePage.ts';

const profileKey = (url: string) => url.match(/\/in\/([^/?#]+)/i)?.[1].toLowerCase() ?? url;
const firstName = (name: string) => name.trim().split(/\s+/)[0].toLowerCase();

/**
 * The people page and people search find mostly the same people, described differently: search names each mutual in
 * full ("Mitesh Kumar"), where the people page often has just a first name ("Mitesh") or none at all.
 *
 * Merges by profile, people-page order first, then the people only search found. When both have someone, search's card
 * wins, but the people page's mutuals are kept if search shows none. Then a first-name-only mutual gets the full name
 * when exactly one full name seen anywhere (mutuals, and your 1st-degree people at the company) starts with it.
 */
export function mergePeople(fromPage: Person[], fromSearch: Person[]): Person[] {
  const byKey = new Map<string, Person>();
  for (const p of fromPage) if (!byKey.has(profileKey(p.url))) byKey.set(profileKey(p.url), p);
  for (const p of fromSearch) {
    const key = profileKey(p.url);
    const page = byKey.get(key);
    byKey.set(key, page && !p.mutuals.length ? { ...p, mutuals: page.mutuals } : p);
  }
  const people = [...byKey.values()];

  const fullNames = new Set(
    [...people.flatMap((p) => p.mutuals), ...people.filter((p) => p.degree === '1').map((p) => p.name)].filter((n) =>
      /\s/.test(n.trim()),
    ),
  );
  const expand = (mutual: string) => {
    if (/\s/.test(mutual.trim())) return mutual;
    const matches = [...fullNames].filter((n) => firstName(n) === mutual.toLowerCase());
    return matches.length === 1 ? matches[0] : mutual;
  };
  return people.map((p) => ({ ...p, mutuals: [...new Set(p.mutuals.map(expand))] }));
}
