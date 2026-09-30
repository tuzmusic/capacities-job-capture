import { describe, expect, it, vi, type Mock } from 'vitest';
import type { JobFields } from './extractFields.ts';
import type { PageCapture } from './pageCapture.ts';
import { saveJob } from './saveJob.ts';

const capture: PageCapture = {
  url: 'https://jobs.ashbyhq.com/revenuecat/cf3c',
  title: 'RevenueCat',
  text: 'Senior Software Engineer, Product. RevenueCat makes building, analyzing, and growing mobile subscriptions easy. $227K',
  descriptionMarkdown: '## The Role\n\nShip.',
};

const fields: JobFields = {
  company: 'RevenueCat',
  title: 'RevenueCat - FS/Product',
  fullTitle: 'Senior Software Engineer, Product',
  salaryRange: '$227K + equity',
  applicationReqs: null,
};

function deps(overrides: { extract?: Mock; create?: Mock } = {}) {
  return {
    extract: vi.fn().mockResolvedValue(fields),
    create: vi.fn().mockResolvedValue({ id: 'obj-9' }),
    ...overrides,
  };
}

describe('saveJob', () => {
  it('extracts fields from the capture text, url, and title', async () => {
    const d = deps();
    await saveJob(capture, d);
    expect(d.extract).toHaveBeenCalledWith({ url: capture.url, title: capture.title, text: capture.text });
  });

  it('creates the object from markdown built with the AI fields and the verbatim description', async () => {
    const d = deps();
    await saveJob(capture, d);
    const markdown: string = d.create.mock.calls[0][0];
    expect(markdown).toContain('title: "RevenueCat - FS/Product"');
    expect(markdown).toContain(`position: "[Senior Software Engineer, Product](${capture.url})"`);
    expect(markdown).toContain('salaryRange: "$227K + equity"');
    expect(markdown).toContain('### Job Description\n\n## The Role\n\nShip.');
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
});
