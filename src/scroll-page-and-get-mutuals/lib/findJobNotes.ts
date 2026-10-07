import type { SearchHit } from '../../shared/capacities.ts';
import type { SavedJob } from '../../shared/savedJobs.ts';

export interface JobNote {
  id: string;
  title: string;
}

/** Words that don't tell companies apart: "Grafana Labs" and "Grafana" are the same company. */
const SUFFIXES = new Set(['inc', 'llc', 'ltd', 'labs', 'lab', 'corp', 'corporation', 'co', 'company', 'hq', 'group', 'gmbh', 'technologies', 'technology', 'software']);

function companyWords(name: string): string[] {
  const words = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  while (words.length > 1 && SUFFIXES.has(words[words.length - 1])) words.pop();
  return words;
}

/** Same company if one name's words start the other's: "Scale AI" ~ "Scale", but not "Meta" ~ "Metabase". */
export function sameCompany(a: string, b: string): boolean {
  const [x, y] = [companyWords(a), companyWords(b)];
  if (!x.length || !y.length) return false;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return short.every((w, i) => long[i] === w);
}

/** Job titles are "Company - Role". */
export const titleCompany = (title: string) => title.split(/\s+[-–—]\s+/)[0];

/**
 * The Job notes for `company`: ones this extension saved (newest first), then Capacities title search hits.
 * Search is tried with the full name, then its first word ("Grafana Labs" → "Grafana") if that finds nothing.
 */
export async function findJobNotes({
  company,
  saved,
  search,
}: {
  company: string;
  saved: SavedJob[];
  search: (query: string) => Promise<SearchHit[]>;
}): Promise<JobNote[]> {
  const notes = new Map<string, JobNote>();
  for (const j of saved) {
    if (sameCompany(j.company, company) || sameCompany(titleCompany(j.title), company)) {
      notes.set(j.objectId, { id: j.objectId, title: j.title });
    }
  }

  const first = company.trim().split(/\s+/)[0] ?? '';
  const queries = [...new Set([company.trim(), first].filter((q) => q.length >= 2))];
  for (const query of queries) {
    const hits = (await search(query)).filter((h) => sameCompany(titleCompany(h.title), company));
    for (const h of hits) if (!notes.has(h.id)) notes.set(h.id, { id: h.id, title: h.title });
    if (hits.length) break;
  }
  return [...notes.values()];
}
