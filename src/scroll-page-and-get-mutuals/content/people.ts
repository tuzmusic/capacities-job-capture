// Injected into the LinkedIn tab (see ../run.ts). Exposes the page reader on the extension's isolated-world global so
// follow-up executeScript({ func }) calls can use it. Re-injected after every navigation or reload.
import { clickLoadMore, findPeopleCards, readCompanyName, scrapePeople } from '../lib/peoplePage.ts';

const g = globalThis as { __capacitiesMutuals?: unknown };
g.__capacitiesMutuals = {
  count: () => findPeopleCards(document).length,
  clickMore: () => clickLoadMore(document),
  scrape: (company: string) => scrapePeople(document, company),
  companyName: () => readCompanyName(document),
};
