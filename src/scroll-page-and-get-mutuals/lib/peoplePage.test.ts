import { beforeEach, describe, expect, it } from 'vitest';
import {
  cleanTitle,
  parseMutuals,
  readCompanyId,
  readCompanyName,
  readDegree,
  scrapePeople,
} from './peoplePage.ts';

/** Shaped like LinkedIn's org people cards (Oct 2026), with the whitespace its templates leave in. */
const card = ({ name, slug, degree, headline, mutual }: Record<string, string>) => `
  <li class="org-people-profile-card__card-spacing">
    <section class="artdeco-card">
      <div class="org-people-profile-card__profile-info">
        <div class="artdeco-entity-lockup">
          <a href="https://www.linkedin.com/in/${slug}?miniProfileUrn=abc" aria-label="View ${name}’s profile">
            <img alt="">
          </a>
          <div class="artdeco-entity-lockup__title">
            <a href="https://www.linkedin.com/in/${slug}?miniProfileUrn=abc">
              <div class="lt-line-clamp">
                ${name}
              </div>
            </a>
          </div>
          <div class="artdeco-entity-lockup__badge">
            <span class="artdeco-entity-lockup__degree">· ${degree}</span>
            <span class="visually-hidden">${degree} degree connection</span>
          </div>
          <div class="artdeco-entity-lockup__subtitle">
            <div class="lt-line-clamp">${headline}</div>
          </div>
        </div>
        ${mutual ? `<span class="t-12">${mutual}</span>` : ''}
      </div>
      <footer><button>Connect</button></footer>
    </section>
  </li>`;

function page(cards: string[]) {
  document.title = 'Grafana Labs: People | LinkedIn';
  document.body.innerHTML = `
    <main>
      <div class="org-top-card"><h1 class="org-top-card-summary__title"> Grafana Labs </h1></div>
      <ul>${cards.join('')}</ul>
    </main>`;
}

const jane = card({
  name: 'Jane Doe',
  slug: 'janedoe',
  degree: '2nd',
  headline: 'Senior Frontend Engineer at Grafana Labs (Loki)',
  mutual: '<strong>Pat Smith</strong> is a mutual connection',
});
const sam = card({ name: 'Sam Lee', slug: 'samlee', degree: '1st', headline: 'Engineering Manager @ Grafana', mutual: '' });
const kai = card({ name: 'Kai Wu', slug: 'kaiwu', degree: '3rd+', headline: 'Staff Engineer', mutual: '' });

describe('scrapePeople', () => {
  beforeEach(() => page([jane, sam, kai, jane]));

  it('reads name, cleaned title, profile url, degree, and mutual, once per person', () => {
    expect(scrapePeople(document, 'Grafana Labs')).toEqual([
      {
        name: 'Jane Doe',
        title: 'Senior Frontend Engineer',
        url: 'https://www.linkedin.com/in/janedoe',
        degree: '2',
        mutuals: ['Pat Smith'],
      },
      { name: 'Sam Lee', title: 'Engineering Manager', url: 'https://www.linkedin.com/in/samlee', degree: '1', mutuals: [] },
      { name: 'Kai Wu', title: 'Staff Engineer', url: 'https://www.linkedin.com/in/kaiwu', degree: '3+', mutuals: [] },
    ]);
  });

  it('skips out-of-network "LinkedIn Member" cards, which have no profile link', () => {
    page([
      '<li><div class="org-people-profile-card__profile-info"><div>LinkedIn Member</div><div>Engineer</div></div></li>',
      jane,
    ]);
    expect(scrapePeople(document, 'Grafana Labs').map((p) => p.name)).toEqual(['Jane Doe']);
  });

  it('falls back to list items with profile links when the card class changes', () => {
    document.body.innerHTML = `<main><ul>${jane.replaceAll('org-people-profile-card__profile-info', 'x')}</ul></main>`;
    expect(scrapePeople(document, 'Grafana Labs')).toMatchObject([{ name: 'Jane Doe', degree: '2', mutuals: ['Pat Smith'] }]);
  });

  it('reads the Nov 2026 layout: role=list children with obfuscated classes, skipping sidebar lists', () => {
    // No whitespace between the degree and the headline, like LinkedIn's: textContent reads "· 2ndPayments Engineer".
    const newCard = (name: string, slug: string, degree: string, rest: string) => `
      <div class="b6bax7"><div class="b6blr5">
        <a class="b6bikq" href="https://www.linkedin.com/in/${slug}/"><figure aria-hidden="true"></figure></a>
        <a href="https://www.linkedin.com/in/${slug}/"><p>${name}</p></a><span> · ${degree}</span>${rest}
        <button>Connect</button>
      </div></div>`;
    document.body.innerHTML = `
      <main>
        <div role="list">
          ${newCard('Jonathan Butler', 'jonathanbutler7', '2nd', '<p>Payments Engineer</p><p>Tristan is a mutual connection</p>')}
          ${newCard('Jace Maxfield', 'jacemaxfield', '3rd', '<p>Senior Software Engineer at Weave</p>')}
        </div>
        <aside><div role="list"><div><p>Anthropic</p><a href="https://www.linkedin.com/in/jeff/">Jeff</a> follows this page</div></div></aside>
      </main>`;
    expect(scrapePeople(document, 'Weave')).toEqual([
      {
        name: 'Jonathan Butler',
        title: 'Payments Engineer',
        url: 'https://www.linkedin.com/in/jonathanbutler7/',
        degree: '2',
        mutuals: ['Tristan'],
      },
      {
        name: 'Jace Maxfield',
        title: 'Senior Software Engineer',
        url: 'https://www.linkedin.com/in/jacemaxfield/',
        degree: '3+',
        mutuals: [],
      },
    ]);
  });
});

