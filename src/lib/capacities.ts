/** Capacities public API. Reference: https://api.capacities.io/docs (spec at /openapi.json). */
export const CAPACITIES_API = 'https://api.capacities.io';

/** The "Job" object type in Jonathan's space. */
export const JOB_STRUCTURE_ID = 'e3d770b4-fdeb-4bf9-ab75-3cdcdfefb1e3';

/** `POST /object/markdown`: frontmatter sets properties, the rest becomes the body. Rate limit: 30/min. */
export async function createObjectFromMarkdown({
  fetch,
  token,
  markdown,
  structureId = JOB_STRUCTURE_ID,
}: {
  fetch: typeof globalThis.fetch;
  token: string;
  markdown: string;
  structureId?: string;
}): Promise<{ id: string }> {
  const res = await fetch(`${CAPACITIES_API}/object/markdown`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ structureId, markdown }),
  });

  if (res.status === 401 || res.status === 403) {
    throw new Error('Capacities rejected the API token. Check it in the extension options.');
  }
  if (res.status === 429) throw new Error('Capacities rate limit hit. Try again in a minute.');
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 300);
    throw new Error(`Capacities error ${res.status}: ${detail}`);
  }

  const { id } = (await res.json()) as { id: string };
  return { id };
}
