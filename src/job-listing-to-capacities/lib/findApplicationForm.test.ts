import { describe, expect, it, vi } from 'vitest';
import { findApplicationForm } from './findApplicationForm.ts';
import type { PageCapture } from './pageCapture.ts';

const noForm = { found: false, fields: [] };
const someForm = { found: true, fields: [{ kind: 'long text' as const, label: 'Why us?', required: true }] };

const capture = (over: Partial<PageCapture> = {}): PageCapture => ({
  url: 'https://acme.com/careers/1',
  title: 'Engineer',
  text: 'Engineer at Acme',
  descriptionMarkdown: '',
  applicationForm: noForm,
  applyUrl: null,
  applyButton: false,
  ...over,
});

function deps(page: PageCapture | null = null) {
  return {
    fetch: vi.fn().mockResolvedValue(new Response(JSON.stringify({ questions: [] }))),
    capturePage: vi.fn().mockResolvedValue(page),
  };
}

describe('findApplicationForm', () => {
  it('uses the form on the page without looking elsewhere', async () => {
    const d = deps();
    const result = await findApplicationForm(capture({ applicationForm: someForm }), d);
    expect(result).toEqual({ form: someForm, missedApplyPage: null });
    expect(d.capturePage).not.toHaveBeenCalled();
  });

  it('gives up quietly with no apply link', async () => {
    await expect(findApplicationForm(capture(), deps())).resolves.toEqual({ form: noForm, missedApplyPage: null });
  });

  it('asks the Greenhouse API for Greenhouse apply links, without opening a tab', async () => {
    const d = deps();
    const result = await findApplicationForm(capture({ applyUrl: 'https://boards.greenhouse.io/acme/jobs/9' }), d);
    expect(result).toEqual({ form: { found: true, fields: [] }, missedApplyPage: null });
    expect(d.fetch).toHaveBeenCalledWith('https://boards-api.greenhouse.io/v1/boards/acme/jobs/9?questions=true');
    expect(d.capturePage).not.toHaveBeenCalled();
  });

  it('falls back to opening the Greenhouse page if the API fails', async () => {
    const d = deps(capture({ applicationForm: someForm }));
    d.fetch.mockResolvedValue(new Response('', { status: 500 }));
    const result = await findApplicationForm(capture({ applyUrl: 'https://boards.greenhouse.io/acme/jobs/9' }), d);
    expect(result.form).toBe(someForm);
  });

  it('opens other apply pages and uses their form', async () => {
    const d = deps(capture({ applicationForm: someForm }));
    const result = await findApplicationForm(capture({ applyUrl: 'https://jobs.lever.co/acme/x/apply' }), d);
    expect(d.capturePage).toHaveBeenCalledWith('https://jobs.lever.co/acme/x/apply', undefined);
    expect(result).toEqual({ form: someForm, missedApplyPage: null });
  });

  it('reports what a formless apply page showed, for the AI to explain', async () => {
    const d = deps(capture({ text: 'Sign in to apply' }));
    const result = await findApplicationForm(capture({ applyUrl: 'https://acme.com/apply' }), d);
    expect(result).toEqual({ form: noForm, missedApplyPage: { url: 'https://acme.com/apply', text: 'Sign in to apply' } });
  });

  it('reopens the posting and clicks its in-page Apply button when there is no apply link', async () => {
    const d = deps(capture({ applicationForm: someForm }));
    const result = await findApplicationForm(capture({ applyButton: true }), d);
    expect(d.capturePage).toHaveBeenCalledWith('https://acme.com/careers/1', { clickApply: true });
    expect(result).toEqual({ form: someForm, missedApplyPage: null });
  });

  it('reports what the page showed after clicking Apply, when still no form', async () => {
    const d = deps(capture({ text: 'Create an account to apply' }));
    const result = await findApplicationForm(capture({ applyButton: true }), d);
    expect(result.missedApplyPage).toEqual({ url: 'https://acme.com/careers/1', text: 'Create an account to apply' });
  });

  it("doesn't open Workday and friends", async () => {
    const d = deps();
    const url = 'https://acme.wd5.myworkdayjobs.com/en-US/careers/job/123/apply';
    const result = await findApplicationForm(capture({ applyUrl: url }), d);
    expect(d.capturePage).not.toHaveBeenCalled();
    expect(result).toEqual({ form: noForm, missedApplyPage: { url, text: '' } });
  });

  it('treats a failed tab capture as no form', async () => {
    const d = deps();
    d.capturePage.mockRejectedValue(new Error('tab closed'));
    const result = await findApplicationForm(capture({ applyUrl: 'https://acme.com/apply' }), d);
    expect(result).toEqual({ form: noForm, missedApplyPage: { url: 'https://acme.com/apply', text: '' } });
  });
});
