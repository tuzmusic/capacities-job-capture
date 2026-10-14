/** API keys live in chrome.storage.local (this device only). Personal, unpacked extension: never publish it. */
export interface Settings {
  anthropicApiKey: string;
  capacitiesApiToken: string;
  /** The /exec URL of the Job Search Contacts sheet's Apps Script web app (src/log-reachouts/apps-script). */
  sheetWebhookUrl: string;
}

export const SETTINGS_KEYS = ['anthropicApiKey', 'capacitiesApiToken', 'sheetWebhookUrl'] as const;

/** What's required unless a task says otherwise: the sheet URL is only for Add Reachouts to Sheet. */
const API_KEYS = ['anthropicApiKey', 'capacitiesApiToken'] as const;

const LABELS: Record<keyof Settings, string> = {
  anthropicApiKey: 'Anthropic API key',
  capacitiesApiToken: 'Capacities API token',
  sheetWebhookUrl: 'Google Sheet web app URL',
};

/** The part of chrome.storage.local we use. */
export type SettingsStorage = { get: (keys: string[]) => Promise<Record<string, unknown>> };

/** Checks only the keys in `required`, so a task that doesn't call Claude doesn't need an Anthropic key. */
export async function loadSettings(
  storage: SettingsStorage,
  required: readonly (keyof Settings)[] = API_KEYS,
): Promise<{ ok: true; settings: Settings } | { ok: false; message: string }> {
  const raw = await storage.get([...SETTINGS_KEYS]);
  const settings = Object.fromEntries(
    SETTINGS_KEYS.map((k) => [k, typeof raw[k] === 'string' ? (raw[k] as string).trim() : '']),
  ) as unknown as Settings;

  const missing = required.filter((k) => !settings[k]).map((k) => LABELS[k]);
  if (missing.length) return { ok: false, message: `Set your ${missing.join(' and ')} in the extension options.` };
  return { ok: true, settings };
}
