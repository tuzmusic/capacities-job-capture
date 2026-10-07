import type { Person } from './peoplePage.ts';

/**
 * Clicks "Show more results" until LinkedIn has shown everyone. LinkedIn's list is flaky: clicks sometimes do
 * nothing, sometimes work again a few seconds later, sometimes only after a reload. So: click until the list stops
 * growing, try again a couple of times spaced out, then reload and start over, and keep everyone seen along the way.
 */
export interface LoadDeps {
  /** How many people cards are on the page; null if the page can't be read right now. */
  count: () => Promise<number | null>;
  /** Clicks "Show more results" once if it's there; null if the page can't be read right now. */
  clickMore: () => Promise<{ cards: number; clicked: boolean } | null>;
  scrape: () => Promise<Person[]>;
  /** Reloads the tab and waits for it to load. */
  reload: () => Promise<void>;
  sleep: (ms: number) => Promise<void>;
  onProgress?: (progress: LoadProgress) => void | Promise<void>;
}

export interface LoadProgress {
  /** People seen so far (the most on the page now, or merged from earlier attempts). */
  people: number;
  /** 1-based; each reload starts a new round. */
  round: number;
  /** 1-based, within the round. */
  attempt: number;
}

export interface LoadOptions {
  /** The pace of the bookmarklet this replaces. */
  clickDelayMs: number;
  /** Steps with no new people before an attempt gives up. */
  stallSteps: number;
  /** Steps in a row with no button and no new people before we call it everyone. */
  doneSteps: number;
  maxStepsPerAttempt: number;
  attemptsPerRound: number;
  attemptGapMs: number;
  /** Rounds after the first, each starting with a reload. */
  reloads: number;
  /** How long to wait for the first cards to show up after a load, in 1-second polls. */
  readyPolls: number;
}

export const DEFAULT_LOAD_OPTIONS: LoadOptions = {
  clickDelayMs: 2000,
  stallSteps: 4,
  doneSteps: 3,
  maxStepsPerAttempt: 150,
  attemptsPerRound: 3,
  attemptGapMs: 4000,
  reloads: 2,
  readyPolls: 15,
};

export interface LoadResult {
  people: Person[];
  /** The list ran out (no more button). False if we gave up, so there may be more people than we got. */
  complete: boolean;
}

export async function loadAllPeople(deps: LoadDeps, options: Partial<LoadOptions> = {}): Promise<LoadResult> {
  const o = { ...DEFAULT_LOAD_OPTIONS, ...options };
  const seen = new Map<string, Person>();
  const merge = (people: Person[]) => {
    for (const p of people) {
      const prev = seen.get(p.url);
      // A card can render before its mutuals line does; keep the richer read.
      if (!prev || (!prev.mutuals.length && p.mutuals.length)) seen.set(p.url, p);
    }
  };
  const result = (complete: boolean): LoadResult => ({ people: [...seen.values()], complete });

  const waitForCards = async () => {
    for (let i = 0; i < o.readyPolls; i++) {
      if (((await deps.count()) ?? 0) > 0) return true;
      await deps.sleep(1000);
    }
    return false;
  };

  const clickUntilDone = async (round: number, attempt: number): Promise<'complete' | 'stalled'> => {
    let last = (await deps.count()) ?? 0;
    let stalled = 0;
    let noButton = 0;
    for (let step = 0; step < o.maxStepsPerAttempt; step++) {
      const r = await deps.clickMore();
      await deps.sleep(o.clickDelayMs);
      const now = (await deps.count()) ?? last;
      if (now > last) {
        last = now;
        stalled = 0;
        noButton = 0;
      } else {
        stalled++;
        noButton = r && !r.clicked ? noButton + 1 : 0;
      }
      await deps.onProgress?.({ people: Math.max(last, seen.size), round, attempt });
      if (noButton >= o.doneSteps) return 'complete';
      if (stalled >= o.stallSteps) return 'stalled';
    }
    return 'stalled';
  };

  for (let round = 1; round <= o.reloads + 1; round++) {
    if (round > 1) await deps.reload();
    if (!(await waitForCards())) continue;
    for (let attempt = 1; attempt <= o.attemptsPerRound; attempt++) {
      if (attempt > 1) await deps.sleep(o.attemptGapMs);
      const outcome = await clickUntilDone(round, attempt);
      merge(await deps.scrape().catch(() => []));
      if (outcome === 'complete') return result(true);
    }
  }
  return result(false);
}
