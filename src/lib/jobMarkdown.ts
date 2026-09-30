/**
 * Builds the markdown document sent to Capacities' `POST /object/markdown`: YAML frontmatter for the Job type's
 * properties, then the body in the same section layout used for hand-made Jobs.
 */
export interface JobDocInput {
  /** Object title, e.g. "Postscript - Sr FE". */
  title: string;
  /** Full posting title, used as the Position link text. */
  fullTitle: string;
  url: string;
  salaryRange: string | null;
  applicationReqs: string | null;
  description: string;
}

export const DEFAULT_STATUS = 'Info Gathering';

const BODY_SECTIONS = [
  '1st & 2nd Degree Contacts',
  'Application Reqs',
  'Interactions',
  'Next Steps',
  'Notes',
  'Job Description',
] as const;

/** JSON strings are valid YAML double-quoted scalars. */
const yamlString = (s: string) => JSON.stringify(s);

const escapeLinkText = (s: string) => s.replace(/[[\]\\]/g, (c) => `\\${c}`);

const demoteH1s = (md: string) => md.replace(/^# /gm, '## ');

export function buildJobMarkdown(input: JobDocInput): string {
  const fm: [string, string][] = [
    ['title', input.title],
    ['status', DEFAULT_STATUS],
    ['position', `[${escapeLinkText(input.fullTitle)}](${input.url})`],
  ];
  if (input.salaryRange) fm.push(['salaryRange', input.salaryRange]);

  const content: Partial<Record<(typeof BODY_SECTIONS)[number], string | null>> = {
    'Application Reqs': input.applicationReqs,
    'Job Description': demoteH1s(input.description.trim()),
  };

  const body = BODY_SECTIONS.map((heading) => {
    const text = content[heading]?.trim();
    return text ? `### ${heading}\n\n${text}\n` : `### ${heading}\n`;
  }).join('\n');

  return `---\n${fm.map(([k, v]) => `${k}: ${yamlString(v)}`).join('\n')}\n---\n\n${body}`;
}
