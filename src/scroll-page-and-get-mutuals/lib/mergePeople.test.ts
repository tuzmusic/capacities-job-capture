import { describe, expect, it } from 'vitest';
import { mergePeople } from './mergePeople.ts';
import type { Person } from './peoplePage.ts';

const p = (slug: string, degree: Person['degree'], mutuals: string[] = [], name = slug): Person => ({
  name,
  title: 'Engineer',
  url: `https://www.linkedin.com/in/${slug}/`,
  degree,
  mutuals,
});

describe('mergePeople', () => {
  it('keeps people-page order, adds the people only search found, and takes search’s full mutual names', () => {
    const merged = mergePeople(
      [p('ann', '2', ['Mitesh']), p('bo', '2', ['Tyler'])],
      [p('cy', '2', ['Mitesh Kumar']), p('ann', '2', ['Mitesh Kumar'])],
    );
    expect(merged.map((m) => [m.name, m.mutuals])).toEqual([
      ['ann', ['Mitesh Kumar']],
      ['bo', ['Tyler']],
      ['cy', ['Mitesh Kumar']],
    ]);
  });

  it('matches profiles however the URL is written', () => {
    const merged = mergePeople([p('Ann', '2', ['Pat'])], [{ ...p('ann', '2', ['Pat Smith']), url: 'https://www.linkedin.com/in/ann' }]);
    expect(merged).toHaveLength(1);
  });

  it('keeps the people page’s mutuals when search shows none', () => {
    expect(mergePeople([p('ann', '2', ['Pat Smith'])], [p('ann', '2')])[0].mutuals).toEqual(['Pat Smith']);
  });

  it('fills in a first name only when one full name fits, including your 1st-degree people', () => {
    const merged = mergePeople(
      [p('ann', '2', ['Mitesh']), p('bo', '2', ['Sam']), p('cy', '2', ['Tristan']), p('tb', '1', [], 'Tristan Burgess')],
      [p('di', '2', ['Mitesh Kumar', 'Sam Lee']), p('ed', '2', ['Sam Oh'])],
    );
    const mutuals = Object.fromEntries(merged.map((m) => [m.name, m.mutuals]));
    expect(mutuals.ann).toEqual(['Mitesh Kumar']);
    expect(mutuals.bo).toEqual(['Sam']); // Sam Lee or Sam Oh: can't tell
    expect(mutuals.cy).toEqual(['Tristan Burgess']);
  });
});
