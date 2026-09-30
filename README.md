# Capacities Job Capture

Chrome extension (MV3): one click saves the job posting in the current tab as a **Job** object in Capacities.

- **Title, Position, Salary range, Application Reqs** are filled by Claude Haiku from the page text (one call, well
  under a cent).
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
| `pageCapture.ts` | Page → `{ url, title, text, descriptionMarkdown }` (runs inside the page) |
| `pickBestCapture.ts` | Picks the frame with the most text |
| `sectionFilter.ts` | Drops benefits/EEO/etc. sections by heading |
| `extractFields.ts` | Claude Haiku structured output → title, full title, salary, application reqs |
| `jobMarkdown.ts` | Builds the frontmatter, and the markdown for each body section (Application Reqs, Job Description) |
| `capacities.ts` | `POST /object/markdown` (properties), `POST /blocks/append` (body sections, by property id) |
| `saveJob.ts` | Orchestrates the above, returns `saved` / `error` |
| `overlay.ts` | The in-page status dialog (self-contained, injected with `executeScript`) |

## Not in v1

- **Duplicate detection.** Capacities search only matches titles. The plan: search Jobs by company, fetch the hits, and
  compare Position URLs.
- **Link to the new object in the dialog.** The Capacities deep-link URL format isn't documented; the object id is
  already returned (`SaveResult.objectId`), so it's just a matter of building the URL.
