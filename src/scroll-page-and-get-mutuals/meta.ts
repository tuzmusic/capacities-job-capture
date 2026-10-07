/** The menu entry. Kept apart from ./run.ts so the popup doesn't bundle the task itself. */
export const task = {
  id: 'scroll-page-and-get-mutuals',
  label: 'Scroll Page & Get Mutuals',
  hint: "LinkedIn company page → Engineering people → mutuals into the Job's contacts",
} as const;
