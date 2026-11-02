/** Rows for the Job Search Contacts sheet: Company | Name | Role | Date | Notes | Type. */

export interface Reachout {
  /** Profile URL, as built by profileUrl(). */
  url: string;
  name: string;
  company: string;
}

/** The Type column's choices, the default first. */
export const REACHOUT_TYPES = ['Connection Request', 'Message'] as const;

/** What every row in one run shares: one kind of reachout and one note, and usually one company. */
export interface Shared {
  /** Left out: each row gets its reachout's own company. */
  company?: string;
  type: string;
  note: string;
}

const isLinkedIn = (host: string) => host === 'linkedin.com' || host.endsWith('.linkedin.com');

/** "https://www.linkedin.com/in/levonmk/?isSelfProfile=false" → "https://www.linkedin.com/in/levonmk/"; null if not a profile (or your own, /in/me). */
export function profileUrl(href: string): string | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  const slug = url.pathname.match(/^\/in\/([^/]+)/)?.[1];
  if (!isLinkedIn(url.hostname) || !slug || slug === 'me') return null;
  return `https://www.linkedin.com/in/${slug}/`;
}

/** The company page a tab is on, by its slug ("sardine-ai"), and whether it's the People page. */
export function companyPage(href: string): { slug: string; people: boolean } | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  const match = url.pathname.match(/^\/company\/([^/]+)(\/[^/]*)?/);
  if (!isLinkedIn(url.hostname) || !match) return null;
  return { slug: decodeURIComponent(match[1]), people: match[2] === '/people' };
}

const PAGE_WORDS = /^(linkedin|people|about|jobs|posts|life|overview|home|insights|events|videos)$/i;

/** "(2) Sardine: People | LinkedIn" → "Sardine". */
export function companyFromTitle(title: string): string {
  const parts = title
    .replace(/^\(\d+\+?\)\s*/, '')
    .split('|')
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter((p) => p && !PAGE_WORDS.test(p));
  return parts[0]?.replace(/:\s*\w+$/, '') ?? '';
}

/** "sardine-ai" → "Sardine Ai". Only a fallback for when the tab says nothing better. */
export const slugToName = (slug: string) =>
  slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');

/** The company most of the profiles name, or ''. */
export function mostCommon(companies: string[]): string {
  const counts = new Map<string, number>();
  for (const c of companies) if (c) counts.set(c, (counts.get(c) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
}

/** "(3) Levon Mkrtchyan | LinkedIn" → "Levon Mkrtchyan". */
export const nameFromTitle = (title: string) =>
  title.replace(/^\(\d+\+?\)\s*/, '').split('|')[0].replace(/\s+/g, ' ').trim();

/** Same format the sheet already uses: 10/9/2026. */
export const sheetDate = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;

const formulaString = (s: string) => `"${s.replaceAll('"', '""')}"`;

export const hyperlink = (url: string, label: string) => `=HYPERLINK(${formulaString(url)},${formulaString(label)})`;

export function toRow(r: Reachout, shared: Shared, date: string): string[] {
  return [shared.company ?? r.company, hyperlink(r.url, r.name), '', date, shared.note, shared.type];
}

const escapeHtml = (s: string) =>
  s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

/**
 * The same rows as an HTML table, for the clipboard's text/html. Sheets pastes a table cell by cell and keeps the
 * links, so Name comes out as a linked name with no formula to fix. `shared` goes in as is, so placeholders like
 * `{company}` survive for the overlay to fill (HTML-escaped).
 */
export function toHtml(reachouts: Reachout[], shared: Shared, date: string): string {
  const cell = (html: string) => `<td>${html}</td>`;
  const rows = reachouts.map(
    (r) =>
      '<tr>' +
      cell(shared.company ?? escapeHtml(r.company)) +
      cell(`<a href="${escapeHtml(r.url)}">${escapeHtml(r.name)}</a>`) +
      cell('') +
      cell(escapeHtml(date)) +
      cell(shared.note) +
      cell(shared.type) +
      '</tr>',
  );
  return `<meta charset="utf-8"><table>${rows.join('')}</table>`;
}

/**
 * Tab-separated, unquoted, so pasting into Sheets splits the columns and runs the HYPERLINK formula as is. Tabs and
 * newlines inside a cell would split it, so they become spaces.
 */
export function toTsv(rows: string[][]): string {
  return rows.map((row) => row.map((cell) => cell.replace(/[\t\r\n]+/g, ' ')).join('\t')).join('\n');
}
