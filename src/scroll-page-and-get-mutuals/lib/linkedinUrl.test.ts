import { describe, expect, it } from 'vitest';
import { engineeringPeopleTarget, peopleSearchUrl, slugToName } from './linkedinUrl.ts';

const ENG = 'https://www.linkedin.com/company/grafana-labs/people/?facetCurrentFunction=8';

describe('engineeringPeopleTarget', () => {
  it('goes from a company page to its Engineering people', () => {
    for (const href of [
      'https://www.linkedin.com/company/grafana-labs/',
      'https://www.linkedin.com/company/grafana-labs',
      'https://www.linkedin.com/company/grafana-labs/jobs/?foo=1',
      'https://www.linkedin.com/company/grafana-labs/people/',
      'https://www.linkedin.com/company/grafana-labs/people/?facetCurrentFunction=25',
    ]) {
      expect(engineeringPeopleTarget(href)).toEqual({ kind: 'navigate', slug: 'grafana-labs', url: ENG });
    }
  });

  it('stays put when already there', () => {
    expect(engineeringPeopleTarget(ENG)).toEqual({ kind: 'here', slug: 'grafana-labs' });
    expect(engineeringPeopleTarget(`${ENG}&keywords=react`)).toEqual({ kind: 'here', slug: 'grafana-labs' });
  });

  it('rejects anything that is not a LinkedIn company page', () => {
    for (const href of [
      'https://www.linkedin.com/in/someone/',
      'https://www.linkedin.com/feed/',
      'https://example.com/company/grafana-labs/',
      'https://notlinkedin.com/company/x/',
      'chrome://extensions',
      '',
    ]) {
      expect(engineeringPeopleTarget(href)).toEqual({ kind: 'not-company' });
    }
  });
});

describe('slugToName', () => {
  it('title-cases the slug', () => {
    expect(slugToName('grafana-labs')).toBe('Grafana Labs');
  });
});

describe('peopleSearchUrl', () => {
  it('searches your 1st and 2nd degree at the company id for engineers, by page', () => {
    const url = new URL(peopleSearchUrl('11062162', 3));
    expect(url.origin + url.pathname).toBe('https://www.linkedin.com/search/results/people/');
    expect(url.searchParams.get('currentCompany')).toBe('["11062162"]');
    expect(url.searchParams.get('network')).toBe('["F","S"]');
    expect(url.searchParams.get('keywords')).toBe('engineer');
    expect(url.searchParams.get('page')).toBe('3');
  });
});
