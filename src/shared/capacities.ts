/** Capacities public API. Reference: https://api.capacities.io/docs (spec at /openapi.json). */
export const CAPACITIES_API = 'https://api.capacities.io';

/** The "Job" object type in Jonathan's space. */
export const JOB_STRUCTURE_ID = 'e3d770b4-fdeb-4bf9-ab75-3cdcdfefb1e3';

/**
 * The Job type's body sections are block-content properties, not headings: each has its own property id.
 * (They don't appear in `/space/structures`; read from `GET /object` → `blocks`.) Only the ones we write to are listed.
 */
export const JOB_SECTION_PROPERTY_IDS = {
  /** 1st & 2nd Degree Contacts: the first section, which gets the `/object/markdown` body (ours is empty). */
  contacts: '3443806e-5617-44c6-8abe-318d386bb890',
  applicationReqs: '65449d5f-a685-469e-84d2-45ae94c6f742',
  jobDescription: '9f9dd203-d775-4e14-9d60-bcd7d002b5a1',
} as const;

export type JobSection = keyof typeof JOB_SECTION_PROPERTY_IDS;

async function request(
  fetch: typeof globalThis.fetch,
  token: string,
  path: string,
  init: { method: 'GET' | 'DELETE' } | { method: 'POST'; body: unknown },
): Promise<Response> {
  const res = await fetch(`${CAPACITIES_API}${path}`, {
    method: init.method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...('body' in init ? { body: JSON.stringify(init.body) } : {}),
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

const post = (fetch: typeof globalThis.fetch, token: string, path: string, body: unknown) =>
  request(fetch, token, path, { method: 'POST', body });

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

/**
 * One empty paragraph: what the Job template puts in a blank section. A section with no blocks at all can't be clicked
 * into or typed in, and the API turns empty markdown into no blocks, so this has to be sent as a block.
 */
export const EMPTY_PARAGRAPH = {
  type: 'TextBlock',
  tokens: [{ type: 'TextToken', text: '', style: {} }],
  hierarchy: { key: 'Base', val: 0 },
} as const;

/** `POST /blocks/append`: adds markdown (or raw blocks) as blocks to one block-content property (section) of an existing object. */
export async function appendBlocks({
  fetch,
  token,
  id,
  propertyId,
  ...content
}: {
  fetch: typeof globalThis.fetch;
  token: string;
  id: string;
  propertyId: string;
} & ({ markdown: string } | { blocks: readonly object[] })): Promise<void> {
  await post(fetch, token, '/blocks/append', { id, propertyId, ...content });
}

interface ApiBlock {
  id: string;
  type: string;
  tokens?: { type: string; text?: string }[];
  blocks?: unknown[];
}

const isEmptyParagraph = (b: ApiBlock) =>
  b.type === 'TextBlock' && !b.blocks?.length && (b.tokens ?? []).every((t) => t.type === 'TextToken' && !t.text);

/**
 * Appends markdown to a section, then removes the section's placeholder: the one empty line the Job template puts in
 * a blank section, which would otherwise sit above what we wrote. Only when that empty line was all the section had
 * and we actually wrote something, so a section is never left with no blocks (which can't be clicked into).
 */
export async function appendToSection({
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
  const before = await request(fetch, token, `/object?id=${encodeURIComponent(id)}`, { method: 'GET' })
    .then(async (res) => ((await res.json()) as { blocks?: Record<string, ApiBlock[]> }).blocks?.[propertyId] ?? [])
    .catch(() => [] as ApiBlock[]);
  await appendBlocks({ fetch, token, id, propertyId, markdown });
  const [placeholder] = before;
  if (markdown.trim() && before.length === 1 && isEmptyParagraph(placeholder)) {
    const query = `objectId=${encodeURIComponent(id)}&blockId=${encodeURIComponent(placeholder.id)}`;
    await request(fetch, token, `/block?${query}`, { method: 'DELETE' }).catch(() => {}); // cosmetic only
  }
}

export interface SearchHit {
  id: string;
  structureId: string;
  title: string;
}

/** `POST /objects/search`: matches `query` against object titles only, most relevant first. Rate limit: 30/min. */
export async function searchObjects({
  fetch,
  token,
  query,
  structureIds = [JOB_STRUCTURE_ID],
  limit = 20,
}: {
  fetch: typeof globalThis.fetch;
  token: string;
  query: string;
  structureIds?: string[];
  limit?: number;
}): Promise<SearchHit[]> {
  const res = await post(fetch, token, '/objects/search', { query: query.slice(0, 512), structureIds, limit });
  const { results } = (await res.json()) as { results: SearchHit[] };
  return results;
}

/** `GET /object/markdown`: the whole object, properties and every section, as Markdown. Rate limit: 30/min. */
export async function getObjectMarkdown({
  fetch,
  token,
  id,
}: {
  fetch: typeof globalThis.fetch;
  token: string;
  id: string;
}): Promise<string> {
  const res = await request(fetch, token, `/object/markdown?id=${encodeURIComponent(id)}`, { method: 'GET' });
  const { markdown } = (await res.json()) as { markdown: string };
  return markdown;
}
