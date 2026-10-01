import { describe, expect, it, vi, type Mock } from 'vitest';
import type { JobFields } from './extractFields.ts';
import type { PageCapture } from './pageCapture.ts';
import { saveJob } from './saveJob.ts';

const capture: PageCapture = {
  url: 'https://jobs.ashbyhq.com/revenuecat/cf3c',
  title: 'RevenueCat',
  text: 'Senior Software Engineer, Product. RevenueCat makes building, analyzing, and growing mobile subscriptions easy. $227K',
  descriptionMarkdown: '## The Role\n\nShip.',
  applicationForm: { found: true, fields: [{ kind: 'long text', label: 'Why RevenueCat?', required: true }] },
};

const fields: JobFields = {
  company: 'RevenueCat',
  title: 'RevenueCat - FS/Product',
  fullTitle: 'Senior Software Engineer, Product',
  salaryRange: '$227K + equity',
  coverLetter: 'none',
  applicationQuestions: [],
};

function deps(overrides: { extract?: Mock; create?: Mock; appendSection?: Mock } = {}) {
  return {
    extract: vi.fn().mockResolvedValue(fields),
    create: vi.fn().mockResolvedValue({ id: 'obj-9' }),
    appendSection: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('saveJob', () => {
  it('extracts fields from the capture text, url, and title', async () => {
    const d = deps();
    await saveJob(capture, d);
    expect(d.extract).toHaveBeenCalledWith({
      url: capture.url,
      title: capture.title,
      text: capture.text,
      applicationForm: capture.applicationForm,
    });
  });

  it('creates the object from frontmatter built with the AI fields', async () => {
    const d = deps();
    await saveJob(capture, d);
    const markdown: string = d.create.mock.calls[0][0];
    expect(markdown).toContain('title: "RevenueCat - FS/Product"');
    expect(markdown).toContain(`position: "[Senior Software Engineer, Product](${capture.url})"`);
    expect(markdown).toContain('salaryRange: "$227K + equity"');
    expect(markdown).not.toContain('###');
  });

  it('reports success with the title and object id', async () => {
    await expect(saveJob(capture, deps())).resolves.toEqual({
      status: 'saved',
      title: 'RevenueCat - FS/Product',
      objectId: 'obj-9',
    });
  });

  it('reports an error when nothing could be read from the tab', async () => {
    const d = deps();
    await expect(saveJob(null, d)).resolves.toEqual({
      status: 'error',
      message: expect.stringMatching(/couldn't read this page/i),
    });
    expect(d.extract).not.toHaveBeenCalled();
  });

  it('reports an error when the page has almost no text', async () => {
    const result = await saveJob({ ...capture, text: 'Loading...' }, deps());
    expect(result).toEqual({ status: 'error', message: expect.stringMatching(/couldn't read this page/i) });
  });

  it('reports extraction failures without creating anything', async () => {
    const d = deps({ extract: vi.fn().mockRejectedValue(new Error('Claude declined to read this page.')) });
    await expect(saveJob(capture, d)).resolves.toEqual({
      status: 'error',
      message: 'Claude declined to read this page.',
    });
    expect(d.create).not.toHaveBeenCalled();
  });

  it('reports Capacities failures', async () => {
    const d = deps({ create: vi.fn().mockRejectedValue(new Error('Capacities error 400: bad')) });
    await expect(saveJob(capture, d)).resolves.toEqual({ status: 'error', message: 'Capacities error 400: bad' });
  });

  describe('body sections', () => {
    const grafana: PageCapture = {
      ...capture,
      descriptionMarkdown: 'Grafana Labs is the company behind Grafana Cloud.\n\n## The opportunity\n\nBuild RUM.',
    };
    it('puts application reqs and the description each into their own section, and nothing else', async () => {
      const d = deps({
        extract: vi.fn().mockResolvedValue({
          ...fields,
          coverLetter: 'required',
          applicationQuestions: [{ question: 'Why Grafana?', required: true }],
        }),
      });
      await saveJob(grafana, d);
      expect(d.appendSection.mock.calls).toEqual([
        ['obj-9', 'applicationReqs', 'Cover letter (required)\n\n- Why Grafana?'],
        ['obj-9', 'jobDescription', grafana.descriptionMarkdown],
      ]);
      expect(d.create.mock.calls[0][0]).not.toContain('tags');
    });

    it('tags the job easy-apply when the form asks for nothing that takes work', async () => {
      const d = deps();
      await saveJob(grafana, d);
      expect(d.create.mock.calls[0][0]).toContain('tags: easy-apply');
      expect(d.appendSection.mock.calls[0]).toEqual(['obj-9', 'applicationReqs', 'No cover letter!']);
    });

    it("doesn't tag easy-apply when the form wasn't on the page", async () => {
      const d = deps();
      await saveJob({ ...grafana, applicationForm: { found: false, fields: [] } }, d);
      expect(d.create.mock.calls[0][0]).not.toContain('tags');
    });

    it('creates the object before appending to it', async () => {
      const d = deps();
      await saveJob(grafana, d);
      expect(d.create.mock.invocationCallOrder[0]).toBeLessThan(d.appendSection.mock.invocationCallOrder[0]);
    });

    it('says which section failed, and that the Job itself exists', async () => {
      const d = deps({ appendSection: vi.fn().mockRejectedValue(new Error('Capacities error 400: bad')) });
      await expect(saveJob(grafana, d)).resolves.toEqual({
        status: 'error',
        message: "Job created, but its Application Reqs couldn't be saved: Capacities error 400: bad",
      });
    });
  });
});
