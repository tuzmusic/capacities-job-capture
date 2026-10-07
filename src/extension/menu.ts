import { task as jobListing } from '../job-listing-to-capacities/meta.ts';
import { task as mutuals } from '../scroll-page-and-get-mutuals/meta.ts';

/** The toolbar menu, in order. Each item is one module under src/. */
export const MENU = [jobListing, mutuals] as const;

export type TaskId = (typeof MENU)[number]['id'];

export const RUN_TASK_MESSAGE = 'run-task';
export interface RunTaskMessage {
  type: typeof RUN_TASK_MESSAGE;
  taskId: TaskId;
  tabId: number;
}
