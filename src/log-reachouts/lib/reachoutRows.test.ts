import { describe, expect, it } from 'vitest';
import {
  companyFromTitle,
  companyPage,
  hyperlink,
  mostCommon,
  nameFromTitle,
  profileUrl,
  slugToName,
  toHtml,
  sheetDate, toRow, toTsv } from './reachoutRows.ts';

describe('profileUrl', () => {
  it('keeps just the profile, without the query string', () => {
    expect(profileUrl('https://www.linkedin.com/in/levonmk/?isSelfProfile=false')).toBe(
      'https://www.linkedin.com/in/levonmk/',
    );
    expect(profileUrl('https://linkedin.com/in/levonmk/details/experience/')).toBe(
      'https://www.linkedin.com/in/levonmk/',
    );
  });

  it('skips anything that is not someone else’s profile', () => {
    for (const href of [
      'https://www.linkedin.com/in/me/',
      'https://www.linkedin.com/company/sardine/',
      'https://www.linkedin.com/feed/',
      'https://example.com/in/levonmk/',
      'chrome://newtab/',
      '',
    ]) {
      expect(profileUrl(href)).toBeNull();
    }
  });
});

describe('rows', () => {
  it('matches the sheet: Company | Name link | Role | Date | Notes | Type', () => {
    const row = toRow(
      { url: 'https://www.linkedin.com/in/levonmk/', name: 'Levon Mkrtchyan', company: 'Stripe' },
      { company: 'Sardine', type: 'Message', note: 'thanks for the intro' },
      '10/9/2026',
    );
    expect(toTsv([row])).toBe(
      'Sardine\t=HYPERLINK("https://www.linkedin.com/in/levonmk/","Levon Mkrtchyan")\t\t10/9/2026\tthanks for the intro\tMessage',
    );
  });

  it('uses each person\'s own company when the run has none', () => {
    const row = toRow({ url: 'https://x/', name: 'A', company: 'Stripe' }, { type: 'Message', note: '' }, '10/9/2026');
    expect(row[0]).toBe('Stripe');
    expect(toHtml([{ url: 'https://x/', name: 'A', company: 'A&B' }], { type: 'T', note: '' }, 'd')).toContain(
      '<tr><td>A&amp;B</td>',
    );
  });

  it('escapes quotes in the formula and keeps each row on one line', () => {
    expect(hyperlink('https://x/', 'Ben "Builder" Kramer')).toBe('=HYPERLINK("https://x/","Ben ""Builder"" Kramer")');
    expect(toTsv([['a\tb', 'c\nd'], ['e', 'f']])).toBe('a b\tc d\ne\tf');
  });

  it('formats dates like the sheet', () => {
    expect(sheetDate(new Date(2026, 9, 9))).toBe('10/9/2026');
  });

});

describe('nameFromTitle', () => {
  it('drops the notification count and " | LinkedIn"', () => {
    expect(nameFromTitle('(12) Levon Mkrtchyan | LinkedIn')).toBe('Levon Mkrtchyan');
  });
});

describe('the company', () => {
  it('knows a company page, and whether it is People', () => {
    expect(companyPage('https://www.linkedin.com/company/sardine-ai/people/?facetCurrentFunction=8')).toEqual({
      slug: 'sardine-ai',
      people: true,
    });
    expect(companyPage('https://www.linkedin.com/company/sardine-ai/')).toEqual({ slug: 'sardine-ai', people: false });
    expect(companyPage('https://www.linkedin.com/in/levonmk/')).toBeNull();
  });

  it('reads the name from the tab title', () => {
    expect(companyFromTitle('(2) Sardine: People | LinkedIn')).toBe('Sardine');
    expect(companyFromTitle('People | Grafana Labs | LinkedIn')).toBe('Grafana Labs');
    expect(companyFromTitle('LinkedIn')).toBe('');
  });

  it('falls back on the slug', () => {
    expect(slugToName('sardine-ai')).toBe('Sardine Ai');
  });

  it('picks the company most profiles name', () => {
    expect(mostCommon(['Sardine', '', 'Stripe', 'Sardine'])).toBe('Sardine');
    expect(mostCommon(['', ''])).toBe('');
  });
});

describe('toHtml', () => {
  it('makes a table with a real link for the name, escaped', () => {
    const html = toHtml([{ url: 'https://www.linkedin.com/in/a/', name: 'Ben <B> & "Co"', company: '' }],
      { company: '{company}', type: '{type}', note: '{note}' },
      '10/14/2026',
    );
    expect(html).toBe(
      '<meta charset="utf-8"><table><tr><td>{company}</td>' +
        '<td><a href="https://www.linkedin.com/in/a/">Ben &lt;B&gt; &amp; &quot;Co&quot;</a></td>' +
        '<td></td><td>10/14/2026</td><td>{note}</td><td>{type}</td></tr></table>',
    );
  });
});
