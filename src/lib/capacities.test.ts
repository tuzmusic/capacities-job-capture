import { describe, expect, it, vi } from 'vitest';
import { appendBlocks, createObjectFromMarkdown, JOB_SECTION_PROPERTY_IDS, JOB_STRUCTURE_ID } from './capacities.ts';

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

  it('uses distinct property ids for the two sections', () => {
    expect(JOB_SECTION_PROPERTY_IDS.applicationReqs).not.toBe(JOB_SECTION_PROPERTY_IDS.jobDescription);
  });

  it('reports failures the same way as create', async () => {
    const args = { token: 't', id: 'o', propertyId: 'p', markdown: 'm' };
    await expect(appendBlocks({ fetch: fakeFetch(401, {}), ...args })).rejects.toThrow(/rejected the API token/);
    await expect(appendBlocks({ fetch: fakeFetch(429, {}), ...args })).rejects.toThrow(/rate limit/i);
    await expect(appendBlocks({ fetch: fakeFetch(400, 'bad block'), ...args })).rejects.toThrow(/400.*bad block/);
  });
});
