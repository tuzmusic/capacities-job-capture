# Capacities Job Capture

**One click turns a job posting into a structured note in [Capacities](https://capacities.io), or finds everyone you
know at the company.** The note gets the title, salary, a clean copy of the description, and exactly what the
application will ask of you. Your connections go into that same note, grouped by who can introduce you.

## Why

Every job you're considering raises the same questions: what does it pay, is a cover letter required, how many essay
questions are on the form, and do I know anyone there? Answering them means clicking through to the application
(often on a different site), reading past three screens of benefits copy, and scrolling a company's LinkedIn people
page for mutual connections, for every job.

This extension does that legwork and files the answers where you're tracking the search, so you can triage at a glance:
an **easy-apply** tag means no cover letter and no questions; *Cover letter (required)* plus four essay prompts means
block out an evening.

## What it does

1. **Save Job Listing to Capacities.** Captures the posting in your current tab (including logged-in and embedded ATS
   pages), finds the application form even when it's on a separate page, and writes a Job with salary, application
   requirements, and a clean copy of the description.
2. **Scroll Page & Get Mutuals.** On a LinkedIn company page, loads the full Engineering people list and writes your 1st-
   and 2nd-degree connections into that company's Job, grouped by who can introduce you.

Click the toolbar icon (or press **Alt+Shift+J**) for the menu, then click an item or press its number. Each item can
also get its own shortcut in `chrome://extensions/shortcuts`.

## How it's built

- **Chrome MV3**, **TypeScript**, **Vite** + **CRXJS**, tested with **Vitest** + happy-dom (no network or keys needed).
- **Claude Haiku** with structured output (**Zod** schema) for the judgment calls: salary, which form questions take
  real work. Deterministic filtering (dropping choice/contact fields, stripping benefits/EEO sections by heading) is
  done in code first, so the model sees less and costs well under a cent per job.
- **Readability** + **Turndown** to get the job description as clean markdown.
- **Greenhouse public API** for Greenhouse forms; for Lever, Ashby, and in-page "Apply" buttons, the form is read from a
  background tab so your tab is never touched.
- The **Capacities API** for creating objects, appending to a specific section, and finding the right Job by company.
- Each menu item is an independent module; everything testable takes its dependencies (API clients, fetch, storage) as
  arguments, and `run.ts` is thin Chrome wiring on top. Details below.

## Save Job Listing to Capacities

- **Title, Position, Salary range, Application Reqs** are filled by Claude Haiku from the page text (one call, well
  under a cent).
- **Application Reqs** always starts with *Cover letter (required)*, *Optional cover letter*, or *No cover letter!*,
  then lists only the questions that take work. Choice fields (selects, comboboxes, checkboxes, radios) and contact
  fields are dropped in code (`src/job-listing-to-capacities/lib/formFields.ts`); Haiku judges the free-text fields that remain.
- **Separate apply pages:** if the form isn't on the page you captured, it looks for it. Greenhouse jobs go through
  Greenhouse's public job board API. Lever (`/apply`), Ashby (`/application`), and any page's own "Apply" link are
  opened in a background tab, captured, and closed. With no link, an in-page "Apply" button (modal, tab, client-side
  route) is clicked in a background copy of the posting instead, so your tab is left alone. Workday, iCIMS, Taleo and the like aren't opened (login walls,
  multi-step forms). When the form still can't be read, Haiku adds a short reason, like "(Workday)" or "(needs login)".
- **easy-apply** tag is added when there's no required cover letter and no questions at all (an optional cover letter
  doesn't count, optional questions do). Only when the application form was found; otherwise Application Reqs says to check.
- Filled sections start with their content: the empty line the Job template puts in each section is removed once
  something's written there (a section left empty keeps it, so it can still be typed in).
- **Job Description** is copied verbatim (Readability → markdown). Sections like Benefits, Perks, "Why join us", and EEO
  are dropped by heading, with no AI involved. The patterns are in `src/job-listing-to-capacities/lib/sectionFilter.ts` (`DROP_HEADINGS`).
- **Status** defaults to *Info Gathering*. Everything else is left for you.
- Reads the tab you're already looking at, including embedded ATS iframes (`company.com/careers?gh_jid=...`), so
  JS-rendered and logged-in pages work.
- The result shows as a dialog in the page's top-right corner. It doesn't take focus and stays until you dismiss it.
  The toolbar icon badge also shows … / ✓ / ✗.

## Scroll Page & Get Mutuals

- **Where:** any `linkedin.com/company/…` page. It goes to `{company}/people/?facetCurrentFunction=8` (Engineering),
  or stays put if you're already there. Anywhere else it just says so.
- **Loading everyone:** clicks "Show more results" every 2s, like the old bookmarklet. When the list stops growing it
  waits and tries again (3 tries), then reloads the page and starts over (2 reloads). People seen in every attempt are
  kept, so a reload doesn't lose anyone. If it never gets to the end, the note says the list may be incomplete.
