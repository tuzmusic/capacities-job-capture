import { describe, expect, it } from 'vitest';
import { listSavedJobs, recordSavedJob, type SavedJob, type SavedJobsStorage } from './savedJobs.ts';

function memoryStorage(): SavedJobsStorage {
  const data: Record<string, unknown> = {};
  return {
    get: async (keys) => Object.fromEntries(keys.filter((k) => k in data).map((k) => [k, data[k]])),
    set: async (items) => void Object.assign(data, items),
  };
}

const job = (objectId: string, savedAt: number): SavedJob => ({
  objectId,
  title: `Grafana - ${objectId}`,
  company: 'Grafana Labs',
  url: `https://example.com/${objectId}`,
  savedAt,
});

describe('saved jobs', () => {
  it('starts empty', async () => {
    await expect(listSavedJobs(memoryStorage())).resolves.toEqual([]);
  });

  it('lists newest first and replaces a re-saved object', async () => {
    const storage = memoryStorage();
    await recordSavedJob(storage, job('a', 1));
    await recordSavedJob(storage, job('b', 2));
    await recordSavedJob(storage, job('a', 3));
    expect((await listSavedJobs(storage)).map((j) => [j.objectId, j.savedAt])).toEqual([
      ['a', 3],
      ['b', 2],
    ]);
  });
});
