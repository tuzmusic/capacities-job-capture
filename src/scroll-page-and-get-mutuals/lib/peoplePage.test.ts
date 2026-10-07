import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanTitle,
  clickLoadMore,
  findLoadMoreButton,
  parseMutuals,
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

function page(cards: string[], { button = true } = {}) {
  document.title = 'Grafana Labs: People | LinkedIn';
  document.body.innerHTML = `
    <main>
      <div class="org-top-card"><h1 class="org-top-card-summary__title"> Grafana Labs </h1></div>
      <ul>${cards.join('')}</ul>
      ${button ? '<button class="scaffold-finite-scroll__load-button"><span>Show more results</span></button>' : ''}
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
});

describe('load more', () => {
  it('finds the button by class or by its text', () => {
    page([jane]);
    expect(findLoadMoreButton(document)).not.toBeNull();
    document.body.innerHTML = '<main><button> Show more results </button></main>';
    expect(findLoadMoreButton(document)).not.toBeNull();
    document.body.innerHTML = '<main><button>Connect</button></main>';
    expect(findLoadMoreButton(document)).toBeNull();
  });

  it('clicks it and reports how many cards there are', () => {
    page([jane, sam]);
    const onClick = vi.fn();
    findLoadMoreButton(document)!.addEventListener('click', onClick);
    expect(clickLoadMore(document)).toEqual({ cards: 2, clicked: true });
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('reports no click when the button is gone or disabled', () => {
    page([jane], { button: false });
    expect(clickLoadMore(document)).toEqual({ cards: 1, clicked: false });
    page([jane]);
    findLoadMoreButton(document)!.disabled = true;
    expect(clickLoadMore(document)).toEqual({ cards: 1, clicked: false });
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

describe('parsing helpers', () => {
  it('parses the mutual line', () => {
    expect(parseMutuals('Pat Smith is a mutual connection')).toEqual(['Pat Smith']);
    expect(parseMutuals('Pat Smith and Lou Reed are mutual connections')).toEqual(['Pat Smith', 'Lou Reed']);
    expect(parseMutuals('Pat Smith, Lou Reed and 5 other mutual connections')).toEqual(['Pat Smith', 'Lou Reed']);
    expect(parseMutuals('Pat Smith, Lou Reed, and 5 other mutual connections')).toEqual(['Pat Smith', 'Lou Reed']);
    expect(parseMutuals('Pat Smith and 1 other mutual connection')).toEqual(['Pat Smith']);
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
