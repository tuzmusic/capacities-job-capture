import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { countJobLinks, notAJobListing, pageKindFromUrl } from './listingCheck.ts';
import { capturePage, type PageCapture } from './pageCapture.ts';

const posting =
  'Senior Frontend Engineer. About the role: you will build things. Responsibilities: ship. Requirements: 5+ years of ' +
  'React experience. Nice to have: TypeScript. Salary: $172,000 - $203,000.';

const capture = (over: Partial<PageCapture> = {}): PageCapture => ({
  url: 'https://acme.com/careers/senior-frontend-engineer',
  title: 'Senior Frontend Engineer',
  text: posting,
  descriptionMarkdown: '',
  applicationForm: { found: false, fields: [] },
  applyUrl: null,
  applyButton: false,
  jobLinks: 0,
  ...over,
});

function load(html: string, url: string) {
  document.documentElement.innerHTML = html.replace(/^[\s\S]*?<html[^>]*>|<\/html>\s*$/g, '');
  return capturePage(document, url);
}

describe('notAJobListing', () => {
  it('lets a posting through', () => {
    expect(notAJobListing(capture())).toBeNull();
  });

  it('lets the real posting fixtures through', () => {
    for (const [file, url] of [
      ['greenhouse-like.html', 'https://job-boards.greenhouse.io/postscript/jobs/8488222002'],
      ['greenhouse-eeo-survey.html', 'https://job-boards.greenhouse.io/happymoney/jobs/4431029009'],
    ]) {
      const html = readFileSync(resolve(__dirname, '../../../test/fixtures', file), 'utf8');
      expect(notAJobListing(load(html, url)), file).toBeNull();
    }
  });

  it('flags pages that read nothing like a job description', () => {
    expect(notAJobListing(capture({ text: 'Welcome to our blog. Here are some thoughts about gardening.' }))).toMatch(
      /doesn't read like a job description/,
    );
  });

  it('flags a list of jobs', () => {
    const list = capture({ text: 'Open roles. Engineering: Senior Engineer, Staff Engineer. Salary info on request.', jobLinks: 12 });
    expect(notAJobListing(list)).toMatch(/list of 12 jobs/);
  });

  it('lets a posting with a "similar jobs" sidebar through', () => {
    expect(notAJobListing(capture({ jobLinks: 12 }))).toBeNull();
  });

  it('trusts an application form over thin text', () => {
    const withForm = capture({ text: 'Apply', applicationForm: { found: true, fields: [] } });
    expect(notAJobListing(withForm)).toBeNull();
  });

  it('goes by the URL first, whatever the page says', () => {
    expect(notAJobListing(capture({ url: 'https://www.linkedin.com/in/someone/' }))).toBe(
      'This looks like a LinkedIn profile, not a job posting.',
    );
  });
});

describe('pageKindFromUrl', () => {
  it.each([
    ['https://www.google.com/search?q=frontend+jobs', 'a Google search'],
    ['https://www.google.co.uk/search?q=x', 'a Google search'],
    ['https://www.linkedin.com/in/jane-doe/', 'a LinkedIn profile'],
    ['https://www.linkedin.com/company/acme/jobs/', 'a LinkedIn company page'],
    ['https://www.linkedin.com/jobs/search/?keywords=react', 'a list of LinkedIn jobs'],
    ['https://www.linkedin.com/feed/', 'a LinkedIn page'],
    ['https://job-boards.greenhouse.io/postscript', 'a list of openings'],
    ['https://jobs.lever.co/acme/', 'a list of openings'],
    ['https://jobs.ashbyhq.com/revenuecat', 'a list of openings'],
  ])('%s is %s', (url, kind) => {
    expect(pageKindFromUrl(url)).toBe(kind);
  });

  it.each([
    'https://www.linkedin.com/jobs/view/4012345678/',
    'https://www.linkedin.com/jobs/search/?currentJobId=4012345678&keywords=react',
    'https://job-boards.greenhouse.io/postscript/jobs/8488222002',
    'https://boards.greenhouse.io/postscript?gh_jid=8488222002',
    'https://jobs.lever.co/acme/0f6a1c2e-1111-2222-3333-444455556666',
    'https://jobs.ashbyhq.com/revenuecat/cf3c0b1e-1111-2222-3333-444455556666',
    'https://acme.com/careers',
    'not a url',
  ])('says nothing about %s', (url) => {
    expect(pageKindFromUrl(url)).toBeNull();
  });
});

describe('countJobLinks', () => {
  it('counts distinct links to postings, other than this page', () => {
    document.body.innerHTML = `
      <a href="/careers/senior-engineer">Senior Engineer</a>
      <a href="/careers/senior-engineer#apply">Senior Engineer again</a>
      <a href="/careers/staff-engineer">Staff Engineer</a>
      <a href="https://boards.greenhouse.io/acme?gh_jid=123">Designer</a>
      <a href="/careers">All jobs</a>
      <a href="/about">About</a>
      <a href="/careers/here">This one</a>`;
    expect(countJobLinks(document, 'https://acme.com/careers/here')).toBe(3);
  });
});
