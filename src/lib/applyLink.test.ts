import { beforeEach, describe, expect, it } from 'vitest';
import { findApplyUrl } from './applyLink.ts';

const LEVER = 'https://jobs.lever.co/acme/1b2c3d4e-5f60-7a8b-9c0d-1e2f3a4b5c6d';
const ASHBY = 'https://jobs.ashbyhq.com/acme/1b2c3d4e-5f60-7a8b-9c0d-1e2f3a4b5c6d';

function find(html: string, url = 'https://acme.com/careers/staff-engineer') {
  document.body.innerHTML = html;
  return findApplyUrl(document, url);
}

describe('findApplyUrl', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it("goes to Lever's /apply page", () => {
    expect(find('', LEVER)).toBe(`${LEVER}/apply`);
    expect(find('', `${LEVER}/?lever-source=LinkedIn`)).toBe(`${LEVER}/apply`);
  });

  it("goes to Ashby's Application tab", () => {
    expect(find('', ASHBY)).toBe(`${ASHBY}/application`);
  });

  it('hands Greenhouse job URLs straight to the API lookup', () => {
    const gh = 'https://job-boards.greenhouse.io/gitlab/jobs/8556658002';
    expect(find('', gh)).toBe(gh);
  });

  it("follows the page's Apply link, resolving relative hrefs", () => {
    expect(find('<a href="/careers/staff-engineer/apply">Apply now</a>')).toBe('https://acme.com/careers/staff-engineer/apply');
    expect(find('<a href="https://boards.greenhouse.io/acme/jobs/123">Apply for this job</a>')).toBe(
      'https://boards.greenhouse.io/acme/jobs/123',
    );
  });

  it('ignores links that are not an apply button, point back at this page, or go to a job board', () => {
    expect(
      find(`
        <a href="/how-we-hire">How to apply to Acme</a>
        <a href="#apply">Apply</a>
        <a href="https://acme.com/careers/staff-engineer/">Apply</a>
        <a href="https://www.linkedin.com/jobs/view/1">Apply</a>
        <a href="mailto:jobs@acme.com">Apply</a>`),
    ).toBeNull();
  });
});
