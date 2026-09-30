import { describe, expect, it } from 'vitest';
import { buildJobMarkdown, buildJobSections, type JobDocInput } from './jobMarkdown.ts';

const base: JobDocInput = {
  title: 'Postscript - Sr FE',
  fullTitle: 'Senior Frontend Engineer',
  url: 'https://job-boards.greenhouse.io/postscript/jobs/8488222002',
  salaryRange: '$172K–$203K',
  applicationReqs: 'Optional cover letter',
  description: '## The Role\n\nBuild things.',
};

function frontmatter(doc: string): string {
  const m = doc.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) throw new Error('no frontmatter');
  return m[1];
}

function body(doc: string): string {
  return doc.replace(/^---\n[\s\S]*?\n---\n/, '');
}

describe('buildJobMarkdown', () => {
  it('writes title, status, position link, and salary as frontmatter', () => {
    const fm = frontmatter(buildJobMarkdown(base));
    expect(fm.split('\n')).toEqual([
      'title: "Postscript - Sr FE"',
      'status: "Info Gathering"',
      'position: "[Senior Frontend Engineer](https://job-boards.greenhouse.io/postscript/jobs/8488222002)"',
      'salaryRange: "$172K–$203K"',
    ]);
  });

  it('omits salaryRange when there is none', () => {
    const fm = frontmatter(buildJobMarkdown({ ...base, salaryRange: null }));
    expect(fm).not.toContain('salaryRange');
  });

  it('escapes quotes and backslashes so the YAML stays valid', () => {
    const fm = frontmatter(buildJobMarkdown({ ...base, title: 'Acme - "Staff" Eng \\ UI' }));
    expect(fm).toContain('title: "Acme - \\"Staff\\" Eng \\\\ UI"');
  });

  it('escapes brackets in the position link text', () => {
    const fm = frontmatter(buildJobMarkdown({ ...base, fullTitle: 'Engineer [Remote]' }));
    expect(fm).toContain('position: "[Engineer \\\\[Remote\\\\]](');
  });

  it('writes no body, so nothing lands in the first section', () => {
    const doc = buildJobMarkdown(base);
    expect(body(doc).trim()).toBe('');
    expect(doc).not.toContain('###');
    expect(doc).not.toContain('Optional cover letter');
    expect(doc).not.toContain('Build things');
  });
});

describe('buildJobSections', () => {
  it('returns application reqs and the description separately', () => {
    expect(buildJobSections(base)).toEqual({
      applicationReqs: 'Optional cover letter',
      jobDescription: '## The Role\n\nBuild things.',
    });
  });

  it('omits application reqs when unknown or blank', () => {
    expect(buildJobSections({ ...base, applicationReqs: null })).not.toHaveProperty('applicationReqs');
    expect(buildJobSections({ ...base, applicationReqs: '  \n ' })).not.toHaveProperty('applicationReqs');
  });

  it('omits the description when empty', () => {
    expect(buildJobSections({ ...base, description: '  ' })).not.toHaveProperty('jobDescription');
  });

  it('demotes H1s in the description so they do not collide with the object title', () => {
    const s = buildJobSections({ ...base, description: '# Senior Frontend Engineer\n\nText' });
    expect(s.jobDescription).toBe('## Senior Frontend Engineer\n\nText');
  });
});
