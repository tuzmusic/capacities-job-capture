import { showOverlay, type OverlayState, type OverlayTone } from './overlay.ts';

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Resolves once the tab has finished loading, or after `timeoutMs`, whichever comes first. */
export function waitForLoad(tabId: number, timeoutMs: number): Promise<void> {
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

const BADGE: Record<OverlayTone, { text: string; color: string }> = {
  busy: { text: '…', color: '#8e8e93' },
  success: { text: '✓', color: '#2e9d5b' },
  warning: { text: '!', color: '#d9a23a' },
  error: { text: '✗', color: '#d93a3a' },
};

/** Shows `state` in the page's overlay and as the toolbar icon badge. */
export async function show(tabId: number, state: OverlayState): Promise<void> {
  const badge = BADGE[state.tone];
  await chrome.action.setBadgeText({ tabId, text: badge.text }).catch(() => {});
  await chrome.action.setBadgeBackgroundColor({ tabId, color: badge.color }).catch(() => {});
  await chrome.scripting.executeScript({ target: { tabId }, func: showOverlay, args: [state] }).catch(() => {});
}
