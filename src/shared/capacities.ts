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
  interactions: 'b71e44b4-c90e-4742-9ba8-16852104c21c',
} as const;

export type JobSection = keyof typeof JOB_SECTION_PROPERTY_IDS;

/** The Job type's Position property (rich text): the posting's URL, and a link to its Weblink object. */
export const JOB_POSITION_PROPERTY_ID = '17a5b4d2-76ee-4863-8576-7470e507707e';

async function request(
  fetch: typeof globalThis.fetch,
  token: string,
  path: string,
  init: { method: 'GET' | 'DELETE' } | { method: 'POST' | 'PATCH'; body: unknown },
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
 * `POST /object/url`: saves `url` as a Weblink object titled `title`, whose notes start with a link to the object
 * `linkTo` and a divider, the way listings are linked to their Job by hand. Rate limit: 10/min.
 */
export async function createWeblink({
  fetch,
  token,
  url,
  title,
  linkTo,
}: {
  fetch: typeof globalThis.fetch;
  token: string;
  url: string;
  title: string;
  linkTo: string;
}): Promise<{ id: string }> {
  const res = await post(fetch, token, '/object/url', {
    url,
    properties: { title: { type: 'title', title: { value: title } } },
    blocks: { media_notes: [{ type: 'EntityBlock', entityId: linkTo }, { type: 'HorizontalLineBlock' }] },
  });
  const { id } = (await res.json()) as { id: string };
  return { id };
}

/**
 * `PATCH /object`: sets a Job's Position to a link to the posting, and below it a link to the posting's Weblink object.
 * (Frontmatter can only link objects by title, which isn't unique.) Rate limit: 30/min.
 */
export async function setJobPosition({
  fetch,
  token,
  id,
  text,
  url,
  weblinkId,
}: {
  fetch: typeof globalThis.fetch;
  token: string;
  id: string;
  text: string;
  url: string;
  weblinkId: string;
}): Promise<void> {
  const value = [
    { type: 'LinkToken', text, url },
    { type: 'TextToken', text: '\n', style: {} },
    { type: 'LinkToken', text: ' ', entityId: weblinkId },
  ];
  await request(fetch, token, '/object', {
    method: 'PATCH',
    body: { id, properties: { [JOB_POSITION_PROPERTY_ID]: { type: 'richText', richText: { value } } } },
  });
}

/** `PATCH /object/markdown`: sets the properties in the frontmatter; the body is ignored. Rate limit: 30/min. */
export async function updatePropertiesFromMarkdown({
  fetch,
  token,
  id,
  markdown,
}: {
  fetch: typeof globalThis.fetch;
  token: string;
  id: string;
  markdown: string;
}): Promise<void> {
  await request(fetch, token, '/object/markdown', { method: 'PATCH', body: { id, markdown } });
}

interface ApiBlock {
  id: string;
  type: string;
  tokens?: { type: string; text?: string }[];
  blocks?: unknown[];
}

/** What to append: markdown, or blocks for what markdown can't say (like a date link). */
export type AppendContent = { markdown: string } | { blocks: WritableBlock[] };

/** The part of the API's writable TextBlock we use. */
export interface WritableBlock {
  type: 'TextBlock';
  tokens: (
    | { type: 'TextToken'; text: string; style: Record<string, boolean> }
    | { type: 'LinkToken'; text: string; date: { dateResolution: 'day'; start: string; end: null } }
  )[];
  hierarchy: { key: 'Base'; val: number };
  toggle?: { isOpen: boolean } | null;
}

/**
 * A line starting with a link to `date`'s day page, the way a Job's Interactions are written by hand: a closed toggle
 * (which Capacities shows as "- " in markdown), `[[Date/2026-10-15]] 12 reachouts`.
 */
export function datedLine(date: Date, text: string): WritableBlock {
  const pad = (n: number) => String(n).padStart(2, '0');
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return {
    type: 'TextBlock',
    tokens: [
      { type: 'LinkToken', text: ' ', date: { dateResolution: 'day', start: `${day}T00:00:00.000Z`, end: null } },
      { type: 'TextToken', text: ` ${text}`, style: {} },
    ],
    hierarchy: { key: 'Base', val: 0 },
    toggle: { isOpen: false },
  };
}

/** `POST /blocks/append`: adds markdown or blocks to one block-content property (section) of an existing object. Returns
 * that section's blocks afterwards. */
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
} & AppendContent): Promise<ApiBlock[]> {
  const res = await post(fetch, token, '/blocks/append', { id, propertyId, ...content });
  const body = (await res.json().catch(() => ({}))) as { blocks?: Record<string, ApiBlock[]> };
  return body.blocks?.[propertyId] ?? [];
}

const isEmptyParagraph = (b: ApiBlock) =>
  b.type === 'TextBlock' && !b.blocks?.length && (b.tokens ?? []).every((t) => t.type === 'TextToken' && !t.text);

/**
 * Appends markdown to a section, then removes the empty lines at the top of the section (the Job template puts one in
 * each), which would otherwise sit above the content. Only when there's content below them, so a section is never left
 * with no blocks (which can't be clicked into).
 *
 * The block ids come from the append's response: an untouched template block gets a new id on every read, so an id
 * read before the append no longer exists.
 */
export async function appendToSection({
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
} & AppendContent): Promise<void> {
  const blocks = await appendBlocks({ fetch, token, id, propertyId, ...content });
  const firstContent = blocks.findIndex((b) => !isEmptyParagraph(b));
  for (const blank of firstContent > 0 ? blocks.slice(0, firstContent) : []) {
    const query = `objectId=${encodeURIComponent(id)}&blockId=${encodeURIComponent(blank.id)}`;
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