- **What's written:** appended to the Job's *1st & 2nd Degree Contacts* section, as bullets (no headings). 2nd-degree
  people are grouped under each mutual connection (biggest group first), so someone with two mutuals is listed under
  both. With only 2nd-degree people, the mutuals are the top bullets:

  ```markdown
  - Pat Smith
    - [Jane Doe](https://www.linkedin.com/in/janedoe) - Senior Frontend Engineer
  ```

  With 1st-degree people at the company, both lists go under *1st degree* / *2nd degree* bullets. Anyone you'd only
  reach through a 1st-degree connection at the company is left out, since you'd just ask them.
- **Already there:** if the Job already has any of these profiles, nothing is written; the dialog says how many are
  there and has an *Add anyway* button.
- **Which Job:** Jobs this extension saved for the company (it remembers them in `chrome.storage.local`), plus
  Capacities title search for the company name ("Grafana Labs", then "Grafana"). One match: written straight away.
  Several: the dialog asks which. None: the dialog offers your 5 most recently saved Jobs. There's always a
  *Copy markdown* button.
- Only needs the Capacities token; no AI.

## Setup

```bash
npm install
npm run build        # then chrome://extensions → Developer mode → Load unpacked → dist/
```

Open the extension's **Options** and paste:
- an Anthropic API key (console.anthropic.com)
- a Capacities API token (Capacities → Settings → Capacities API)

Keys are stored in `chrome.storage.local` on this device. This is a personal, unpacked extension; don't publish it.


## Development

```bash
npm test             # vitest + happy-dom, no network or keys needed
npm run typecheck
npm run dev          # CRXJS dev build with reload
```

Each menu item is a module with nothing imported from the other; what they share is in `src/shared/`.

```
src/
  extension/                    Chrome wiring: background router, popup menu, options page
  shared/                       Capacities API, settings, overlay dialog, tab helpers, saved-jobs registry
  job-listing-to-capacities/    meta.ts (menu entry), run.ts (the task), content/, lib/
  scroll-page-and-get-mutuals/  same shape
```

To add a menu item: make a folder with the same shape, then add its `meta.ts` to `src/extension/menu.ts` and its task
to `TASKS` in `src/extension/background.ts`.

Everything testable lives in each module's `lib/` (and `src/shared/`) and takes its dependencies (API clients, fetch,
storage) as arguments. `run.ts` is thin Chrome wiring on top.

**job-listing-to-capacities/lib**

| Module | Does |
|---|---|
| `pageCapture.ts` | Page → `{ url, title, text, descriptionMarkdown, applicationForm }` (runs inside the page) |
| `applyLink.ts` | Where the apply page or in-page Apply button is, when the form isn't on this page (runs inside the page) |
| `findApplicationForm.ts` | Gets the form from the Greenhouse API or a background tab |
| `greenhouse.ts` | Greenhouse job board API → the same form fields the page reader produces |
| `formFields.ts` | The application form's free-text fields and cover letter upload, choices and contact fields dropped |
| `pickBestCapture.ts` | Picks the frame with the most text |
| `sectionFilter.ts` | Drops benefits/EEO/etc. sections by heading |
| `extractFields.ts` | Claude Haiku structured output → title, full title, salary, cover letter, questions that take work |
| `jobMarkdown.ts` | Builds the frontmatter (incl. easy-apply tag), and the markdown for each body section |
| `saveJob.ts` | Orchestrates the above, returns `saved` / `error` |

**scroll-page-and-get-mutuals/lib**

| Module | Does |
|---|---|
| `linkedinUrl.ts` | Company page URL → its Engineering people URL (or "not a company page") |
| `peoplePage.ts` | Reads the people cards, clicks "Show more results" (runs inside the page) |
| `loadAllPeople.ts` | The click / retry / reload loop |
| `mutualsMarkdown.ts` | People → the contacts markdown |
| `findJobNotes.ts` | Which Job notes belong to the company |

**shared**

| Module | Does |
|---|---|
| `capacities.ts` | `POST /object/markdown`, `POST /blocks/append` (by section property id), `POST /objects/search` |
| `overlay.ts` | The in-page status dialog, with optional buttons (self-contained, injected with `executeScript`) |
| `savedJobs.ts` | Jobs this extension saved, so other tasks can find them by company |
| `settings.ts` | API keys from `chrome.storage.local` |
| `tabs.ts` | Wait for a tab to load; show the overlay and toolbar badge |

## Not in v1

- **Duplicate detection.** Capacities search only matches titles. The plan: search Jobs by company, fetch the hits, and
  compare Position URLs.
- **Link to the new object in the dialog.** The Capacities deep-link URL format isn't documented; the object id is
  already returned (`SaveResult.objectId`), so it's just a matter of building the URL.
