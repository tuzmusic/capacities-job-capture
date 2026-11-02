// Injected into the LinkedIn tab (see ../run.ts). Exposes the page reader on the extension's isolated-world global so
// follow-up executeScript({ func }) calls can use it. Re-injected after every navigation or reload.
import { findPeopleCards, readCompanyId, readCompanyName, scrapePeople } from '../lib/peoplePage.ts';

const g = globalThis as { __capacitiesMutuals?: unknown };
g.__capacitiesMutuals = {
  count: () => findPeopleCards(document).length,
  scrape: (company: string) => scrapePeople(document, company),
  companyName: () => readCompanyName(document),
  companyId: () => readCompanyId(document),
};
