import { defineManifest } from '@crxjs/vite-plugin';
import { MENU } from './src/extension/menu.ts';

export default defineManifest({
  manifest_version: 3,
  name: 'Capacities Job Capture',
  version: '0.2.0',
  description: 'Job-hunting helpers for Capacities: save job postings, collect LinkedIn mutuals.',
  action: { default_title: 'Capacities Job Capture', default_popup: 'src/extension/popup/popup.html' },
  commands: {
    _execute_action: { suggested_key: { default: 'Alt+Shift+J' }, description: 'Open the menu' },
    // No default keys: set them in chrome://extensions/shortcuts to skip the menu.
    ...Object.fromEntries(MENU.map((t) => [t.id, { description: t.label }])),
  },
  // <all_urls> so we can read cross-origin ATS iframes (e.g. company.com/careers?gh_jid=...) and call both APIs.
  permissions: ['scripting', 'storage', 'activeTab'],
  host_permissions: ['<all_urls>'],
  background: { service_worker: 'src/extension/background.ts', type: 'module' },
  options_page: 'src/extension/options/options.html',
});
