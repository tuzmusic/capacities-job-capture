import { describe, expect, it, vi } from 'vitest';
import {
  appendBlocks,
  appendToSection,
  createObjectFromMarkdown,
  createWeblink,
  datedLine,
  getObjectMarkdown,
  JOB_SECTION_PROPERTY_IDS,
  JOB_STRUCTURE_ID,
  searchObjects,
  setJobPosition,
  updatePropertiesFromMarkdown,
} from './capacities.ts';

function fakeFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue(
    new Response(typeof body === 'string' ? body : JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  );
}

describe('createObjectFromMarkdown', () => {
  it('POSTs the markdown and structure id to /object/markdown with a bearer token', async () => {
    const fetch = fakeFetch(200, { id: 'obj-1', structureId: JOB_STRUCTURE_ID });
    await createObjectFromMarkdown({ fetch, token: 'cap-api-abc', markdown: '---\ntitle: "x"\n---\n' });

    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://api.capacities.io/object/markdown');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer cap-api-abc');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual({ structureId: JOB_STRUCTURE_ID, markdown: '---\ntitle: "x"\n---\n' });
  });

  it('returns the new object id', async () => {
    const fetch = fakeFetch(200, { id: 'obj-1', structureId: JOB_STRUCTURE_ID });
    await expect(createObjectFromMarkdown({ fetch, token: 't', markdown: 'm' })).resolves.toEqual({ id: 'obj-1' });
  });

  it('explains a rejected token', async () => {
    const fetch = fakeFetch(401, { error: 'unauthorized' });
    await expect(createObjectFromMarkdown({ fetch, token: 't', markdown: 'm' })).rejects.toThrow(
      /Capacities rejected the API token/,
    );
  });

  it('explains rate limiting', async () => {
    const fetch = fakeFetch(429, {});
    await expect(createObjectFromMarkdown({ fetch, token: 't', markdown: 'm' })).rejects.toThrow(/rate limit/i);
  });

  it('includes status and response body for other failures', async () => {
    const fetch = fakeFetch(400, { message: 'Invalid frontmatter' });
    await expect(createObjectFromMarkdown({ fetch, token: 't', markdown: 'm' })).rejects.toThrow(
      /400.*Invalid frontmatter/,
    );
  });
});

