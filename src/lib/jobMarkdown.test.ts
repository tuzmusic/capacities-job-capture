import { describe, expect, it } from 'vitest';
import { buildJobMarkdown, type JobDocInput } from './jobMarkdown.ts';

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

  it('lays out the body using the Job section template, in order', () => {
    const headings = body(buildJobMarkdown(base))
      .split('\n')
      .filter((l) => l.startsWith('### '));
    expect(headings).toEqual([
      '### 1st & 2nd Degree Contacts',
      '### Application Reqs',
      '### Interactions',
      '### Next Steps',
      '### Notes',
      '### Job Description',
    ]);
  });

  it('puts application reqs under their heading and the description last', () => {
    const b = body(buildJobMarkdown(base));
    expect(b).toContain('### Application Reqs\n\nOptional cover letter\n\n### Interactions');
    expect(b.endsWith('### Job Description\n\n## The Role\n\nBuild things.\n')).toBe(true);
  });

  it('leaves Application Reqs empty when unknown', () => {
    const b = body(buildJobMarkdown({ ...base, applicationReqs: null }));
    expect(b).toContain('### Application Reqs\n\n### Interactions');
  });

  it('demotes H1s in the description so they do not collide with the object title', () => {
    const b = body(buildJobMarkdown({ ...base, description: '# Senior Frontend Engineer\n\nText' }));
    expect(b).toContain('### Job Description\n\n## Senior Frontend Engineer\n\nText');
  });
});
