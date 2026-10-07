import { describe, expect, it } from 'vitest';
import { engineeringPeopleTarget, slugToName } from './linkedinUrl.ts';

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
