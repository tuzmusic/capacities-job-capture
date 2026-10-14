import { describe, expect, it } from 'vitest';
import { companyFromHeadline, readProfile } from './profilePage.ts';

const page = (main: string, title = 'Levon Mkrtchyan | LinkedIn') => {
  document.title = title;
  document.body.innerHTML = `<main>${main}</main>`;
  return document;
};

const TOP_CARD = `
  <section>
    <h1>Levon Mkrtchyan</h1>
    <span class="dist-value">2nd</span>
    <div class="text-body-medium break-words">Senior Software Engineer at Sardine | ex-Stripe</div>
    <ul><li><button aria-label="Current company: Sardine AI. Click to skip to experience card">Sardine AI</button></li></ul>
    <button aria-label="Pending, click to withdraw invitation sent to Levon Mkrtchyan">Pending</button>
  </section>`;

const experience = (...entry: string[]) => `
  <section><div id="experience"></div><ul><li>
    ${entry.map((t) => `<span aria-hidden="true">${t}</span><span class="visually-hidden">${t}</span>`).join('')}
  </li></ul></section>`;

describe('readProfile', () => {
  it('reads the top card', () => {
    expect(readProfile(page(TOP_CARD))).toEqual({
      name: 'Levon Mkrtchyan',
      company: 'Sardine AI',
      headline: 'Senior Software Engineer at Sardine | ex-Stripe',
    });
  });

  it('falls back on the first Experience entry: one role', () => {
    const doc = page(
      `<section><h1>Pat Smith</h1><span>· 3rd</span></section>` +
        experience('Staff Engineer', 'Acme Corp · Full-time', 'Jan 2022 - Present · 3 yrs 9 mos'),
    );
    expect(readProfile(doc)).toMatchObject({ name: 'Pat Smith', company: 'Acme Corp' });
  });

  it('falls back on the first Experience entry: several roles at one company', () => {
    const doc = page(`<section><h1>Pat Smith</h1></section>` + experience('Acme Corp', 'Full-time · 5 yrs', 'Staff Engineer'));
    expect(readProfile(doc).company).toBe('Acme Corp');
  });

  it('falls back on the headline', () => {
    const doc = page(`<section><span>· 1st</span><div class="text-body-medium">Eng Manager @ Figma</div></section>`, '(3) Jane Doe | LinkedIn');
    expect(readProfile(doc)).toMatchObject({ name: '', company: 'Figma' });
  });
});

describe('helpers', () => {
  it('companyFromHeadline', () => {
    expect(companyFromHeadline('Senior SWE at Wealthfront | React')).toBe('Wealthfront');
    expect(companyFromHeadline('Building great things')).toBe('');
  });

});
