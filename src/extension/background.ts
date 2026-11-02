import { saveJobListing } from '../job-listing-to-capacities/run.ts';
import { addReachoutsToSheet, copyReachouts, onReachoutsMessage } from '../log-reachouts/run.ts';
import { getMutuals, onMutualsMessage, scrollPageAndGetMutuals } from '../scroll-page-and-get-mutuals/run.ts';
import { RUN_TASK_MESSAGE, type RunTaskMessage, type TaskId } from './menu.ts';

const TASKS: Record<TaskId, (tab: chrome.tabs.Tab) => Promise<void>> = {
  'job-listing-to-capacities': saveJobListing,
  'scroll-page-and-get-mutuals': scrollPageAndGetMutuals,
  'get-mutuals': getMutuals,
  'copy-reachouts': copyReachouts,
  'add-reachouts-to-sheet': addReachoutsToSheet,
};

const isTaskId = (id: unknown): id is TaskId => typeof id === 'string' && Object.hasOwn(TASKS, id);

// The popup menu picks a task, then closes; the task runs here so it outlives the popup.
chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  const m = message as Partial<RunTaskMessage> | null;
  if (m?.type === RUN_TASK_MESSAGE && sender.tab === undefined && isTaskId(m.taskId) && typeof m.tabId === 'number') {
    const run = TASKS[m.taskId];
    void chrome.tabs.get(m.tabId).then((tab) => run(tab));
    sendResponse({ ok: true });
    return;
  }
  if (!onMutualsMessage(message, sender)) onReachoutsMessage(message, sender);
});

// Each task can also have its own keyboard shortcut (chrome://extensions/shortcuts).
chrome.commands.onCommand.addListener((command, tab) => {
  if (isTaskId(command) && tab) void TASKS[command](tab);
});
