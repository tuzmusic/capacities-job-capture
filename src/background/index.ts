import Anthropic from '@anthropic-ai/sdk';
import captureScript from '../content/capture.ts?script&iife';
import { appendBlocks, createObjectFromMarkdown, JOB_SECTION_PROPERTY_IDS } from '../lib/capacities.ts';
import { extractFields } from '../lib/extractFields.ts';
import { findApplicationForm } from '../lib/findApplicationForm.ts';
import { showOverlay, type OverlayState } from '../lib/overlay.ts';
import type { PageCapture } from '../lib/pageCapture.ts';
import { pickBestCapture } from '../lib/pickBestCapture.ts';
import { saveJob, type SaveResult } from '../lib/saveJob.ts';
import { loadSettings } from '../lib/settings.ts';

const BADGE: Record<OverlayState['status'], { text: string; color: string }> = {
  saving: { text: '…', color: '#8e8e93' },
  saved: { text: '✓', color: '#2e9d5b' },
  error: { text: '✗', color: '#d93a3a' },
};

async function show(tabId: number, state: OverlayState) {
  const badge = BADGE[state.status];
  await chrome.action.setBadgeText({ tabId, text: badge.text });
  await chrome.action.setBadgeBackgroundColor({ tabId, color: badge.color });
  await chrome.scripting.executeScript({ target: { tabId }, func: showOverlay, args: [state] }).catch(() => {});
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

/** Resolves once the tab has finished loading, or after `timeoutMs`, whichever comes first. */
function waitForLoad(tabId: number, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      resolve();
    };
    const onUpdated = (id: number, info: chrome.tabs.OnUpdatedInfo) => {
      if (id === tabId && info.status === 'complete') done();
    };
    const timer = setTimeout(done, timeoutMs);
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.get(tabId).then((t) => t.status === 'complete' && done(), done);
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Client-rendered apply pages (Ashby, etc.) draw the form a moment after load; keep looking this long. */
const FORM_RENDER_WAIT_MS = 6000;

/** Opens `url` in a background tab next to the job, captures it once the form shows up (or we give up), and closes it. */
async function captureInBackgroundTab(url: string, nextTo: chrome.tabs.Tab): Promise<PageCapture | null> {
  const tab = await chrome.tabs.create({ url, active: false, windowId: nextTo.windowId, index: nextTo.index + 1 });
  const tabId = tab.id!;
  try {
    await waitForLoad(tabId, 15000);
    const deadline = Date.now() + FORM_RENDER_WAIT_MS;
    let capture: PageCapture | null = null;
    while (true) {
      capture = await captureTab(tabId).catch(() => null);
      if (capture?.applicationForm.found || Date.now() > deadline) return capture;
      await sleep(500);
    }
  } finally {
    await chrome.tabs.remove(tabId).catch(() => {});
  }
}

async function saveCurrentTab(tab: chrome.tabs.Tab) {
  const tabId = tab.id;
  if (tabId === undefined) return;

  const loaded = await loadSettings(chrome.storage.local);
  if (!loaded.ok) return show(tabId, { status: 'error', message: loaded.message });
  const { anthropicApiKey, capacitiesApiToken } = loaded.settings;

  await show(tabId, { status: 'saving' });

  let result: SaveResult;
  try {
    const capture = await captureTab(tabId);
    // Link the posting as you see it in the address bar, even if the content came from an embedded frame.
    const withTabUrl = capture && tab.url ? { ...capture, url: tab.url } : capture;
    const anthropic = new Anthropic({ apiKey: anthropicApiKey, dangerouslyAllowBrowser: true });
    result = await saveJob(withTabUrl, {
      findForm: (c) => findApplicationForm(c, { fetch, capturePage: (url) => captureInBackgroundTab(url, tab) }),
      extract: (page) => extractFields(anthropic, page),
      create: (markdown) => createObjectFromMarkdown({ fetch, token: capacitiesApiToken, markdown }),
      appendSection: (id, section, markdown) =>
        appendBlocks({ fetch, token: capacitiesApiToken, id, propertyId: JOB_SECTION_PROPERTY_IDS[section], markdown }),
    });
  } catch (err) {
    result = { status: 'error', message: err instanceof Error ? err.message : String(err) };
  }

  await show(tabId, result);
}

chrome.action.onClicked.addListener((tab) => void saveCurrentTab(tab));
