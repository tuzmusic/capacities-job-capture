/**
 * Every Job this extension has saved, newest first, kept in chrome.storage.local. Capacities search only matches
 * titles, so this is how other tasks find a Job by its company even when the title abbreviates it.
 */
export interface SavedJob {
  objectId: string;
  /** Object title, e.g. "Grafana - Sr FE". */
  title: string;
  /** Company name as the posting writes it, e.g. "Grafana Labs". */
  company: string;
  /** The posting's URL. */
  url: string;
  savedAt: number;
}

/** The part of chrome.storage.local we use. */
export interface SavedJobsStorage {
  get: (keys: string[]) => Promise<Record<string, unknown>>;
  set: (items: Record<string, unknown>) => Promise<void>;
}

const KEY = 'savedJobs';
const MAX_SAVED = 500;

export async function listSavedJobs(storage: SavedJobsStorage): Promise<SavedJob[]> {
  const raw = (await storage.get([KEY]))[KEY];
  return Array.isArray(raw) ? (raw as SavedJob[]) : [];
}

export async function recordSavedJob(storage: SavedJobsStorage, job: SavedJob): Promise<void> {
  const others = (await listSavedJobs(storage)).filter((j) => j.objectId !== job.objectId);
  await storage.set({ [KEY]: [job, ...others].slice(0, MAX_SAVED) });
}
