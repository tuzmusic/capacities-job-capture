import { describe, expect, it } from 'vitest';
import { buildMutualsMarkdown, contactsAlreadyIn, NO_CONTACTS } from './mutualsMarkdown.ts';
import type { Person } from './peoplePage.ts';

const p = (name: string, degree: Person['degree'], mutuals: string[] = [], title = 'Engineer'): Person => ({
  name,
  title,
  url: `https://www.linkedin.com/in/${name.toLowerCase().replace(/\W/g, '')}`,
  degree,
  mutuals,
});

describe('buildMutualsMarkdown', () => {
  it('groups 2nd-degree people under each mutual connection, listing them under every one', () => {
    const { markdown, secondDegree, firstDegree } = buildMutualsMarkdown(
      [p('Ann', '2', ['Pat Smith']), p('Bo', '3+'), p('Cy', '2', ['Lou', 'Pat Smith']), p('Di', '2', ['Pat Smith'], ''), p('Ed', '2')],
      { complete: true },
    );
    expect(markdown).toBe(
      [
        '- Pat Smith',
        '  - [Ann](https://www.linkedin.com/in/ann) - Engineer',
        '  - [Cy](https://www.linkedin.com/in/cy) - Engineer',
        '  - [Di](https://www.linkedin.com/in/di)',
        '- Lou',
        '  - [Cy](https://www.linkedin.com/in/cy) - Engineer',
      ].join('\n'),
    );
    expect(secondDegree).toBe(3);
    expect(firstDegree).toBe(0);
  });

  it('puts 1st and 2nd degree under their own bullets when there are 1st-degree people', () => {
    const { markdown, firstDegree } = buildMutualsMarkdown([p('Ann', '1'), p('Cy', '2', ['Lou'])], { complete: true });
    expect(markdown).toBe(
      [
        '- 1st degree',
        '  - [Ann](https://www.linkedin.com/in/ann) - Engineer',
        '- 2nd degree',
        '  - Lou',
        '    - [Cy](https://www.linkedin.com/in/cy) - Engineer',
      ].join('\n'),
    );
    expect(markdown).not.toContain('#');
    expect(firstDegree).toBe(1);
  });

  it('leaves out 2nd-degree people you only reach through someone at the company', () => {
    const { markdown, secondDegree } = buildMutualsMarkdown(
      [p('Ann Lee', '1'), p('Cy', '2', ['Ann Lee']), p('Di', '2', ['ann  lee', 'Lou'])],
      { complete: true },
    );
    expect(markdown).toBe(
      [
        '- 1st degree',
        '  - [Ann Lee](https://www.linkedin.com/in/annlee) - Engineer',
        '- 2nd degree',
        '  - Lou',
        '    - [Di](https://www.linkedin.com/in/di) - Engineer',
      ].join('\n'),
    );
    expect(secondDegree).toBe(1);
  });

  it('drops the 2nd degree bullet when everyone left is reached through the company', () => {
    const { markdown } = buildMutualsMarkdown([p('Ann', '1'), p('Cy', '2', ['Ann'])], { complete: true });
    expect(markdown).toBe('- 1st degree\n  - [Ann](https://www.linkedin.com/in/ann) - Engineer');
  });

  it('says so when there are none, and when the list may be incomplete', () => {
    const { markdown } = buildMutualsMarkdown([p('Bo', '3+')], { complete: false });
    expect(markdown).toContain(NO_CONTACTS);
    expect(markdown).toContain('stopped loading after 1 person');
  });

  it('escapes brackets in names', () => {
    expect(buildMutualsMarkdown([p('A [she/her]', '2', ['B'])], { complete: true }).markdown).toContain('[A \\[she/her\\]]');
  });

  it('puts the mutual with the most connections first', () => {
    const { markdown } = buildMutualsMarkdown([p('Ann', '2', ['Lou']), p('Cy', '2', ['Pat']), p('Di', '2', ['Pat'])], {
      complete: true,
    });
    expect(markdown.indexOf('- Pat')).toBeLessThan(markdown.indexOf('- Lou'));
  });
});

describe('contactsAlreadyIn', () => {
  const ours = buildMutualsMarkdown([p('Ann', '2', ['Pat']), p('Cy', '2', ['Pat']), p('Di', '1')], { complete: true }).markdown;

  it('counts our profiles that the note already has, however Capacities rewrote the markdown', () => {
    const note = '### 1st & 2nd Degree Contacts\n\n- Pat ()\n\n    - [Ann](https://www.linkedin.com/in/Ann/) - Engineer\n';
    expect(contactsAlreadyIn(ours, note)).toEqual({ listed: 3, present: 1 });
  });

  it('finds none in a fresh note', () => {
    expect(contactsAlreadyIn(ours, '### 1st & 2nd Degree Contacts\n\n')).toEqual({ listed: 3, present: 0 });
  });
});
