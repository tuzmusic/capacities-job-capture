import { task as jobListing } from '../job-listing-to-capacities/meta.ts';
import { peoplePageTask as mutualsFromPeoplePage, searchTask as mutualsWithSearch } from '../scroll-page-and-get-mutuals/meta.ts';
import { copyTask as copyReachouts, sheetTask as reachoutsToSheet } from '../log-reachouts/meta.ts';

/** The toolbar menu, in order. Each item comes from a module under src/. */
export const MENU = [jobListing, mutualsFromPeoplePage, mutualsWithSearch, copyReachouts, reachoutsToSheet] as const;

export type TaskId = (typeof MENU)[number]['id'];

export const RUN_TASK_MESSAGE = 'run-task';
export interface RunTaskMessage {
  type: typeof RUN_TASK_MESSAGE;
  taskId: TaskId;
  tabId: number;
}
