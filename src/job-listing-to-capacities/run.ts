import Anthropic from '@anthropic-ai/sdk';
import {
  appendBlocks,
  appendToSection,
  createObjectFromMarkdown,
  EMPTY_PARAGRAPH,
  JOB_SECTION_PROPERTY_IDS,
} from '../shared/capacities.ts';
import type { OverlayState } from '../shared/overlay.ts';
import { recordSavedJob } from '../shared/savedJobs.ts';
import { loadSettings } from '../shared/settings.ts';
import { show, sleep, waitForLoad } from '../shared/tabs.ts';
import captureScript from './content/capture.ts?script&iife';
import { extractFields } from './lib/extractFields.ts';
import { findApplicationForm } from './lib/findApplicationForm.ts';
import type { PageCapture } from './lib/pageCapture.ts';
import { pickBestCapture } from './lib/pickBestCapture.ts';
import { saveJob, type SaveResult } from './lib/saveJob.ts';

function resultOverlay(result: SaveResult): OverlayState {
  return result.status === 'saved'
    ? { tone: 'success', heading: 'Saved to Capacities', detail: result.title }
    : { tone: 'error', heading: 'Not saved', detail: result.message };
}

/** Captures every frame and keeps the richest one, so embedded ATS iframes (?gh_jid=...) are covered. */
async function captureTab(tabId: number): Promise<PageCapture | null> {
  const run = async (allFrames: boolean) => {
    const target = { tabId, allFrames };
    await chrome.scripting.executeScript({ target, files: [captureScript] });
    const results = await chrome.scripting.executeScript({
      target,
      func: () =>
        (globalThis as { __capacitiesJobCapture?: () => unknown }).__capacitiesJobCapture?.() ?? null,
    });
    return pickBestCapture(results.map((r) => r.result as PageCapture | null));
  };
  // One uninjectable frame (sandboxed ad iframe, etc.) can fail the all-frames call; fall back to the top frame.
  return run(true).catch(() => run(false));
}

/** Client-rendered apply pages (Ashby, etc.) draw the form a moment after load; keep looking this long. */
const FORM_RENDER_WAIT_MS = 6000;

/** Clicks the "Apply" button in whichever frame has one (the capture script must already be injected). */
async function clickApply(tabId: number): Promise<void> {
  await chrome.scripting
    .executeScript({
      target: { tabId, allFrames: true },
      func: () => (globalThis as { __capacitiesJobClickApply?: () => boolean }).__capacitiesJobClickApply?.() ?? false,
    })
    .catch(() => {});
}

/** A click before the page's scripts have hooked up the button does nothing, so try a few times, spaced out. */
const MAX_APPLY_CLICKS = 3;
const POLLS_BETWEEN_CLICKS = 3;

/**
 * Opens `url` in a background tab next to the job, captures it once the form shows up (or we give up), and closes it.
 * With `clickApply`, it's the posting itself, with an "Apply" button that reveals the form in place: click it first.
 * Doing this in a separate tab leaves the user's own tab alone.
 */
async function captureInBackgroundTab(
  url: string,
  nextTo: chrome.tabs.Tab,
  { clickApply: shouldClick = false } = {},
): Promise<PageCapture | null> {
  const tab = await chrome.tabs.create({ url, active: false, windowId: nextTo.windowId, index: nextTo.index + 1 });
  const tabId = tab.id!;
  try {
    await waitForLoad(tabId, 15000);
    const deadline = Date.now() + FORM_RENDER_WAIT_MS;
    let capture: PageCapture | null = null;
    for (let poll = 0; ; poll++) {
      capture = await captureTab(tabId).catch(() => null);
      if (capture?.applicationForm.found || Date.now() > deadline) return capture;
      if (shouldClick && poll % POLLS_BETWEEN_CLICKS === 0 && poll / POLLS_BETWEEN_CLICKS < MAX_APPLY_CLICKS) {
        await clickApply(tabId);
      }
      await sleep(500);
    }
  } finally {
    await chrome.tabs.remove(tabId).catch(() => {});
  }
}

/** Menu item: saves the job posting in `tab` as a Capacities Job. */
export async function saveJobListing(tab: chrome.tabs.Tab) {
  const tabId = tab.id;
  if (tabId === undefined) return;

  const loaded = await loadSettings(chrome.storage.local);
  if (!loaded.ok) return show(tabId, { tone: 'error', heading: 'Not saved', detail: loaded.message });
  const { anthropicApiKey, capacitiesApiToken } = loaded.settings;

  await show(tabId, { tone: 'busy', heading: 'Saving job to Capacities…' });

  let result: SaveResult;
  try {
    const capture = await captureTab(tabId);
    // Link the posting as you see it in the address bar, even if the content came from an embedded frame.
    const withTabUrl = capture && tab.url ? { ...capture, url: tab.url } : capture;
    const anthropic = new Anthropic({ apiKey: anthropicApiKey, dangerouslyAllowBrowser: true });
    result = await saveJob(withTabUrl, {
      findForm: (c) => findApplicationForm(c, { fetch, capturePage: (url, opts) => captureInBackgroundTab(url, tab, opts) }),
      extract: (page) => extractFields(anthropic, page),
      create: (markdown) => createObjectFromMarkdown({ fetch, token: capacitiesApiToken, markdown }),
      appendSection: (id, section, markdown) =>
        appendToSection({ fetch, token: capacitiesApiToken, id, propertyId: JOB_SECTION_PROPERTY_IDS[section], markdown }),
      appendEmptyLine: (id, section) =>
        appendBlocks({
          fetch,
          token: capacitiesApiToken,
          id,
          propertyId: JOB_SECTION_PROPERTY_IDS[section],
          blocks: [EMPTY_PARAGRAPH],
        }),
    });
  } catch (err) {
    result = { status: 'error', message: err instanceof Error ? err.message : String(err) };
  }

  if (result.status === 'saved') {
    const { objectId, title, company } = result;
    await recordSavedJob(chrome.storage.local, { objectId, title, company, url: tab.url ?? '', savedAt: Date.now() }).catch(
      () => {},
    );
  }
  await show(tabId, resultOverlay(result));
}
