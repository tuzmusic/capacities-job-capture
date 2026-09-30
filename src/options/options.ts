import { SETTINGS_KEYS } from '../lib/settings.ts';

const input = (key: string) => document.getElementById(key) as HTMLInputElement;
const status = document.getElementById('status')!;

chrome.storage.local.get([...SETTINGS_KEYS]).then((saved) => {
  for (const key of SETTINGS_KEYS) input(key).value = (saved[key] as string | undefined) ?? '';
});

document.getElementById('form')!.addEventListener('submit', async (e) => {
  e.preventDefault();
  await chrome.storage.local.set(Object.fromEntries(SETTINGS_KEYS.map((k) => [k, input(k).value.trim()])));
  status.textContent = 'Saved.';
  setTimeout(() => (status.textContent = ''), 2000);
});
