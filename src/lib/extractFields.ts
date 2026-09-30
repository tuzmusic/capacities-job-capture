import type Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';

/** Small, fast, cheap: this is reading one page and filling five fields. */
export const EXTRACTION_MODEL = 'claude-haiku-4-5';

export const JobFieldsSchema = z.object({
  company: z.string().describe('Hiring company name, as the company writes it.'),
  title: z.string().describe('Object title: "Company - Short Role".'),
  fullTitle: z.string().describe('Exact job title as posted.'),
  salaryRange: z.string().nullable().describe('Compact pay range as posted, or null if none is listed.'),
  applicationReqs: z
    .string()
    .nullable()
    .describe('Markdown: cover letter requirement and any custom application questions, or null if none shown.'),
});

export type JobFields = z.infer<typeof JobFieldsSchema>;

/** The slice of the SDK client we use, so tests can pass a fake. */
export type ParseClient = Pick<Anthropic, 'messages'>;

export interface PageForExtraction {
  url: string;
  title: string;
  text: string;
}

const SYSTEM = `You extract structured data from a job posting page for a personal job-search tracker.

Fields:
- company: the hiring company (not the job board or recruiter platform).
- title: "Company - Short Role". Abbreviate the role the way an engineer would in their own notes. Examples:
  "Postscript - Sr FE" (Senior Frontend Engineer), "RevenueCat - FS/Product" (Senior Software Engineer, Product; full-stack),
  "Doordash - Front-End Web Developer, B2B, Marketing Technology" (keep it long when there is no natural short form).
- fullTitle: the job title exactly as posted.
- salaryRange: the pay range, compact, e.g. "$172K–$203K" or "$227K + equity". Include "+ equity" only if equity is
  mentioned. If several location-based ranges are listed, prefer the US remote or NYC range and keep it short.
  null if no pay is listed.
- applicationReqs: markdown. Whether a cover letter is required/optional/not mentioned, plus any custom application
  questions visible on the page as a bullet list. null if the page shows nothing about the application itself.

The page text may include navigation, other job listings, or cookie banners. Ignore them. Never invent values.`;

export async function extractFields(client: ParseClient, page: PageForExtraction): Promise<JobFields> {
  const response = await client.messages.parse({
    model: EXTRACTION_MODEL,
    max_tokens: 2048,
    system: SYSTEM,
    messages: [
      {
        role: 'user',
        content: `URL: ${page.url}\nDocument title: ${page.title}\n\n<page_text>\n${page.text}\n</page_text>`,
      },
    ],
    output_config: { format: zodOutputFormat(JobFieldsSchema) },
  });

  if (response.stop_reason === 'refusal') throw new Error('Claude declined to read this page.');
  if (!response.parsed_output) throw new Error('Could not read job details from this page.');
  return response.parsed_output;
}
