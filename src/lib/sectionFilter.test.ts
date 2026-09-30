import { describe, expect, it } from 'vitest';
import { filterSections } from './sectionFilter.ts';

const md = (...lines: string[]) => lines.join('\n');

describe('filterSections', () => {
  it('keeps a description with no unwanted sections unchanged', () => {
    const input = md('## About the Role', '', 'Build things.', '', '## Requirements', '', '- TypeScript');
    expect(filterSections(input)).toBe(input);
  });

  it('drops a markdown-heading benefits section up to the next heading of the same level', () => {
    const input = md(
      '## About the Role', '', 'Build things.', '',
      '## Benefits', '', '- Free lunch', '- 401k', '',
      '## Requirements', '', '- TypeScript',
    );
    expect(filterSections(input)).toBe(
      md('## About the Role', '', 'Build things.', '', '## Requirements', '', '- TypeScript'),
    );
  });

  it('drops subsections nested under a dropped heading', () => {
    const input = md(
      '## Perks', '', '### Health', '', 'Dental.', '', '### Time off', '', 'Unlimited PTO.', '',
      '## Requirements', '', '- TypeScript',
    );
    expect(filterSections(input)).toBe(md('## Requirements', '', '- TypeScript'));
  });

  it('drops a section introduced by a bold-only line (common pseudo-heading)', () => {
    const input = md(
      '**What you will do**', '', 'Ship features.', '',
      '**What we offer**', '', '- Equity', '- Remote stipend', '',
      '**Qualifications**', '', '- 5 years React',
    );
    expect(filterSections(input)).toBe(
      md('**What you will do**', '', 'Ship features.', '', '**Qualifications**', '', '- 5 years React'),
    );
  });

  it('handles headings that wrap bold, like "## **Benefits**"', () => {
    const input = md('## **Why Join Us?**', '', 'We are great.', '', '## **The Role**', '', 'Code.');
    expect(filterSections(input)).toBe(md('## **The Role**', '', 'Code.'));
  });

  it.each([
    'Benefits',
    'Compensation & Benefits',
    'Perks',
    'Perks and Benefits',
    'What We Offer',
    "What we'll offer you",
    'Why Join Us',
    'Why work at Acme?',
    "Why you'll love working here",
    'Our Values',
    'Life at Acme',
    'Equal Opportunity Employer',
    'EEO Statement',
    'Accommodations',
    'Privacy Notice',
    'Come work with us!',
    'Come join us',
    "How we're different",
    'Working at Acme',
  ])('drops a section headed "%s"', (heading) => {
    const input = md(`## ${heading}`, '', 'fluff', '', '## Requirements', '', 'real');
    expect(filterSections(input)).toBe(md('## Requirements', '', 'real'));
  });

  it.each(['About the Role', 'About Us', 'Compensation', 'Pay Range', 'Requirements', 'What you will do'])(
    'keeps a section headed "%s"',
    (heading) => {
      const input = md(`## ${heading}`, '', 'content');
      expect(filterSections(input)).toBe(input);
    },
  );

  it('keeps unheaded intro text before the first heading', () => {
    const input = md('Acme makes rockets.', '', '## Benefits', '', 'Gym.');
    expect(filterSections(input)).toBe('Acme makes rockets.');
  });

  it('drops a trailing unwanted section at the end of the document', () => {
    const input = md('## The Role', '', 'Code.', '', '## Equal Opportunity', '', 'We are an EOE.');
    expect(filterSections(input)).toBe(md('## The Role', '', 'Code.'));
  });

  it('does not treat a bold phrase inside a paragraph as a heading', () => {
    const input = md('## The Role', '', 'You get **benefits** from shipping fast.');
    expect(filterSections(input)).toBe(input);
  });
});
