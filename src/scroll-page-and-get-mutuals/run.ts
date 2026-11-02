import { appendToSection, getObjectMarkdown, JOB_SECTION_PROPERTY_IDS, searchObjects } from '../shared/capacities.ts';
import type { OverlayAction } from '../shared/overlay.ts';
import { listSavedJobs } from '../shared/savedJobs.ts';
import { loadSettings } from '../shared/settings.ts';
import { show, sleep, waitForLoad } from '../shared/tabs.ts';
import peopleScript from './content/people.ts?script&iife';
import { findJobNotes, type JobNote } from './lib/findJobNotes.ts';
import { engineeringPeopleTarget, peopleSearchUrl, SEARCH_MAX_PAGES, slugToName } from './lib/linkedinUrl.ts';
import { mergePeople } from './lib/mergePeople.ts';
import { buildMutualsMarkdown, contactsAlreadyIn, NO_CONTACTS } from './lib/mutualsMarkdown.ts';
import type { Person } from './lib/peoplePage.ts';

/** What content/people.ts exposes in the page. */
interface PageApi {
  count: () => number;
  scrape: (company: string) => Person[];
  companyName: () => string;
  companyId: () => string | null;
}

/** Calls the page reader in the tab's top frame, injecting it first if this page doesn't have it yet. */
async function callPage<K extends keyof PageApi>(
  tabId: number,
  method: K,
  ...args: Parameters<PageApi[K]>
): Promise<ReturnType<PageApi[K]> | null> {
  const call = async () => {
    const [frame] = await chrome.scripting.executeScript({
      target: { tabId },
      func: (m: string, a: unknown[]) => {
        const api = (globalThis as { __capacitiesMutuals?: Record<string, (...x: unknown[]) => unknown> })
          .__capacitiesMutuals;
        return api ? { value: api[m](...a) } : null;
      },
      args: [method, args],
    });
    return frame?.result as { value: ReturnType<PageApi[K]> } | null | undefined;
  };
  try {
    let res = await call();
    if (!res) {
      await chrome.scripting.executeScript({ target: { tabId }, files: [peopleScript] });
      res = await call();
    }
    return res ? res.value : null;
  } catch {
    return null; // mid-navigation, or the tab is gone
  }
}

/** A tab that was just told to navigate still reports the old page as "complete" for a moment. */
async function settle(tabId: number) {
  await sleep(1000);
  await waitForLoad(tabId, 20000);
}

/** The scraped markdown and the notes it may go to, per tab, waiting for a pick in the overlay. */
interface Pending {
  markdown: string;
  summary: string;
  choices: JobNote[];
}
const pendingKey = (tabId: number) => `mutuals:pending:${tabId}`;

export const PICK_MESSAGE = 'scroll-page-and-get-mutuals:pick';

const running = new Set<number>();

/** Menu item: on a LinkedIn company page, reads its Engineering people page and adds your mutuals to the company's Job. */
export const getMutualsFromPeoplePage = (tab: chrome.tabs.Tab) => getMutualsFrom(tab, { search: false });

/** Menu item: the same, plus people search for the company's engineers in your network, in a background tab. */
export const getMutualsWithSearch = (tab: chrome.tabs.Tab) => getMutualsFrom(tab, { search: true });

/** Waits for the page's first people cards (LinkedIn renders them after the load), then reads them. */
async function scrapeWhenReady(tabId: number, company: string, polls: number) {
  for (let i = 0; i < polls && !(await callPage(tabId, 'count')); i++) await sleep(1000);
  return (await callPage(tabId, 'scrape', company)) ?? [];
}

const PEOPLE_PAGE_POLLS = 15;
const SEARCH_PAGE_POLLS = 8;
const SEARCH_PAGE_SIZE = 10;
/** Between search pages, so it reads like someone paging through. */
const SEARCH_PAGE_GAP_MS = 1500;

/**
 * Pages through people search in a background tab next to `nextTo`, then closes it. Stops after the first page that
 * isn't full, since that's the last one.
 */
