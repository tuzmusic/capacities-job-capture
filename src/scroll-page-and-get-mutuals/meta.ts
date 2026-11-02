/** The menu entries. Kept apart from ./run.ts so the popup doesn't bundle the task itself. */
export const peoplePageTask = {
  id: 'get-mutuals',
  label: 'Get Mutuals from People Page',
  hint: "LinkedIn company → its Engineering people page (about 75 shown) → mutuals into the Job's contacts",
} as const;

export const searchTask = {
  id: 'get-mutuals-with-search',
  label: 'Get Mutuals with Search',
  hint: 'The same, plus people search for the company’s engineers in your network (up to 100 more, in a background tab)',
} as const;
