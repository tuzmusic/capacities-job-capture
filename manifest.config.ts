import { defineManifest } from '@crxjs/vite-plugin';

export default defineManifest({
  manifest_version: 3,
  name: 'Capacities Job Capture',
  version: '0.1.0',
  description: 'One click: save the job posting in this tab as a Capacities Job.',
  action: { default_title: 'Save job to Capacities' },
  commands: {
    _execute_action: { suggested_key: { default: 'Alt+Shift+J' }, description: 'Save job to Capacities' },
  },
  // <all_urls> so we can read cross-origin ATS iframes (e.g. company.com/careers?gh_jid=...) and call both APIs.
  permissions: ['scripting', 'storage', 'activeTab'],
  host_permissions: ['<all_urls>'],
  background: { service_worker: 'src/background/index.ts', type: 'module' },
  options_page: 'src/options/options.html',
});
