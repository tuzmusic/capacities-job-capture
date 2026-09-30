import { describe, expect, it } from 'vitest';
import { loadSettings, type SettingsStorage } from './settings.ts';

const storage = (data: Record<string, unknown>): SettingsStorage => ({ get: async () => data });

describe('loadSettings', () => {
  it('returns both keys when set', async () => {
    await expect(loadSettings(storage({ anthropicApiKey: 'sk-ant-x', capacitiesApiToken: 'cap-api-y' }))).resolves.toEqual({
      ok: true,
      settings: { anthropicApiKey: 'sk-ant-x', capacitiesApiToken: 'cap-api-y' },
    });
  });

  it('trims whitespace from pasted keys', async () => {
    const result = await loadSettings(storage({ anthropicApiKey: ' sk-ant-x\n', capacitiesApiToken: ' cap-api-y ' }));
    expect(result).toEqual({ ok: true, settings: { anthropicApiKey: 'sk-ant-x', capacitiesApiToken: 'cap-api-y' } });
  });

  it('names the missing keys', async () => {
    await expect(loadSettings(storage({ anthropicApiKey: 'sk-ant-x' }))).resolves.toEqual({
      ok: false,
      message: 'Set your Capacities API token in the extension options.',
    });
    await expect(loadSettings(storage({ anthropicApiKey: '  ' }))).resolves.toEqual({
      ok: false,
      message: 'Set your Anthropic API key and Capacities API token in the extension options.',
    });
  });
});
