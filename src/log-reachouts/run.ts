import {
  appendToSection,
  datedLine,
  JOB_SECTION_PROPERTY_IDS,
  searchObjects,
  updatePropertiesFromMarkdown,
} from '../shared/capacities.ts';
import { listSavedJobs } from '../shared/savedJobs.ts';
import { loadSettings } from '../shared/settings.ts';
import { findJobNotes, type JobNote } from '../scroll-page-and-get-mutuals/lib/findJobNotes.ts';
import { show } from '../shared/tabs.ts';
import profileScript from './content/profile.ts?script&iife';
import type { Profile } from './lib/profilePage.ts';
import {
  companyFromTitle,
  companyPage,
  mostCommon,
  nameFromTitle,
  profileUrl,
  REACHOUT_TYPES,
  sheetDate,
  slugToName,
  toHtml,
  toRow,
  toTsv,
  type Reachout,
  type Shared,
} from './lib/reachoutRows.ts';
import { appendToSheet } from './lib/sheetWebhook.ts';
import type { OverlayAction, OverlayField } from '../shared/overlay.ts';

/** A tab that doesn't answer in this long (frozen, mid-load) is logged from its title alone. */
const READ_TIMEOUT_MS = 3000;

const withTimeout = <T>(p: Promise<T>, ms: number, fallback: T) =>
  Promise.race([p, new Promise<T>((r) => setTimeout(() => r(fallback), ms))]);

/** Reads the profile in a tab, injecting the reader first if this page doesn't have it yet. Null if it can't. */
async function readTab(tabId: number): Promise<Profile | null> {
  const call = async () => {
    const [frame] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const api = (globalThis as { __capacitiesReachouts?: { read: () => unknown } }).__capacitiesReachouts;
        return api ? { value: api.read() } : null;
      },
    });
    return frame?.result as { value: Profile } | null | undefined;
  };
  try {
    let res = await call();
    if (!res) {
      await chrome.scripting.executeScript({ target: { tabId }, files: [profileScript] });
      res = await call();
    }
    return res?.value ?? null;
  } catch {
    return null; // discarded, mid-navigation, or gone
  }
}

/** Every distinct LinkedIn profile open in the window, in tab order. */
function profileTabs(tabs: chrome.tabs.Tab[]): { tab: chrome.tabs.Tab; url: string }[] {
  const seen = new Set<string>();
  return tabs.flatMap((tab) => {
    const url = profileUrl(tab.url ?? '');
    if (!url || seen.has(url) || tab.id === undefined) return [];
    seen.add(url);
    return [{ tab, url }];
  });
}

/** The company's name from a LinkedIn company tab in the window (its People page first), or ''. */
async function companyFromTabs(tabs: chrome.tabs.Tab[]): Promise<string> {
  const pages = tabs.flatMap((tab) => {
    const page = companyPage(tab.url ?? '');
    return page && tab.id !== undefined ? [{ tab, ...page }] : [];
  });
  const best = pages.find((p) => p.people) ?? pages[0];
  if (!best) return '';
  const heading = await withTimeout(
    chrome.scripting
      .executeScript({
        target: { tabId: best.tab.id! },
        func: () =>
          (document.querySelector('.org-top-card-summary__title, .org-top-card h1, main h1')?.textContent ?? '')
            .replace(/\s+/g, ' ')
            .trim(),
      })
      .then(([frame]) => (typeof frame?.result === 'string' ? frame.result : ''))
      .catch(() => ''),
    READ_TIMEOUT_MS,
    '',
  );
  return heading || companyFromTitle(best.tab.title ?? '') || slugToName(best.slug);
}

interface Gathered {
  reachouts: Reachout[];
  /** The best guess for the Company box. */
  company: string;
}

