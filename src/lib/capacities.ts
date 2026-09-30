/** Capacities public API. Reference: https://api.capacities.io/docs (spec at /openapi.json). */
export const CAPACITIES_API = 'https://api.capacities.io';

/** The "Job" object type in Jonathan's space. */
export const JOB_STRUCTURE_ID = 'e3d770b4-fdeb-4bf9-ab75-3cdcdfefb1e3';

/**
 * The Job type's body sections are block-content properties, not headings: each has its own property id.
 * (They don't appear in `/space/structures`; read from `GET /object` → `blocks`.) Only the two we fill are listed.
 */
export const JOB_SECTION_PROPERTY_IDS = {
  applicationReqs: '65449d5f-a685-469e-84d2-45ae94c6f742',
  jobDescription: '9f9dd203-d775-4e14-9d60-bcd7d002b5a1',
} as const;

export type JobSection = keyof typeof JOB_SECTION_PROPERTY_IDS;

async function post(fetch: typeof globalThis.fetch, token: string, path: string, body: unknown): Promise<Response> {
  const res = await fetch(`${CAPACITIES_API}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (res.status === 401 || res.status === 403) {
    throw new Error('Capacities rejected the API token. Check it in the extension options.');
  }
  if (res.status === 429) throw new Error('Capacities rate limit hit. Try again in a minute.');
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 300);
    throw new Error(`Capacities error ${res.status}: ${detail}`);
  }
  return res;
}

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
  const res = await post(fetch, token, '/object/markdown', { structureId, markdown });

  const { id } = (await res.json()) as { id: string };
  return { id };
}

/** `POST /blocks/append`: adds markdown as blocks to one block-content property (section) of an existing object. */
export async function appendBlocks({
  fetch,
  token,
  id,
  propertyId,
  markdown,
}: {
  fetch: typeof globalThis.fetch;
  token: string;
  id: string;
  propertyId: string;
  markdown: string;
}): Promise<void> {
  await post(fetch, token, '/blocks/append', { id, propertyId, markdown });
}
