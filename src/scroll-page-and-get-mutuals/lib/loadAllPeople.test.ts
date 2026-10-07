import { describe, expect, it, vi } from 'vitest';
import { loadAllPeople, type LoadDeps } from './loadAllPeople.ts';
import type { Person } from './peoplePage.ts';

const person = (n: number, ...mutuals: string[]): Person => ({
  name: `P${n}`,
  title: 'Engineer',
  url: `https://www.linkedin.com/in/p${n}`,
  degree: '2',
  mutuals,
});

/**
 * A fake people list: `total` people, `pageSize` per click. `clickWorks(n)` says whether the nth click (counting
 * from 1 across the whole run) loads more; reload() resets the list to its first page.
 */
function fakeList({
  total,
  pageSize = 10,
  clickWorks = () => true,
  initial = pageSize,
}: {
  total: number;
  pageSize?: number;
  clickWorks?: (n: number) => boolean;
  initial?: number;
}) {
  let shown = Math.min(initial, total);
  let clicks = 0;
  const deps: LoadDeps & { reload: ReturnType<typeof vi.fn> } = {
    count: async () => shown,
    clickMore: async () => {
      if (shown >= total) return { cards: shown, clicked: false };
      clicks++;
      if (clickWorks(clicks)) shown = Math.min(total, shown + pageSize);
      return { cards: shown, clicked: true };
    },
    scrape: async () => Array.from({ length: shown }, (_, i) => person(i)),
    reload: vi.fn(async () => {
      shown = Math.min(initial, total);
    }),
    sleep: async () => {},
  };
  return deps;
}

describe('loadAllPeople', () => {
  it('clicks until the button is gone and returns everyone', async () => {
    const deps = fakeList({ total: 35 });
    const result = await loadAllPeople(deps);
    expect(result.complete).toBe(true);
    expect(result.people).toHaveLength(35);
    expect(deps.reload).not.toHaveBeenCalled();
  });

  it('retries after a stall without reloading when a later attempt works', async () => {
    // Clicks 3–6 do nothing (one stalled attempt), then it works again.
    const deps = fakeList({ total: 50, clickWorks: (n) => n < 3 || n > 6 });
    const result = await loadAllPeople(deps);
    expect(result).toMatchObject({ complete: true });
    expect(result.people).toHaveLength(50);
    expect(deps.reload).not.toHaveBeenCalled();
  });

  it('reloads after repeated stalls, and keeps people seen before the reload', async () => {
    let reloaded = false;
    const deps = fakeList({ total: 40, clickWorks: () => reloaded });
    const reload = deps.reload.getMockImplementation() as () => Promise<void>;
    deps.reload.mockImplementation(async () => {
      reloaded = true;
      await reload();
    });
    const result = await loadAllPeople(deps);
    expect(deps.reload).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ complete: true });
    expect(result.people).toHaveLength(40);
  });

  it('gives up after the last reload and returns what it saw, marked incomplete', async () => {
    const deps = fakeList({ total: 100, clickWorks: (n) => n <= 2 });
    const result = await loadAllPeople(deps, { reloads: 2 });
    expect(deps.reload).toHaveBeenCalledTimes(2);
    expect(result.complete).toBe(false);
    expect(result.people).toHaveLength(30);
  });

  it('counts a short list with no button as complete', async () => {
    const result = await loadAllPeople(fakeList({ total: 4 }));
    expect(result).toMatchObject({ complete: true });
    expect(result.people).toHaveLength(4);
  });

  it('keeps a person’s mutuals when a later read missed them', async () => {
    const deps = fakeList({ total: 1 });
    let reads = 0;
    deps.scrape = async () => [person(0, ...(reads++ === 0 ? ['Pat'] : []))];
    deps.clickMore = async () => ({ cards: 1, clicked: true }); // button never goes away: stalls every attempt
    const result = await loadAllPeople(deps, { reloads: 1 });
    expect(result.people).toEqual([person(0, 'Pat')]);
  });

  it('reloads when the first cards never show up', async () => {
    const deps = fakeList({ total: 5, initial: 0 });
    deps.reload.mockImplementation(async () => {
      deps.count = async () => 5;
      deps.clickMore = async () => ({ cards: 5, clicked: false });
      deps.scrape = async () => Array.from({ length: 5 }, (_, i) => person(i));
    });
    const result = await loadAllPeople(deps);
    expect(deps.reload).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ complete: true });
  });
});
