import type { JobSection } from '../../shared/capacities.ts';
import type { JobFields } from './extractFields.ts';

/**
 * Builds what we send to Capacities: YAML frontmatter for the Job type's properties (`POST /object/markdown`), and the
 * markdown for each body section (`POST /blocks/append`).
 */
export interface JobDocInput {
  /** Object title, e.g. "Postscript - Sr FE". */
  title: string;
  /** Full posting title, used as the Position link text. */
  fullTitle: string;
  url: string;
  salaryRange: string | null;
  application: ApplicationReqs;
  description: string;
}

export interface ApplicationReqs {
  coverLetter: JobFields['coverLetter'];
  questions: JobFields['applicationQuestions'];
  /** Whether we found the application form (on the page or its apply page). If not, we can't vouch for easy-apply. */
  formFound: boolean;
  /** Why the form couldn't be read, in a word or three ("Workday", "needs login"), if evident. */
  formNote?: string | null;
}

export const DEFAULT_STATUS = 'Info Gathering';

/** An existing tag in Jonathan's space. */
export const EASY_APPLY_TAG = 'easy-apply';

const COVER_LETTER_LINE: Record<ApplicationReqs['coverLetter'], string> = {
  required: 'Cover letter (required)',
  optional: 'Optional cover letter',
  none: 'No cover letter!',
};

const formNotFoundNote = (why?: string | null) =>
  `_Couldn't read the application form${why?.trim() ? ` (${why.trim()})` : ''}, so there may be more. Check before applying._`;

/** Nothing beyond the basics: no required cover letter, and no questions at all (optional ones count too). */
export function isEasyApply(app: ApplicationReqs): boolean {
  return app.formFound && app.coverLetter !== 'required' && app.questions.length === 0;
}

/** The Application Reqs section: always the cover letter line, then the questions that take work. */
export function formatApplicationReqs(app: ApplicationReqs): string {
  const lines = [COVER_LETTER_LINE[app.coverLetter]];
  if (app.questions.length) {
    lines.push('', ...app.questions.map((q) => `- ${q.question.trim()}${q.required ? '' : ' _(optional)_'}`));
  }
  if (!app.formFound) lines.push('', formNotFoundNote(app.formNote));
  return lines.join('\n');
}

/** JSON strings are valid YAML double-quoted scalars. */
const yamlString = (s: string) => JSON.stringify(s);

const escapeLinkText = (s: string) => s.replace(/[[\]\\]/g, (c) => `\\${c}`);

const demoteH1s = (md: string) => md.replace(/^# /gm, '## ');

/** Frontmatter only. The body sections are filled separately (see `buildJobSections`), each into its own property. */
export function buildJobMarkdown(input: JobDocInput): string {
  const fm: [string, string][] = [
    ['title', input.title],
    ['status', DEFAULT_STATUS],
    ['position', `[${escapeLinkText(input.fullTitle)}](${input.url})`],
  ];
  if (input.salaryRange) fm.push(['salaryRange', input.salaryRange]);

  const lines = fm.map(([k, v]) => `${k}: ${yamlString(v)}`);
  // Capacities wants plain, unquoted tag names here.
  if (isEasyApply(input.application)) lines.push(`tags: ${EASY_APPLY_TAG}`);
  return `---\n${lines.join('\n')}\n---\n`;
}

/** Markdown for each body section we fill. Application Reqs is always filled; an empty description is omitted. */
export function buildJobSections(input: Pick<JobDocInput, 'application' | 'description'>): Partial<Record<JobSection, string>> {
  const sections: Partial<Record<JobSection, string>> = { applicationReqs: formatApplicationReqs(input.application) };
  const description = demoteH1s(input.description.trim());
  if (description) sections.jobDescription = description;
  return sections;
}
