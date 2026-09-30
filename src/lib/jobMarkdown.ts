import type { JobSection } from './capacities.ts';

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
  applicationReqs: string | null;
  description: string;
}

export const DEFAULT_STATUS = 'Info Gathering';

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

  return `---\n${fm.map(([k, v]) => `${k}: ${yamlString(v)}`).join('\n')}\n---\n`;
}

/** Markdown for each body section we fill; empty ones are omitted. */
export function buildJobSections(input: Pick<JobDocInput, 'applicationReqs' | 'description'>): Partial<Record<JobSection, string>> {
  const sections: Partial<Record<JobSection, string>> = {};
  const reqs = input.applicationReqs?.trim();
  if (reqs) sections.applicationReqs = reqs;
  const description = demoteH1s(input.description.trim());
  if (description) sections.jobDescription = description;
  return sections;
}