async function searchPeople(
  companyId: string,
  company: string,
  nextTo: chrome.tabs.Tab,
  onPage: (page: number, found: number) => Promise<void>,
): Promise<Person[]> {
  const url = peopleSearchUrl(companyId, 1);
  const tab = await chrome.tabs.create({ url, active: false, windowId: nextTo.windowId, index: nextTo.index + 1 });
  const tabId = tab.id!;
  const found: Person[] = [];
  try {
    for (let page = 1; page <= SEARCH_MAX_PAGES; page++) {
      if (page > 1) {
        await sleep(SEARCH_PAGE_GAP_MS);
        await chrome.tabs.update(tabId, { url: peopleSearchUrl(companyId, page) });
      }
      await settle(tabId);
      const people = await scrapeWhenReady(tabId, company, SEARCH_PAGE_POLLS);
      found.push(...people);
      await onPage(page, found.length);
      if (people.length < SEARCH_PAGE_SIZE) break;
    }
  } finally {
    await chrome.tabs.remove(tabId).catch(() => {});
  }
  return found;
}

async function getMutualsFrom(tab: chrome.tabs.Tab, { search }: { search: boolean }) {
  const tabId = tab.id;
  if (tabId === undefined || running.has(tabId)) return;

  const target = engineeringPeopleTarget(tab.url ?? '');
  if (target.kind === 'not-company') {
    return show(tabId, {
      tone: 'warning',
      heading: 'Not a LinkedIn company page',
      detail: 'Open the company on LinkedIn (linkedin.com/company/…), then try again.',
    });
  }
  const loaded = await loadSettings(chrome.storage.local, ['capacitiesApiToken']);
  if (!loaded.ok) return show(tabId, { tone: 'error', heading: 'Contacts not added', detail: loaded.message });
  const token = loaded.settings.capacitiesApiToken;

  running.add(tabId);
  try {
    if (target.kind === 'navigate') {
      await chrome.tabs.update(tabId, { url: target.url });
      await settle(tabId);
    }
    await show(tabId, { tone: 'busy', heading: 'Reading Engineering people…' });

    const name = (await callPage(tabId, 'companyName')) || slugToName(target.slug);
    const fromPage = await scrapeWhenReady(tabId, name, PEOPLE_PAGE_POLLS);
    let people = fromPage;
    let source = `${fromPage.length} on the people page`;
    if (search) {
      const companyId = await callPage(tabId, 'companyId');
      if (!companyId) {
        source += " (no search: the page didn't link to it)";
      } else {
        const fromSearch = await searchPeople(companyId, name, tab, (page, found) =>
          show(tabId, {
            tone: 'busy',
            heading: 'Searching LinkedIn…',
            detail: `${source}, ${found} from search (page ${page} of up to ${SEARCH_MAX_PAGES})`,
          }),
        );
        people = mergePeople(fromPage, fromSearch);
        source += ` + ${people.length - fromPage.length} more from search`;
      }
    }

    if (!people.length) {
      return show(tabId, {
        tone: 'error',
        heading: 'No Engineering people found',
        detail: "LinkedIn didn't show anyone. Check you're signed in and the page loads, then try again.",
      });
    }

    const { markdown, firstDegree, secondDegree } = buildMutualsMarkdown(people, { complete: true });
    const summary = `${secondDegree} 2nd-degree and ${firstDegree} 1st-degree, from ${source}`;

    await show(tabId, { tone: 'busy', heading: 'Finding the Job in Capacities…', detail: summary });
    const saved = await listSavedJobs(chrome.storage.local);
    const matches = await findJobNotes({
      company: name,
      saved,
      search: (query) => searchObjects({ fetch, token, query }),
    }).catch(() => [] as JobNote[]);

    // No sure match: let the overlay ask. Without any match, offer the most recently saved Jobs instead.
    const choices = matches.length ? matches : saved.slice(0, 5).map((j) => ({ id: j.objectId, title: j.title }));
    // Kept until written, for a pick in the overlay or "Add anyway".
    await chrome.storage.session.set({ [pendingKey(tabId)]: { markdown, summary, choices } satisfies Pending });
    if (matches.length === 1) return await writeContacts(tabId, token, matches[0], { markdown, summary, choices });

    await show(tabId, {
      tone: 'warning',
      heading: matches.length ? `Which ${name} Job are these for?` : `No Job found for ${name}`,
      detail: matches.length
        ? summary
        : `${summary}.${choices.length ? ' Pick a recent Job, or copy the list.' : ' Copy the list to paste it in yourself.'}`,
      actions: [...choices.map((c) => pickAction(c)), { label: 'Copy markdown', copy: markdown }],
    });
  } catch (err) {
    await show(tabId, {
      tone: 'error',
      heading: 'Contacts not added',
      detail: err instanceof Error ? err.message : String(err),
    });
  } finally {
    running.delete(tabId);
  }
}