describe('readCompanyName', () => {
  it('reads the header', () => {
    page([]);
    expect(readCompanyName(document)).toBe('Grafana Labs');
  });

  it('falls back to the page title', () => {
    document.body.innerHTML = '';
    document.title = '(3) Grafana Labs: People | LinkedIn';
    expect(readCompanyName(document)).toBe('Grafana Labs');
    document.title = 'People | Grafana Labs | LinkedIn';
    expect(readCompanyName(document)).toBe('Grafana Labs');
  });
});

describe('search results', () => {
  it('skips the "open to work" badge when reading the headline', () => {
    document.body.innerHTML = `<main><div role="list"><div>
      <a href="https://www.linkedin.com/in/arunika/"><img alt=""><span>Arunika Yadav</span><span>is open to work</span></a>
      <a href="https://www.linkedin.com/in/arunika/">Arunika Yadav</a><span>• 2nd</span>
      <p>Senior Software Engineer at Weave</p><p>India</p><button>Connect</button>
      <p>Mitesh Kumar &amp; Pat Smith are mutual connections</p>
    </div></div></main>`;
    expect(scrapePeople(document, 'Weave')).toEqual([
      {
        name: 'Arunika Yadav',
        title: 'Senior Software Engineer',
        url: 'https://www.linkedin.com/in/arunika/',
        degree: '2',
        mutuals: ['Mitesh Kumar', 'Pat Smith'],
      },
    ]);
  });
});

describe('readCompanyId', () => {
  it('reads it from a link into people search', () => {
    document.body.innerHTML = `<main>
      <a href="https://www.linkedin.com/company/grafana-labs/about/">About</a>
      <a href="https://www.linkedin.com/search/results/people/?currentCompany=%5B%2211062162%22%5D&origin=COMPANY_PAGE">1K-5K employees</a>
    </main>`;
    expect(readCompanyId(document)).toBe('11062162');
  });

  it('is null without one', () => {
    document.body.innerHTML = '<main><a href="https://www.linkedin.com/search/results/people/?keywords=x">x</a></main>';
    expect(readCompanyId(document)).toBeNull();
  });
});

describe('parsing helpers', () => {
  it('parses the mutual line', () => {
    expect(parseMutuals('Pat Smith is a mutual connection')).toEqual(['Pat Smith']);
    expect(parseMutuals('Pat Smith and Lou Reed are mutual connections')).toEqual(['Pat Smith', 'Lou Reed']);
    expect(parseMutuals('Pat Smith, Lou Reed and 5 other mutual connections')).toEqual(['Pat Smith', 'Lou Reed']);
    expect(parseMutuals('Pat Smith, Lou Reed, and 5 other mutual connections')).toEqual(['Pat Smith', 'Lou Reed']);
    expect(parseMutuals('Pat Smith and 1 other mutual connection')).toEqual(['Pat Smith']);
    expect(parseMutuals('Pat Smith & Lou Reed are mutual connections')).toEqual(['Pat Smith', 'Lou Reed']);
    expect(parseMutuals('Pat Smith, Lou Reed & 4 other mutual connections')).toEqual(['Pat Smith', 'Lou Reed']);
    expect(parseMutuals('12 mutual connections')).toEqual([]);
  });

  it('drops card text that runs into the mutual line', () => {
    expect(parseMutuals('2K followers • Cory Lebson is a mutual connection')).toEqual(['Cory Lebson']);
    expect(parseMutuals('808 followers · Hilliary Turnipseed and Elizabeth Delaney Moore are mutual connections')).toEqual([
      'Hilliary Turnipseed',
      'Elizabeth Delaney Moore',
    ]);
    expect(parseMutuals('Sara Wenke (Hernandez) is a mutual connection')).toEqual(['Sara Wenke (Hernandez)']);
  });

  it('reads the degree', () => {
    expect(readDegree('Jane · 2nd 2nd degree connection')).toBe('2');
    expect(readDegree('Jane · 1st')).toBe('1');
    expect(readDegree('Jane · 3rd+')).toBe('3+');
    expect(readDegree('Jane')).toBe('3+');
  });

  it('cleans titles', () => {
    expect(cleanTitle('Senior Engineer at Grafana Labs', 'Grafana Labs')).toBe('Senior Engineer');
    expect(cleanTitle('Software Engineer @ Grafana | React, TypeScript', 'Grafana Labs')).toBe('Software Engineer');
    expect(cleanTitle('Grafana Labs engineer, frontend', 'Grafana Labs')).toBe('frontend');
    expect(cleanTitle('Staff Engineer (Platform)', 'Grafana Labs')).toBe('Staff Engineer');
  });
});
