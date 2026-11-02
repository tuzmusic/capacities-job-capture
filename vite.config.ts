import { defineConfig } from 'vitest/config';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.config.ts';

export default defineConfig({
  // No live reload: it reloads every tab the extension has touched on each save. Reload the extension by hand instead.
  plugins: [crx({ manifest, liveReload: false })],
  test: { environment: 'happy-dom' },
});
