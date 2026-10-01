import { describe, expect, it } from 'vitest';
import { buildJobMarkdown, buildJobSections, formatApplicationReqs, isEasyApply, type ApplicationReqs, type JobDocInput } from './jobMarkdown.ts';

const base: JobDocInput = {
  title: 'Postscript - Sr FE',
  fullTitle: 'Senior Frontend Engineer',
  url: 'https://job-boards.greenhouse.io/postscript/jobs/8488222002',
  salaryRange: '$172K–$203K',
  application: { coverLetter: 'optional', questions: [{ question: 'Why Postscript?', required: true }], formFound: true },
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
    expect(doc).not.toContain('Why Postscript?');
    expect(doc).not.toContain('Build things');
  });
});

describe('buildJobSections', () => {
  it('returns application reqs and the description separately', () => {
    expect(buildJobSections(base)).toEqual({
      applicationReqs: 'Optional cover letter\n\n- Why Postscript?',
      jobDescription: '## The Role\n\nBuild things.',
    });
  });

  it('always fills application reqs, even with nothing to do', () => {
    const s = buildJobSections({ ...base, application: { coverLetter: 'none', questions: [], formFound: true } });
    expect(s.applicationReqs).toBe('No cover letter!');
  });

  it('omits the description when empty', () => {
    expect(buildJobSections({ ...base, description: '  ' })).not.toHaveProperty('jobDescription');
  });

  it('demotes H1s in the description so they do not collide with the object title', () => {
    const s = buildJobSections({ ...base, description: '# Senior Frontend Engineer\n\nText' });
    expect(s.jobDescription).toBe('## Senior Frontend Engineer\n\nText');
  });
});

const reqs = (over: Partial<ApplicationReqs> = {}): ApplicationReqs => ({
  coverLetter: 'none',
  questions: [],
  formFound: true,
  ...over,
});

describe('formatApplicationReqs', () => {
  it('always starts with one of the three cover letter lines', () => {
    expect(formatApplicationReqs(reqs({ coverLetter: 'required' }))).toBe('Cover letter (required)');
    expect(formatApplicationReqs(reqs({ coverLetter: 'optional' }))).toBe('Optional cover letter');
    expect(formatApplicationReqs(reqs({ coverLetter: 'none' }))).toBe('No cover letter!');
  });

  it('lists the questions, marking optional ones', () => {
    const md = formatApplicationReqs(
      reqs({
        questions: [
          { question: 'Why us?', required: true },
          { question: 'Link a project you are proud of', required: false },
        ],
      }),
    );
    expect(md).toBe('No cover letter!\n\n- Why us?\n- Link a project you are proud of _(optional)_');
  });

  it('warns when the application form could not be read', () => {
    expect(formatApplicationReqs(reqs({ formFound: false }))).toBe(
      "No cover letter!\n\n_Couldn't read the application form, so there may be more. Check before applying._",
    );
  });

  it('says why the form could not be read, when known', () => {
    expect(formatApplicationReqs(reqs({ formFound: false, formNote: 'needs login' }))).toContain(
      "_Couldn't read the application form (needs login), so",
    );
  });
});

describe('easy-apply tag', () => {
  const fm = (application: ApplicationReqs) => frontmatter(buildJobMarkdown({ ...base, application }));

  it('tags the job easy-apply when nothing is required, as a plain unquoted tag name', () => {
    expect(fm(reqs())).toContain('\ntags: easy-apply');
  });

  it('still counts as easy-apply with an optional cover letter', () => {
    expect(isEasyApply(reqs({ coverLetter: 'optional' }))).toBe(true);
  });

  it('is not easy-apply with an optional question', () => {
    expect(isEasyApply(reqs({ questions: [{ question: 'Anything to add?', required: false }] }))).toBe(false);
  });

  it('is not easy-apply with a required cover letter', () => {
    expect(isEasyApply(reqs({ coverLetter: 'required' }))).toBe(false);
    expect(fm(reqs({ coverLetter: 'required' }))).not.toContain('tags');
  });

  it('is not easy-apply with a required question', () => {
    expect(isEasyApply(reqs({ questions: [{ question: 'Why us?', required: true }] }))).toBe(false);
  });

  it("is not easy-apply when the form wasn't on the page, since we can't tell", () => {
    expect(isEasyApply(reqs({ formFound: false }))).toBe(false);
  });
});
