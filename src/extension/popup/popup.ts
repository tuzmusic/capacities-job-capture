import { MENU, RUN_TASK_MESSAGE, type RunTaskMessage, type TaskId } from '../menu.ts';

const menu = document.getElementById('menu')!;

async function run(taskId: TaskId) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined) return;
  await chrome.runtime.sendMessage({ type: RUN_TASK_MESSAGE, taskId, tabId: tab.id } satisfies RunTaskMessage);
  window.close();
}

MENU.forEach((item, i) => {
  const li = document.createElement('li');
  const button = document.createElement('button');
  button.type = 'button';
  const key = document.createElement('kbd');
  key.textContent = String(i + 1);
  const text = document.createElement('div');
  const label = document.createElement('div');
  label.className = 'label';
  label.textContent = item.label;
  const hint = document.createElement('div');
  hint.className = 'hint';
  hint.textContent = item.hint;
  text.append(label, hint);
  button.append(key, text);
  button.addEventListener('click', () => void run(item.id));
  li.append(button);
  menu.append(li);
});

// 1, 2, …: pick by number, so the shortcut + a digit runs a task without the mouse.
document.addEventListener('keydown', (e) => {
  const item = MENU[Number(e.key) - 1];
  if (item) void run(item.id);
});

document.getElementById('options')!.addEventListener('click', (e) => {
  e.preventDefault();
  void chrome.runtime.openOptionsPage();
});
