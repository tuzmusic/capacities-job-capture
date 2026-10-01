# Capacities Job Capture

Chrome extension (MV3): one click saves the job posting in the current tab as a **Job** object in Capacities.

- **Title, Position, Salary range, Application Reqs** are filled by Claude Haiku from the page text (one call, well
  under a cent).
- **Application Reqs** always starts with *Cover letter (required)*, *Optional cover letter*, or *No cover letter!*,
  then lists only the questions that take work. Choice fields (selects, comboboxes, checkboxes, radios) and contact
  fields are dropped in code (`src/lib/formFields.ts`); Haiku judges the free-text fields that remain.
- **Separate apply pages:** if the form isn't on the page you captured, it looks for it. Greenhouse jobs go through
  Greenhouse's public job board API. Lever (`/apply`), Ashby (`/application`), and any page's own "Apply" link are
  opened in a background tab, captured, and closed. With no link, an in-page "Apply" button (modal, tab, client-side
  route) is clicked in a background copy of the posting instead, so your tab is left alone. Workday, iCIMS, Taleo and the like aren't opened (login walls,
  multi-step forms). When the form still can't be read, Haiku adds a short reason, like "(Workday)" or "(needs login)".
- **easy-apply** tag is added when there's no required cover letter and no questions at all (an optional cover letter
  doesn't count, optional questions do). Only when the application form was found; otherwise Application Reqs says to check.
- **Job Description** is copied verbatim (Readability → markdown). Sections like Benefits, Perks, "Why join us", and EEO
  are dropped by heading, with no AI involved. The patterns are in `src/lib/sectionFilter.ts` (`DROP_HEADINGS`).
- **Status** defaults to *Info Gathering*. Everything else is left for you.
- Reads the tab you're already looking at, including embedded ATS iframes (`company.com/careers?gh_jid=...`), so
  JS-rendered and logged-in pages work.
- The result shows as a dialog in the page's top-right corner. It doesn't take focus and stays until you dismiss it.
  The toolbar icon badge also shows … / ✓ / ✗.

## Setup

```bash
npm install
npm run build        # then chrome://extensions → Developer mode → Load unpacked → dist/
```

Open the extension's **Options** and paste:
- an Anthropic API key (console.anthropic.com)
- a Capacities API token (Capacities → Settings → Capacities API)

Keys are stored in `chrome.storage.local` on this device. This is a personal, unpacked extension; don't publish it.

Click the toolbar icon, or press **Alt+Shift+J**.

## Development

```bash
npm test             # vitest + happy-dom, no network or keys needed
npm run typecheck
npm run dev          # CRXJS dev build with reload
```

Everything testable lives in `src/lib/` and takes its dependencies (API clients, fetch, storage) as arguments.
`src/background/index.ts` is thin Chrome wiring on top.

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
| `capacities.ts` | `POST /object/markdown` (properties), `POST /blocks/append` (body sections, by property id) |
| `saveJob.ts` | Orchestrates the above, returns `saved` / `error` |
| `overlay.ts` | The in-page status dialog (self-contained, injected with `executeScript`) |

## Not in v1

- **Duplicate detection.** Capacities search only matches titles. The plan: search Jobs by company, fetch the hits, and
  compare Position URLs.
- **Link to the new object in the dialog.** The Capacities deep-link URL format isn't documented; the object id is
  already returned (`SaveResult.objectId`), so it's just a matter of building the URL.
