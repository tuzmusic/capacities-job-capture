import { loadSettings } from '../shared/settings.ts';
import { show } from '../shared/tabs.ts';
import profileScript from './content/profile.ts?script&iife';
import type { Profile } from './lib/profilePage.ts';
import {
  companyFromTitle,
  companyPage,
  mostCommon,
  nameFromTitle,
  profileUrl,
  sheetDate,
  slugToName,
  toHtml,
  toRow,
  toTsv,
  type Reachout,
} from './lib/reachoutRows.ts';
import { appendToSheet } from './lib/sheetWebhook.ts';

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
    company: profiles[i]?.company ?? '',
  }));
  return { reachouts, company: fromCompanyTab || mostCommon(reachouts.map((r) => r.company)) };
}

const MAX_LISTED = 12;

function describe(reachouts: Reachout[]): string {
  const lines = reachouts
    .slice(0, MAX_LISTED)
    .map((r) => r.name || '(no name)');
  if (reachouts.length > MAX_LISTED) lines.push(`+${reachouts.length - MAX_LISTED} more`);
  return lines.join('\n');
}

/** Every row gets the one company: you run this for one company at a time. */
const rowsFor = (reachouts: Reachout[], company: string) =>
  reachouts.map((r) => toRow({ ...r, company }, sheetDate(new Date())));

/** Menu item: the LinkedIn profiles open in this window → rows on the clipboard, after you check the company. */
export async function copyReachouts(tab: chrome.tabs.Tab) {
  const tabId = tab.id;
  if (tabId === undefined) return;
  const gathered = await gather(tab, tabId);
  if (!gathered) return;

  const n = gathered.reachouts.length;
  await show(tabId, {
    tone: 'success',
    heading: `${n} reachouts`,
    detail: describe(gathered.reachouts),
    input: { label: 'Company', value: gathered.company },
    // The overlay puts the Company box's value where {input} is.
    actions: [
      {
        label: `Copy ${n} rows`,
        copy: toTsv(rowsFor(gathered.reachouts, '{input}')),
        copyHtml: toHtml(gathered.reachouts, '{input}', sheetDate(new Date())),
      },
    ],
  });
}

/** The rows, per tab the overlay is on, waiting for "Add to the sheet". The company comes with the click. */
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

/** Menu item: the same rows, written into the sheet, after you check the company. */
export async function addReachoutsToSheet(tab: chrome.tabs.Tab) {
  const tabId = tab.id;
  if (tabId === undefined) return;
  const loaded = await loadSettings(chrome.storage.local, ['sheetWebhookUrl']);
  if (!loaded.ok) return show(tabId, NOT_SET_UP);

  const gathered = await gather(tab, tabId);
  if (!gathered) return;

  const n = gathered.reachouts.length;
  await chrome.storage.session.set({ [pendingKey(tabId)]: { rows: rowsFor(gathered.reachouts, '') } satisfies Pending });
  await show(tabId, {
    tone: 'success',
    heading: `${n} reachouts`,
    detail: describe(gathered.reachouts),
    input: { label: 'Company', value: gathered.company },
    actions: [{ label: `Add ${n} rows to the sheet`, message: { type: ADD_MESSAGE } }],
  });
}

/** "Add … to the sheet" clicked in the overlay. Returns whether the message was ours. */
export function onReachoutsMessage(message: unknown, sender: chrome.runtime.MessageSender): boolean {
  const m = message as { type?: unknown; input?: unknown } | null;
  if (m?.type !== ADD_MESSAGE || sender.tab?.id === undefined) return false;
  const tabId = sender.tab.id;
  const company = typeof m.input === 'string' ? m.input : '';

  void (async () => {
    const key = pendingKey(tabId);
    const pending = (await chrome.storage.session.get(key))[key] as Pending | undefined;
    if (!pending) {
      return show(tabId, { tone: 'error', heading: 'Those rows have expired', detail: 'Run Add Reachouts to Sheet again.' });
    }
    const loaded = await loadSettings(chrome.storage.local, ['sheetWebhookUrl']);
    if (!loaded.ok) return show(tabId, NOT_SET_UP);

    const rows = pending.rows.map(([, ...rest]) => [company, ...rest]);
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
