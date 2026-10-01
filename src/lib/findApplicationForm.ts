import type { ApplicationForm } from './formFields.ts';
import { fetchGreenhouseForm, parseGreenhouseUrl } from './greenhouse.ts';
import type { PageCapture } from './pageCapture.ts';

/** Where the form came from, and if we went looking and still came up empty, what the apply page looked like. */
export interface FormLookup {
  form: ApplicationForm;
  /** Set when we looked for a separate apply page and found no form there: input for the AI's one-word "why". */
  missedApplyPage: { url: string; text: string } | null;
}

export interface FormLookupDeps {
  fetch: typeof globalThis.fetch;
  /** Loads a URL out of sight and captures it like the current tab, first clicking its "Apply" button if asked. */
  capturePage: (url: string, opts?: { clickApply?: boolean }) => Promise<PageCapture | null>;
}

/** Login walls and multi-step wizards: opening them only costs time. The URL alone tells the AI what they are. */
const NOT_WORTH_OPENING = /myworkdayjobs\.com|workday\.com|icims\.com|taleo\.net|successfactors\.|oraclecloud\.com/i;

/** Enough of a failed apply page for the AI to recognize a login wall or a wizard. */
const SNIPPET_CHARS = 600;

export async function findApplicationForm(capture: PageCapture, deps: FormLookupDeps): Promise<FormLookup> {
  const { applicationForm, applyUrl } = capture;
  if (applicationForm.found) return { form: applicationForm, missedApplyPage: null };
  if (!applyUrl) {
    return capture.applyButton ? openAndLook(capture, capture.url, deps, { clickApply: true }) : { form: applicationForm, missedApplyPage: null };
  }

  const greenhouse = parseGreenhouseUrl(applyUrl);
  if (greenhouse) {
    const form = await fetchGreenhouseForm(deps.fetch, greenhouse).catch(() => null);
    if (form) return { form, missedApplyPage: null };
  }

  if (NOT_WORTH_OPENING.test(applyUrl)) return { form: applicationForm, missedApplyPage: { url: applyUrl, text: '' } };

  return openAndLook(capture, applyUrl, deps);
}

async function openAndLook(
  capture: PageCapture,
  url: string,
  deps: FormLookupDeps,
  opts?: { clickApply: boolean },
): Promise<FormLookup> {
  const page = await deps.capturePage(url, opts).catch(() => null);
  if (page?.applicationForm.found) return { form: page.applicationForm, missedApplyPage: null };
  return {
    form: capture.applicationForm,
    missedApplyPage: { url, text: (page?.text ?? '').slice(0, SNIPPET_CHARS) },
  };
}
