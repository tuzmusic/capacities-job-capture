import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { capturePage, type PageCapture } from './pageCapture.ts';
import { pickBestCapture } from './pickBestCapture.ts';

const fixture = readFileSync(resolve(__dirname, '../../test/fixtures/greenhouse-like.html'), 'utf8');

function load(html: string, url = 'https://job-boards.greenhouse.io/postscript/jobs/8488222002') {
  document.documentElement.innerHTML = html.replace(/^[\s\S]*?<html>|<\/html>\s*$/g, '');
  return capturePage(document, url);
}

describe('capturePage', () => {
  beforeEach(() => {
    document.documentElement.innerHTML = '<head></head><body></body>';
  });

  it('returns the url it was given', () => {
    expect(load(fixture).url).toBe('https://job-boards.greenhouse.io/postscript/jobs/8488222002');
  });

  it('returns the full page text for the AI, including sections the description filter drops', () => {
    const { text } = load(fixture);
    expect(text).toContain('Senior Frontend Engineer');
    expect(text).toContain('$172,000 - $203,000');
    expect(text).toContain('Unlimited PTO');
  });

  it('converts the posting to markdown, keeping headings and lists', () => {
    const { descriptionMarkdown } = load(fixture);
    expect(descriptionMarkdown).toContain('## **Primary duties**');
    expect(descriptionMarkdown).toMatch(/^-\s+Build and maintain frontend experiences using \*\*React and TypeScript\*\*$/m);
    expect(descriptionMarkdown).toContain('Trusted by more than 18,000 Shopify stores');
  });

  it('drops benefits and EEO sections from the description but keeps compensation', () => {
    const { descriptionMarkdown } = load(fixture);
    expect(descriptionMarkdown).not.toContain('Unlimited PTO');
    expect(descriptionMarkdown).not.toContain('equal opportunity employer');
    expect(descriptionMarkdown).toContain('$172,000 - $203,000');
  });

  it('leaves out site chrome like nav and footer', () => {
    const { descriptionMarkdown } = load(fixture);
    expect(descriptionMarkdown).not.toContain('Log in');
    expect(descriptionMarkdown).not.toContain('Powered by Greenhouse');
  });

  it('does not mutate the live page', () => {
    load(fixture);
    expect(document.querySelector('nav')).not.toBeNull();
    expect(document.body.textContent).toContain('Powered by Greenhouse');
  });

  it('falls back to the whole body when the page is too thin for Readability', () => {
    const { descriptionMarkdown } = load('<body><p>Short job: write code.</p></body>');
    expect(descriptionMarkdown).toContain('Short job: write code.');
  });
});

describe('pickBestCapture', () => {
  const cap = (url: string, textLength: number): PageCapture => ({
    url,
    title: '',
    text: 'x'.repeat(textLength),
    descriptionMarkdown: '',
    applicationForm: { found: false, fields: [] },
    applyUrl: null,
  });

  it('picks the frame with the most text (e.g. an embedded ATS iframe over a thin careers shell)', () => {
    const shell = cap('https://acme.com/careers?gh_jid=1', 300);
    const iframe = cap('https://job-boards.greenhouse.io/embed/job_app?for=acme&token=1', 9000);
    expect(pickBestCapture([shell, iframe])).toBe(iframe);
  });

  it('ignores missing results from frames where capture failed', () => {
    const only = cap('https://a.com', 10);
    expect(pickBestCapture([null, undefined, only])).toBe(only);
  });

  it('borrows the application form from another frame when the posting frame has none', () => {
    const posting = cap('https://acme.com/careers/1', 9000);
    const form = { found: true, fields: [{ kind: 'long text' as const, label: 'Why us?', required: true }] };
    const formFrame = { ...cap('https://boards.greenhouse.io/embed/job_app', 300), applicationForm: form };
    expect(pickBestCapture([posting, formFrame])).toEqual({ ...posting, applicationForm: form });
  });

  it('borrows an apply link from another frame when the posting frame has neither form nor link', () => {
    const posting = cap('https://acme.com/careers/1', 9000);
    const other = { ...cap('https://acme.com/widget', 300), applyUrl: 'https://acme.com/apply/1' };
    expect(pickBestCapture([posting, other])?.applyUrl).toBe('https://acme.com/apply/1');
  });

  it('returns null when nothing was captured', () => {
    expect(pickBestCapture([null])).toBeNull();
  });
});
