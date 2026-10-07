import { describe, expect, it, vi } from 'vitest';
import {
  appendBlocks,
  appendToSection,
  createObjectFromMarkdown,
  EMPTY_PARAGRAPH,
  getObjectMarkdown,
  JOB_SECTION_PROPERTY_IDS,
  JOB_STRUCTURE_ID,
  searchObjects,
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

  it('can send raw blocks instead of markdown', async () => {
    const fetch = fakeFetch(200, {});
    await appendBlocks({ fetch, token: 't', id: 'obj-1', propertyId: 'p', blocks: [EMPTY_PARAGRAPH] });
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body).toEqual({ id: 'obj-1', propertyId: 'p', blocks: [EMPTY_PARAGRAPH] });
    expect(body).not.toHaveProperty('markdown');
  });

  it('sends an empty paragraph shaped like the ones the Job template puts in blank sections', () => {
    expect(EMPTY_PARAGRAPH).toEqual({
      type: 'TextBlock',
      tokens: [{ type: 'TextToken', text: '', style: {} }],
      hierarchy: { key: 'Base', val: 0 },
    });
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
  const SECTION = JOB_SECTION_PROPERTY_IDS.applicationReqs;
  const empty = { id: 'blk-0', type: 'TextBlock', tokens: [{ type: 'TextToken', text: '', style: {} }], blocks: [] };
  const filled = { id: 'blk-1', type: 'TextBlock', tokens: [{ type: 'TextToken', text: 'Mine', style: {} }], blocks: [] };

  /** Answers GET /object with `blocks` in the section, and everything else with {}. */
  function api(blocks: object[]) {
    return vi.fn(async (url: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify(String(url).includes('/object?') ? { id: 'obj-1', blocks: { [SECTION]: blocks } } : {}), {
        status: 200,
      }),
    );
  }
  const calls = (fetch: ReturnType<typeof api>) =>
    fetch.mock.calls.map(([url, init]) => `${(init as RequestInit).method} ${String(url).replace('https://api.capacities.io', '')}`);

  it('appends, then removes the template’s empty line above it', async () => {
    const fetch = api([empty]);
    await appendToSection({ fetch, token: 't', id: 'obj-1', propertyId: SECTION, markdown: 'Cover letter (required)' });
    expect(calls(fetch)).toEqual([
      'GET /object?id=obj-1',
      'POST /blocks/append',
      'DELETE /block?objectId=obj-1&blockId=blk-0',
    ]);
  });

  it('leaves the section alone when it already had content, or had no blocks at all', async () => {
    for (const blocks of [[filled], [empty, filled], []]) {
      const fetch = api(blocks);
      await appendToSection({ fetch, token: 't', id: 'obj-1', propertyId: SECTION, markdown: 'x' });
      expect(calls(fetch)).toEqual(['GET /object?id=obj-1', 'POST /blocks/append']);
    }
  });

  it('keeps the empty line when there was nothing to write, so the section stays editable', async () => {
    const fetch = api([empty]);
    await appendToSection({ fetch, token: 't', id: 'obj-1', propertyId: SECTION, markdown: '  ' });
    expect(calls(fetch)).not.toContain('DELETE /block?objectId=obj-1&blockId=blk-0');
  });
});