/** Reads the window's profiles and guesses the company. Null (after saying so) when there are no profiles. */
async function gather(tab: chrome.tabs.Tab, tabId: number): Promise<Gathered | null> {
  const tabs = (await chrome.tabs.query({ windowId: tab.windowId })).sort((a, b) => a.index - b.index);
  const found = profileTabs(tabs);
  if (!found.length) {
    await show(tabId, {
      tone: 'warning',
      heading: 'No LinkedIn profiles open',
      detail: 'Open the profiles you reached out to (linkedin.com/in/…) in this window, then try again.',
    });
    return null;
  }
  await show(tabId, { tone: 'busy', heading: `Reading ${found.length} profiles…` });

  const [profiles, fromCompanyTab] = await Promise.all([
    Promise.all(found.map(({ tab: t }) => withTimeout(readTab(t.id!), READ_TIMEOUT_MS, null))),
    companyFromTabs(tabs),
  ]);
  const reachouts = found.map(({ tab: t, url }, i): Reachout => ({
    url,
    name: profiles[i]?.name || nameFromTitle(t.title ?? ''),
    // Their own company, for "Each person's own company": LISW's header-logo read, else the profile's other clues.
    company: profiles[i]?.headerCompany || profiles[i]?.company || '',
  }));
  return { reachouts, company: fromCompanyTab || mostCommon(profiles.map((p) => p?.company ?? '')) };
}

const MAX_LISTED = 12;

function describe(reachouts: Reachout[]): string {
  const lines = reachouts
    .slice(0, MAX_LISTED)
    .map((r) => r.name || '(no name)');
  if (reachouts.length > MAX_LISTED) lines.push(`+${reachouts.length - MAX_LISTED} more`);
  return lines.join('\n');
}

const rowsFor = (reachouts: Reachout[], shared: Shared) => reachouts.map((r) => toRow(r, shared, sheetDate(new Date())));

/** The dialog's boxes. Their ids are the `{company}`-style placeholders in the rows, and the keys of `fields`. */
const fieldsFor = (g: Gathered): OverlayField[] => [
  { id: 'company', label: 'Company', value: g.company },
  { id: 'each', label: "Each person's own company", value: '', checkbox: true, disables: 'company' },
  { id: 'type', label: 'Type', value: REACHOUT_TYPES[0], options: [...REACHOUT_TYPES] },
  { id: 'note', label: 'Note (optional, on every row)', value: '', placeholder: 'thanks for the x' },
];
/** For "Each person's own company": no company placeholder, so each row keeps its person's. */
const EACH_OWN: Shared = { type: '{type}', note: '{note}' };
const PLACEHOLDERS: Shared = { ...EACH_OWN, company: '{company}' };

/** Per tab, after Copy Reachouts: how many were copied, the company guess, and (once looked up) the Jobs we offered. */
interface Copied {
  count: number;
  company: string;
  choices?: JobNote[];
}
const copiedKey = (tabId: number) => `reachouts:copied:${tabId}`;

export const COPIED_MESSAGE = 'copy-reachouts:copied';
export const UPDATE_MESSAGE = 'copy-reachouts:update-capacities';

const FIRST_REACHOUTS = 'First Reachouts';

/** Menu item: the LinkedIn profiles open in this window → rows on the clipboard, after you check the dialog. */
export async function copyReachouts(tab: chrome.tabs.Tab) {
  const tabId = tab.id;
  if (tabId === undefined) return;
  const gathered = await gather(tab, tabId);
  if (!gathered) return;

  const n = gathered.reachouts.length;
  await chrome.storage.session.set({ [copiedKey(tabId)]: { count: n, company: gathered.company } satisfies Copied });
  await show(tabId, {
    tone: 'success',
    heading: `${n} reachouts`,
    detail: describe(gathered.reachouts),
    fields: fieldsFor(gathered),
    // The overlay puts each box's value where its {id} is.
    actions: [
      {
        label: `Copy ${n} rows`,
        // Once copied, the overlay offers to update the company's Job.
        message: { type: COPIED_MESSAGE },
        copy: toTsv(rowsFor(gathered.reachouts, PLACEHOLDERS)),
        copyHtml: toHtml(gathered.reachouts, PLACEHOLDERS, sheetDate(new Date())),
        whenChecked: {
          field: 'each',
          copy: toTsv(rowsFor(gathered.reachouts, EACH_OWN)),
          copyHtml: toHtml(gathered.reachouts, EACH_OWN, sheetDate(new Date())),
        },
      },
    ],
  });
}

