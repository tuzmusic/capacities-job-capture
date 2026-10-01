import type { JobFields, PageForExtraction } from './extractFields.ts';
import type { JobSection } from './capacities.ts';
import type { FormLookup } from './findApplicationForm.ts';
import { buildJobMarkdown, buildJobSections } from './jobMarkdown.ts';
import type { PageCapture } from './pageCapture.ts';

export type SaveResult = { status: 'saved'; title: string; objectId: string } | { status: 'error'; message: string };

export interface SaveDeps {
  /** Only called when the form isn't on the captured page. */
  findForm: (capture: PageCapture) => Promise<FormLookup>;
  extract: (page: PageForExtraction) => Promise<JobFields>;
  create: (markdown: string) => Promise<{ id: string }>;
  appendSection: (objectId: string, section: JobSection, markdown: string) => Promise<void>;
}

/** Less than this and the tab is probably still loading, a login wall, or not a posting. */
const MIN_PAGE_CHARS = 100;

const SECTION_LABELS: Record<JobSection, string> = {
  applicationReqs: 'Application Reqs',
  jobDescription: 'Job Description',
};

const UNREADABLE = "Couldn't read this page. Wait for it to finish loading and try again.";

export async function saveJob(capture: PageCapture | null, deps: SaveDeps): Promise<SaveResult> {
  if (!capture || capture.text.trim().length < MIN_PAGE_CHARS) return { status: 'error', message: UNREADABLE };

  try {
    const { url, title, text, applicationForm } = capture;
    const formLookup: FormLookup = applicationForm.found
      ? { form: applicationForm, missedApplyPage: null }
      : await deps.findForm(capture).catch(() => ({ form: applicationForm, missedApplyPage: null }));
    const fields = await deps.extract({ url, title, text, formLookup });
    const doc = {
      title: fields.title,
      fullTitle: fields.fullTitle,
      url: capture.url,
      salaryRange: fields.salaryRange,
      application: {
        coverLetter: fields.coverLetter,
        questions: fields.applicationQuestions,
        formFound: formLookup.form.found,
        formNote: fields.formNote,
      },
      description: capture.descriptionMarkdown,
    };
    const { id } = await deps.create(buildJobMarkdown(doc));

    for (const [section, markdown] of Object.entries(buildJobSections(doc)) as [JobSection, string][]) {
      try {
        await deps.appendSection(id, section, markdown);
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        return { status: 'error', message: `Job created, but its ${SECTION_LABELS[section]} couldn't be saved: ${reason}` };
      }
    }
    return { status: 'saved', title: fields.title, objectId: id };
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}
