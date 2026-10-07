/** LinkedIn's id for the Engineering job function, in the people page's `facetCurrentFunction` filter. */
export const ENGINEERING_FUNCTION = '8';

export type PeoplePageTarget =
  | { kind: 'not-company' }
  /** Already on the company's Engineering people page. */
  | { kind: 'here'; slug: string }
  | { kind: 'navigate'; slug: string; url: string };

const isLinkedIn = (host: string) => host === 'linkedin.com' || host.endsWith('.linkedin.com');

/** Where to go from `href` to see the company's Engineering people: `{companyUrl}/people/?facetCurrentFunction=8`. */
export function engineeringPeopleTarget(href: string): PeoplePageTarget {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return { kind: 'not-company' };
  }
  const match = url.pathname.match(/^\/company\/([^/]+)(\/[^/]*)?/);
  if (!isLinkedIn(url.hostname) || !match) return { kind: 'not-company' };

  const slug = decodeURIComponent(match[1]);
  const onPeople = match[2] === '/people';
  if (onPeople && url.searchParams.get('facetCurrentFunction') === ENGINEERING_FUNCTION) return { kind: 'here', slug };
  return {
    kind: 'navigate',
    slug,
    url: `${url.origin}/company/${encodeURIComponent(slug)}/people/?facetCurrentFunction=${ENGINEERING_FUNCTION}`,
  };
}

/** "grafana-labs" → "Grafana Labs". Only a fallback for when the page doesn't show the company name. */
export function slugToName(slug: string): string {
  return slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}
