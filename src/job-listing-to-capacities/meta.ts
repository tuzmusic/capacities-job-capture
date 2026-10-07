/** The menu entry. Kept apart from ./run.ts so the popup doesn't bundle the task itself. */
export const task = {
  id: 'job-listing-to-capacities',
  label: 'Save Job Listing to Capacities',
  hint: 'The job posting in this tab → a new Capacities Job',
} as const;