/** The rows, per tab the overlay is on, waiting for "Add to the sheet", each with its person's own company. The rest comes with the click. */
interface Pending {
  rows: string[][];
}
const pendingKey = (tabId: number) => `reachouts:pending:${tabId}`;

export const ADD_MESSAGE = 'add-reachouts-to-sheet:add';

const NOT_SET_UP = {
  tone: 'warning',
  heading: "The sheet isn't set up yet",
  detail:
    "Add Reachouts to Sheet needs the sheet's web app URL in the extension's Options (see the README). " +
    'Copy Reachouts works without it.',
} as const;

/** Menu item: the same rows, written into the sheet, after you check the dialog. */
export async function addReachoutsToSheet(tab: chrome.tabs.Tab) {
  const tabId = tab.id;
  if (tabId === undefined) return;
  const loaded = await loadSettings(chrome.storage.local, ['sheetWebhookUrl']);
  if (!loaded.ok) return show(tabId, NOT_SET_UP);

  const gathered = await gather(tab, tabId);
  if (!gathered) return;

  const n = gathered.reachouts.length;
  await chrome.storage.session.set({ [pendingKey(tabId)]: { rows: rowsFor(gathered.reachouts, { type: '', note: '' }) } satisfies Pending });
  await show(tabId, {
    tone: 'success',
    heading: `${n} reachouts`,
    detail: describe(gathered.reachouts),
    fields: fieldsFor(gathered),
    actions: [{ label: `Add ${n} rows to the sheet`, message: { type: ADD_MESSAGE } }],
  });
}

/** After the copy: finds the company's Job and offers to log the reachouts in it. Quiet if Capacities isn't set up. */
async function offerCapacitiesUpdate(tabId: number, company: string) {
  const key = copiedKey(tabId);
  const copied = (await chrome.storage.session.get(key))[key] as Copied | undefined;
  const loaded = await loadSettings(chrome.storage.local, ['capacitiesApiToken']);
  if (!copied || !loaded.ok) return;
  company ||= copied.company;
  const heading = `Copied ${copied.count} rows`;

  await show(tabId, { tone: 'busy', heading, detail: 'Finding the Job in Capacities…' });
  const saved = await listSavedJobs(chrome.storage.local);
  const matches = company
    ? await findJobNotes({
        company,
        saved,
        search: (query) => searchObjects({ fetch, token: loaded.settings.capacitiesApiToken, query }),
      }).catch(() => [] as JobNote[])
    : [];
  // Without a match, the most recently saved Jobs instead.
  const choices = matches.length ? matches : saved.slice(0, 5).map((j) => ({ id: j.objectId, title: j.title }));
  await chrome.storage.session.set({ [key]: { ...copied, choices } satisfies Copied });
  if (!choices.length) return show(tabId, { tone: 'success', heading, detail: `No Job found for ${company || 'this company'} in Capacities.` });

  const update = (c: JobNote, label: string): OverlayAction => ({ label, message: { type: UPDATE_MESSAGE, objectId: c.id } });
  await show(tabId, {
    tone: 'success',
    heading,
    detail:
      matches.length === 1
        ? matches[0].title
        : matches.length
          ? `Which ${company} Job?`
          : `No Job found for ${company || 'this company'}. A recent one?`,
    fields: [
      { id: 'track', label: 'Track reachouts', value: 'true', checkbox: true },
      { id: 'status', label: `Move to "${FIRST_REACHOUTS}"`, value: 'true', checkbox: true },
    ],
    actions: matches.length === 1 ? [update(matches[0], 'Update Capacities')] : choices.map((c) => update(c, c.title)),
  });
}

