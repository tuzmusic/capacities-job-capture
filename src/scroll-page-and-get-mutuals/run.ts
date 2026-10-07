import { appendToSection, getObjectMarkdown, JOB_SECTION_PROPERTY_IDS, searchObjects } from '../shared/capacities.ts';
import type { OverlayAction } from '../shared/overlay.ts';
import { listSavedJobs } from '../shared/savedJobs.ts';
import { loadSettings } from '../shared/settings.ts';
import { show, sleep, waitForLoad } from '../shared/tabs.ts';
import peopleScript from './content/people.ts?script&iife';
import { findJobNotes, type JobNote } from './lib/findJobNotes.ts';
import { engineeringPeopleTarget, slugToName } from './lib/linkedinUrl.ts';
import { loadAllPeople } from './lib/loadAllPeople.ts';
import { buildMutualsMarkdown, contactsAlreadyIn, NO_CONTACTS } from './lib/mutualsMarkdown.ts';
import type { Person } from './lib/peoplePage.ts';

/** What content/people.ts exposes in the page. */
interface PageApi {
  count: () => number;
  clickMore: () => { cards: number; clicked: boolean };
  scrape: (company: string) => Person[];
  companyName: () => string;
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

/** Menu item: on a LinkedIn company page, loads its Engineering people and adds your mutuals to the company's Job. */
export async function scrollPageAndGetMutuals(tab: chrome.tabs.Tab) {
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
    await show(tabId, { tone: 'busy', heading: 'Loading Engineering people…' });

    let company = '';
    const companyName = async () => (company ||= (await callPage(tabId, 'companyName')) || slugToName(target.slug));
    let lastDetail = '';
    const { people, complete } = await loadAllPeople({
      count: () => callPage(tabId, 'count'),
      clickMore: () => callPage(tabId, 'clickMore'),
      scrape: async () => (await callPage(tabId, 'scrape', await companyName())) ?? [],
      reload: async () => {
        await chrome.tabs.reload(tabId);
        await settle(tabId);
        lastDetail = ''; // the overlay went with the old page
      },
      sleep,
      onProgress: async ({ people, round, attempt }) => {
        const retry = round > 1 ? `, reload ${round - 1}` : attempt > 1 ? `, try ${attempt}` : '';
        const detail = `${people} so far${retry}`;
        if (detail === lastDetail) return;
        lastDetail = detail;
        await show(tabId, { tone: 'busy', heading: 'Loading Engineering people…', detail });
      },
    });

    if (!people.length) {
      return show(tabId, {
        tone: 'error',
        heading: 'No Engineering people found',
        detail: "LinkedIn didn't show anyone. Check you're signed in and the page loads, then try again.",
      });
    }

    const { markdown, firstDegree, secondDegree } = buildMutualsMarkdown(people, { complete });
    const summary =
      `${secondDegree} 2nd-degree and ${firstDegree} 1st-degree, from ${people.length} people` +
      (complete ? '' : ' (LinkedIn stopped early)');

    await show(tabId, { tone: 'busy', heading: 'Finding the Job in Capacities…', detail: summary });
    const name = await companyName();
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
      return show(tabId, { tone: 'error', heading: 'That list has expired', detail: 'Run Scroll Page & Get Mutuals again.' });
    }
    const loaded = await loadSettings(chrome.storage.local, ['capacitiesApiToken']);
    if (!loaded.ok) return show(tabId, { tone: 'error', heading: 'Contacts not added', detail: loaded.message });
    await writeContacts(tabId, loaded.settings.capacitiesApiToken, note, pending, { force: m.force === true });
  })();
  return true;
}
