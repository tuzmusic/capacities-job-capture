import { describe, expect, it, vi } from 'vitest';
import type { SavedJob } from '../../shared/savedJobs.ts';
import { findJobNotes, sameCompany } from './findJobNotes.ts';

const hit = (id: string, title: string) => ({ id, structureId: 'job', title });
const saved = (objectId: string, title: string, company: string): SavedJob => ({
  objectId,
  title,
  company,
  url: '',
  savedAt: 0,
});

describe('sameCompany', () => {
  it('matches suffix and prefix variants, but not different companies', () => {
    expect(sameCompany('Grafana Labs', 'Grafana')).toBe(true);
    expect(sameCompany('Scale AI', 'scale')).toBe(true);
    expect(sameCompany('Fly.io', 'Fly')).toBe(true);
    expect(sameCompany('Café Inc.', 'Cafe')).toBe(true);
    expect(sameCompany('Meta', 'Metabase')).toBe(false);
    expect(sameCompany('Labs', '')).toBe(false);
  });
});

describe('findJobNotes', () => {
  it('returns saved jobs and search hits for the company, once each', async () => {
    const search = vi.fn().mockResolvedValue([hit('a', 'Grafana - Sr FE'), hit('b', 'Grafana - Staff'), hit('c', 'Grafanaish - x')]);
    const notes = await findJobNotes({
      company: 'Grafana Labs',
      saved: [saved('b', 'Grafana - Staff', 'Grafana Labs'), saved('z', 'Postscript - FE', 'Postscript')],
      search,
    });
    expect(notes).toEqual([
      { id: 'b', title: 'Grafana - Staff' },
      { id: 'a', title: 'Grafana - Sr FE' },
    ]);
    expect(search).toHaveBeenCalledOnce();
    expect(search).toHaveBeenCalledWith('Grafana Labs');
  });

  it('retries search with the first word when the full name finds nothing', async () => {
    const search = vi.fn(async (q: string) => (q === 'Grafana' ? [hit('a', 'Grafana - Sr FE')] : []));
    await expect(findJobNotes({ company: 'Grafana Labs', saved: [], search })).resolves.toEqual([
      { id: 'a', title: 'Grafana - Sr FE' },
    ]);
    expect(search.mock.calls.map((c) => c[0])).toEqual(['Grafana Labs', 'Grafana']);
  });
});