/** "Update Capacities" clicked: logs the reachouts in the Job's Interactions and/or moves it to First Reachouts. */
async function updateCapacities(tabId: number, objectId: string, fields: { track: boolean; status: boolean }) {
  const key = copiedKey(tabId);
  const copied = (await chrome.storage.session.get(key))[key] as Copied | undefined;
  // Only a Job we offered: the page can't steer the write anywhere else.
  const job = copied?.choices?.find((c) => c.id === objectId);
  if (!copied || !job) {
    return show(tabId, { tone: 'error', heading: 'That has expired', detail: 'Run Copy Reachouts again.' });
  }
  if (!fields.track && !fields.status) return show(tabId, { tone: 'success', heading: 'Nothing to update' });
  const loaded = await loadSettings(chrome.storage.local, ['capacitiesApiToken']);
  if (!loaded.ok) return show(tabId, { tone: 'error', heading: 'Capacities not updated', detail: loaded.message });
  const token = loaded.settings.capacitiesApiToken;

  await show(tabId, { tone: 'busy', heading: `Updating ${job.title}…` });
  const done: string[] = [];
  try {
    if (fields.track) {
      await appendToSection({
        fetch,
        token,
        id: job.id,
        propertyId: JOB_SECTION_PROPERTY_IDS.interactions,
        blocks: [datedLine(new Date(), `${copied.count} reachouts`)],
      });
      done.push(`Logged ${copied.count} reachouts`);
    }
    if (fields.status) {
      await updatePropertiesFromMarkdown({ fetch, token, id: job.id, markdown: `---\nstatus: ${JSON.stringify(FIRST_REACHOUTS)}\n---\n` });
      done.push(`Moved to ${FIRST_REACHOUTS}`);
    }
    await chrome.storage.session.remove(key);
    await show(tabId, { tone: 'success', heading: `Updated ${job.title}`, detail: done.join('\n') });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await show(tabId, {
      tone: 'error',
      heading: `Couldn't update ${job.title}`,
      detail: done.length ? `${done.join('\n')}, then: ${message}` : message,
    });
  }
}

/** Overlay clicks: "Add … to the sheet", a finished copy, or "Update Capacities". Returns whether the message was ours. */
export function onReachoutsMessage(message: unknown, sender: chrome.runtime.MessageSender): boolean {
  const m = message as { type?: unknown; objectId?: unknown; fields?: Record<string, unknown> } | null;
  if (sender.tab?.id === undefined) return false;
  const tabId = sender.tab.id;
  const field = (k: string) => (typeof m?.fields?.[k] === 'string' ? (m.fields[k] as string) : '');
  if (m?.type === COPIED_MESSAGE) {
    void offerCapacitiesUpdate(tabId, field('each') ? '' : field('company'));
    return true;
  }
  if (m?.type === UPDATE_MESSAGE && typeof m.objectId === 'string') {
    void updateCapacities(tabId, m.objectId, { track: !!field('track'), status: !!field('status') });
    return true;
  }
  if (m?.type !== ADD_MESSAGE) return false;
  const shared: Shared = {
    company: field('each') ? undefined : field('company'),
    type: field('type') || REACHOUT_TYPES[0],
    note: field('note'),
  };

  void (async () => {
    const key = pendingKey(tabId);
    const pending = (await chrome.storage.session.get(key))[key] as Pending | undefined;
    if (!pending) {
      return show(tabId, { tone: 'error', heading: 'Those rows have expired', detail: 'Run Add Reachouts to Sheet again.' });
    }
    const loaded = await loadSettings(chrome.storage.local, ['sheetWebhookUrl']);
    if (!loaded.ok) return show(tabId, NOT_SET_UP);

    const rows = pending.rows.map(([own, name, role, date]) => [shared.company ?? own, name, role, date, shared.note, shared.type]);
    await show(tabId, { tone: 'busy', heading: `Adding ${rows.length} rows to the sheet…` });
    try {
      const { added, firstRow } = await appendToSheet({ fetch, url: loaded.settings.sheetWebhookUrl, rows });
      await chrome.storage.session.remove(key);
      await show(tabId, {
        tone: 'success',
        heading: `Added ${added} rows to the sheet`,
        detail: firstRow ? `Starting at row ${firstRow}.` : undefined,
      });
    } catch (err) {
      await show(tabId, {
        tone: 'error',
        heading: 'Not added to the sheet',
        detail: err instanceof Error ? err.message : String(err),
        actions: [{ label: 'Copy rows instead', copy: toTsv(rows) }],
      });
    }
  })();
  return true;
}