const pickAction = (note: JobNote, { force = false } = {}): OverlayAction => ({
  label: force ? 'Add anyway' : note.title,
  message: { type: PICK_MESSAGE, objectId: note.id, force },
});

/** Appends the contacts to the Job, unless (without `force`) the Job already has some of them. */
async function writeContacts(tabId: number, token: string, note: JobNote, pending: Pending, { force = false } = {}) {
  await show(tabId, { tone: 'busy', heading: `Adding contacts to ${note.title}…`, detail: pending.summary });
  try {
    if (!force) {
      // If the note can't be read, write anyway: a duplicate is easier to fix than a missing list.
      const existing = await getObjectMarkdown({ fetch, token, id: note.id }).catch(() => '');
      const { listed, present } = contactsAlreadyIn(pending.markdown, existing);
      const empty = listed === 0 && existing.includes(NO_CONTACTS.replaceAll('_', ''));
      if (present > 0 || empty) {
        return await show(tabId, {
          tone: 'warning',
          heading: `Already in ${note.title}`,
          detail: present === listed ? 'Nothing new to add.' : `${present} of ${listed} contacts are already there.`,
          actions: [pickAction(note, { force: true })],
        });
      }
    }
    await appendToSection({
      fetch,
      token,
      id: note.id,
      propertyId: JOB_SECTION_PROPERTY_IDS.contacts,
      markdown: pending.markdown,
    });
    await chrome.storage.session.remove(pendingKey(tabId));
    await show(tabId, { tone: 'success', heading: `Contacts added to ${note.title}`, detail: pending.summary });
  } catch (err) {
    await show(tabId, {
      tone: 'error',
      heading: `Couldn't add contacts to ${note.title}`,
      detail: err instanceof Error ? err.message : String(err),
      actions: [{ label: 'Copy markdown', copy: pending.markdown }],
    });
  }
}

/** A Job picked in the overlay. Returns whether the message was ours. */
export function onMutualsMessage(message: unknown, sender: chrome.runtime.MessageSender): boolean {
  const m = message as { type?: unknown; objectId?: unknown; force?: unknown } | null;
  if (m?.type !== PICK_MESSAGE || typeof m.objectId !== 'string' || sender.tab?.id === undefined) return false;
  const tabId = sender.tab.id;
  const objectId = m.objectId;

  void (async () => {
    const key = pendingKey(tabId);
    const pending = (await chrome.storage.session.get(key))[key] as Pending | undefined;
    // Only a Job we offered: the page can't steer the write anywhere else.
    const note = pending?.choices.find((c) => c.id === objectId);
    if (!pending || !note) {
      return show(tabId, { tone: 'error', heading: 'That list has expired', detail: 'Run Get Mutuals again.' });
    }
    const loaded = await loadSettings(chrome.storage.local, ['capacitiesApiToken']);
    if (!loaded.ok) return show(tabId, { tone: 'error', heading: 'Contacts not added', detail: loaded.message });
    await writeContacts(tabId, loaded.settings.capacitiesApiToken, note, pending, { force: m.force === true });
  })();
  return true;
}
