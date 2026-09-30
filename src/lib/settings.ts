/** API keys live in chrome.storage.local (this device only). Personal, unpacked extension: never publish it. */
export interface Settings {
  anthropicApiKey: string;
  capacitiesApiToken: string;
}

export const SETTINGS_KEYS = ['anthropicApiKey', 'capacitiesApiToken'] as const;

const LABELS: Record<keyof Settings, string> = {
  anthropicApiKey: 'Anthropic API key',
  capacitiesApiToken: 'Capacities API token',
};

/** The part of chrome.storage.local we use. */
export type SettingsStorage = { get: (keys: string[]) => Promise<Record<string, unknown>> };

export async function loadSettings(
  storage: SettingsStorage,
): Promise<{ ok: true; settings: Settings } | { ok: false; message: string }> {
  const raw = await storage.get([...SETTINGS_KEYS]);
  const settings = Object.fromEntries(
    SETTINGS_KEYS.map((k) => [k, typeof raw[k] === 'string' ? (raw[k] as string).trim() : '']),
  ) as unknown as Settings;

  const missing = SETTINGS_KEYS.filter((k) => !settings[k]).map((k) => LABELS[k]);
  if (missing.length) return { ok: false, message: `Set your ${missing.join(' and ')} in the extension options.` };
  return { ok: true, settings };
}
