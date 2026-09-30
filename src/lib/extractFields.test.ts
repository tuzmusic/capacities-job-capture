import { describe, expect, it, vi } from 'vitest';
import { extractFields, EXTRACTION_MODEL, type JobFields, type ParseClient } from './extractFields.ts';

const fields: JobFields = {
  company: 'Postscript',
  title: 'Postscript - Sr FE',
  fullTitle: 'Senior Frontend Engineer',
  salaryRange: '$172K–$203K + equity',
  applicationReqs: 'Optional cover letter',
};

function fakeClient(response: Partial<{ parsed_output: unknown; stop_reason: string }>) {
  const parse = vi.fn().mockResolvedValue({ parsed_output: null, stop_reason: 'end_turn', ...response });
  return { client: { messages: { parse } } as unknown as ParseClient, parse };
}

const page = { url: 'https://jobs.lever.co/acme/123', title: 'Acme - Staff Engineer', text: 'Staff Engineer at Acme...' };

describe('extractFields', () => {
  it('returns the parsed fields', async () => {
    const { client } = fakeClient({ parsed_output: fields });
    await expect(extractFields(client, page)).resolves.toEqual(fields);
  });

  it('uses Haiku with a structured output format', async () => {
    const { client, parse } = fakeClient({ parsed_output: fields });
    await extractFields(client, page);
    const req = parse.mock.calls[0][0];
    expect(req.model).toBe(EXTRACTION_MODEL);
    expect(EXTRACTION_MODEL).toBe('claude-haiku-4-5');
    expect(req.output_config.format).toBeDefined();
  });

  it('sends the page url, document title, and full text', async () => {
    const { client, parse } = fakeClient({ parsed_output: fields });
    await extractFields(client, page);
    const content = JSON.stringify(parse.mock.calls[0][0].messages);
    expect(content).toContain(page.url);
    expect(content).toContain(page.title);
    expect(content).toContain(page.text);
  });

  it('tells the model the short-title convention with real examples', async () => {
    const { client, parse } = fakeClient({ parsed_output: fields });
    await extractFields(client, page);
    const system = String(parse.mock.calls[0][0].system);
    expect(system).toContain('Postscript - Sr FE');
    expect(system).toContain('RevenueCat - FS/Product');
  });

  it('throws a readable error when the model refuses', async () => {
    const { client } = fakeClient({ stop_reason: 'refusal' });
    await expect(extractFields(client, page)).rejects.toThrow(/declined/i);
  });

  it('throws a readable error when the output could not be parsed', async () => {
    const { client } = fakeClient({ parsed_output: null });
    await expect(extractFields(client, page)).rejects.toThrow(/could not read/i);
  });
});
