import { describe, expect, it, vi } from 'vitest';
import { appendToSheet } from './sheetWebhook.ts';

const answer = (body: string, status = 200) => vi.fn(async () => new Response(body, { status }));

describe('appendToSheet', () => {
  it('posts the rows as JSON text and returns what was added', async () => {
    const fetch = answer('{"ok":true,"added":2,"firstRow":3990}');
    const rows = [['Sardine', '=HYPERLINK("u","n")', '', '10/9/2026', '', 'Connection Request']];
    await expect(appendToSheet({ fetch, url: 'https://script.google.com/x/exec', rows })).resolves.toEqual({
      added: 2,
      firstRow: 3990,
    });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://script.google.com/x/exec');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ rows });
  });

  it('explains a sign-in page instead of JSON', async () => {
    await expect(appendToSheet({ fetch: answer('<html>Sign in</html>'), url: 'u', rows: [] })).rejects.toThrow(
      /access: Anyone/,
    );
  });

  it("passes on the script's error", async () => {
    await expect(appendToSheet({ fetch: answer('{"ok":false,"error":"No sheet named Sheet1"}'), url: 'u', rows: [] })).rejects.toThrow(
      'No sheet named Sheet1',
    );
  });

  it('fails on an HTTP error', async () => {
    await expect(appendToSheet({ fetch: answer('nope', 500), url: 'u', rows: [] })).rejects.toThrow(/500/);
  });
});
