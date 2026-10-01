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
  /** Gives a section an empty line, so it can be typed in. */
  appendEmptyLine: (objectId: string, section: JobSection) => Promise<void>;
}

/** Less than this and the tab is probably still loading, a login wall, or not a posting. */
const MIN_PAGE_CHARS = 100;

const SECTION_LABELS: Record<JobSection, string> = {
  contacts: '1st & 2nd Degree Contacts',
  applicationReqs: 'Application Reqs',
  jobDescription: 'Job Description',
};

/** A title with no letters ("-" from an empty company and role) isn't one. */
const usableTitle = (t: string) => (/\p{L}/u.test(t) ? t.trim() : null);

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
      title: usableTitle(fields.title) ?? usableTitle(title) ?? fields.title,
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

    // Our body is empty, so the first section (which gets the body) is created with no blocks, and can't be edited.
    const writes: [JobSection, () => Promise<void>][] = [
      ['contacts', () => deps.appendEmptyLine(id, 'contacts')],
      ...(Object.entries(buildJobSections(doc)) as [JobSection, string][]).map(
        ([section, markdown]): [JobSection, () => Promise<void>] => [section, () => deps.appendSection(id, section, markdown)],
      ),
    ];
    for (const [section, write] of writes) {
      try {
        await write();
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        return { status: 'error', message: `Job created, but its ${SECTION_LABELS[section]} couldn't be saved: ${reason}` };
      }
    }
    return { status: 'saved', title: doc.title, objectId: id };
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}
