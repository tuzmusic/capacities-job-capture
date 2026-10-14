/** The menu entries. Kept apart from ./run.ts so the popup doesn't bundle the task itself. */
export const copyTask = {
  id: 'copy-reachouts',
  label: 'Copy Reachouts',
  hint: 'LinkedIn profiles open in this window → rows to paste into the Job Search Contacts sheet',
} as const;

export const sheetTask = {
  id: 'add-reachouts-to-sheet',
  label: 'Add Reachouts to Sheet',
  hint: "The same rows, written into the sheet (needs the sheet's web app URL in Options)",
} as const;