describe('appendBlocks', () => {
  it('POSTs the object id, property id, and markdown to /blocks/append with a bearer token', async () => {
    const fetch = fakeFetch(200, {});
    await appendBlocks({
      fetch,
      token: 'cap-api-abc',
      id: 'obj-1',
      propertyId: JOB_SECTION_PROPERTY_IDS.applicationReqs,
      markdown: '- Resume',
    });

    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://api.capacities.io/blocks/append');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer cap-api-abc');
    expect(JSON.parse(init.body)).toEqual({
      id: 'obj-1',
      propertyId: '65449d5f-a685-469e-84d2-45ae94c6f742',
      markdown: '- Resume',
    });
  });

  it('uses distinct property ids for each section', () => {
    const ids = Object.values(JOB_SECTION_PROPERTY_IDS);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("returns the section's blocks from the response", async () => {
    const blocks = [{ id: 'b1', type: 'TextBlock', tokens: [] }];
    const fetch = fakeFetch(200, { id: 'o', blocks: { p: blocks, other: [] } });
    await expect(appendBlocks({ fetch, token: 't', id: 'o', propertyId: 'p', markdown: 'm' })).resolves.toEqual(blocks);
  });

  it('reports failures the same way as create', async () => {
    const args = { token: 't', id: 'o', propertyId: 'p', markdown: 'm' };
    await expect(appendBlocks({ fetch: fakeFetch(401, {}), ...args })).rejects.toThrow(/rejected the API token/);
    await expect(appendBlocks({ fetch: fakeFetch(429, {}), ...args })).rejects.toThrow(/rate limit/i);
    await expect(appendBlocks({ fetch: fakeFetch(400, 'bad block'), ...args })).rejects.toThrow(/400.*bad block/);
  });
});

describe('searchObjects', () => {
  it('searches Job titles and returns the hits', async () => {
    const hits = [{ id: 'obj-1', structureId: JOB_STRUCTURE_ID, title: 'Grafana - Sr FE' }];
    const fetch = fakeFetch(200, { results: hits });
    await expect(searchObjects({ fetch, token: 't', query: 'Grafana' })).resolves.toEqual(hits);

    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://api.capacities.io/objects/search');
    expect(JSON.parse(init.body)).toEqual({ query: 'Grafana', structureIds: [JOB_STRUCTURE_ID], limit: 20 });
  });
});

describe('getObjectMarkdown', () => {
  it('GETs the object as markdown', async () => {
    const fetch = fakeFetch(200, { id: 'obj-1', structureId: JOB_STRUCTURE_ID, markdown: '# Hi' });
    await expect(getObjectMarkdown({ fetch, token: 't', id: 'obj-1' })).resolves.toBe('# Hi');
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://api.capacities.io/object/markdown?id=obj-1');
    expect(init.method).toBe('GET');
    expect(init.body).toBeUndefined();
  });
});

describe('appendToSection', () => {
  const SECTION = JOB_SECTION_PROPERTY_IDS.contacts;
  const empty = (id: string) => ({ id, type: 'TextBlock', tokens: [{ type: 'TextToken', text: '', style: {} }], blocks: [] });
  const filled = (id: string) => ({ id, type: 'TextBlock', tokens: [{ type: 'TextToken', text: 'Mine', style: {} }], blocks: [] });

  /** Answers POST /blocks/append with `after` in the section, and everything else with {}. */
  function api(after: object[]) {
    return vi.fn(async (url: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify(String(url).endsWith('/blocks/append') ? { id: 'obj-1', blocks: { [SECTION]: after } } : {}), {
        status: 200,
      }),
    );
  }
  const calls = (fetch: ReturnType<typeof api>) =>
    fetch.mock.calls.map(([url, init]) => `${(init as RequestInit).method} ${String(url).replace('https://api.capacities.io', '')}`);

  it('appends, then removes the empty lines above it, by the ids the append returned', async () => {
    const fetch = api([empty('blk-0'), empty('blk-1'), filled('blk-2')]);
    await appendToSection({ fetch, token: 't', id: 'obj-1', propertyId: SECTION, markdown: 'Cover letter (required)' });
    expect(calls(fetch)).toEqual([
      'POST /blocks/append',
      'DELETE /block?objectId=obj-1&blockId=blk-0',
      'DELETE /block?objectId=obj-1&blockId=blk-1',
    ]);
  });

  it('leaves empty lines below the first content alone', async () => {
    const fetch = api([filled('blk-0'), empty('blk-1'), filled('blk-2')]);
    await appendToSection({ fetch, token: 't', id: 'obj-1', propertyId: SECTION, markdown: 'x' });
    expect(calls(fetch)).toEqual(['POST /blocks/append']);
  });

  it('keeps the empty line when the section has nothing else, so it stays editable', async () => {
    for (const after of [[empty('blk-0')], []]) {
      const fetch = api(after);
      await appendToSection({ fetch, token: 't', id: 'obj-1', propertyId: SECTION, markdown: '  ' });
      expect(calls(fetch)).toEqual(['POST /blocks/append']);
    }
  });

  it("doesn't fail the write when a delete fails", async () => {
    const fetch = vi.fn(async (url: RequestInfo | URL) =>
      String(url).endsWith('/blocks/append')
        ? new Response(JSON.stringify({ blocks: { [SECTION]: [empty('blk-0'), filled('blk-1')] } }), { status: 200 })
        : new Response('gone', { status: 404 }),
    );
    await expect(appendToSection({ fetch, token: 't', id: 'obj-1', propertyId: SECTION, markdown: 'x' })).resolves.toBeUndefined();
  });
});

describe('datedLine', () => {
  it("links the local day, then the text, as a closed toggle like the hand-written Interactions", () => {
    expect(datedLine(new Date(2026, 9, 5, 23, 30), '12 reachouts')).toEqual({
      type: 'TextBlock',
      tokens: [
        { type: 'LinkToken', text: ' ', date: { dateResolution: 'day', start: '2026-10-05T00:00:00.000Z', end: null } },
        { type: 'TextToken', text: ' 12 reachouts', style: {} },
      ],
      hierarchy: { key: 'Base', val: 0 },
      toggle: { isOpen: false },
    });
  });

  it('can be appended as blocks instead of markdown', async () => {
    const fetch = fakeFetch(200, {});
    const block = datedLine(new Date(2026, 9, 5), 'x');
    await appendBlocks({ fetch, token: 't', id: 'o', propertyId: JOB_SECTION_PROPERTY_IDS.interactions, blocks: [block] });
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ id: 'o', propertyId: JOB_SECTION_PROPERTY_IDS.interactions, blocks: [block] });
  });
});

describe('updatePropertiesFromMarkdown', () => {
  it('PATCHes the frontmatter to /object/markdown', async () => {
    const fetch = fakeFetch(200, { id: 'obj-1' });
    await updatePropertiesFromMarkdown({ fetch, token: 't', id: 'obj-1', markdown: '---\nstatus: "First Reachouts"\n---\n' });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://api.capacities.io/object/markdown');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body)).toEqual({ id: 'obj-1', markdown: '---\nstatus: "First Reachouts"\n---\n' });
  });
});

describe('createWeblink', () => {
  it('POSTs the url and title to /object/url, with notes that open on a link to the Job and a divider', async () => {
    const fetch = fakeFetch(200, { id: 'web-1', structureId: 'MediaWebResource' });
    await expect(
      createWeblink({ fetch, token: 't', url: 'https://jobs.example.com/1', title: 'Acme: Engineer', linkTo: 'job-1' }),
    ).resolves.toEqual({ id: 'web-1' });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://api.capacities.io/object/url');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({
      url: 'https://jobs.example.com/1',
      properties: { title: { type: 'title', title: { value: 'Acme: Engineer' } } },
      blocks: { media_notes: [{ type: 'EntityBlock', entityId: 'job-1' }, { type: 'HorizontalLineBlock' }] },
    });
  });
});

describe('setJobPosition', () => {
  it('PATCHes the Position to the posting link and, on the next line, a link to the Weblink', async () => {
    const fetch = fakeFetch(200, { id: 'job-1' });
    await setJobPosition({ fetch, token: 't', id: 'job-1', text: 'Engineer', url: 'https://x.com/1', weblinkId: 'web-1' });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://api.capacities.io/object');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body)).toEqual({
      id: 'job-1',
      properties: {
        '17a5b4d2-76ee-4863-8576-7470e507707e': {
          type: 'richText',
          richText: {
            value: [
              { type: 'LinkToken', text: 'Engineer', url: 'https://x.com/1' },
              { type: 'TextToken', text: '\n', style: {} },
              { type: 'LinkToken', text: ' ', entityId: 'web-1' },
            ],
          },
        },
      },
    });
  });
});
