import type Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import type { FormLookup } from './findApplicationForm.ts';

/** Small, fast, cheap: this is reading one page and filling a handful of fields. */
export const EXTRACTION_MODEL = 'claude-haiku-4-5';

export const JobFieldsSchema = z.object({
  company: z.string().describe('Hiring company name, as the company writes it.'),
  title: z.string().describe('Object title: "Company - Short Role".'),
  fullTitle: z.string().describe('Exact job title as posted.'),
  salaryRange: z.string().nullable().describe('Compact pay range as posted, or null if none is listed.'),
  coverLetter: z
    .enum(['required', 'optional', 'none'])
    .describe('Whether the application asks for a cover letter.'),
  applicationQuestions: z
    .array(
      z.object({
        question: z.string().describe('The question as asked, verbatim or lightly trimmed.'),
        required: z.boolean(),
      }),
    )
    .describe('Only questions that take real work to answer. Empty if there are none.'),
  formNote: z
    .string()
    .nullable()
    .describe('Only when no application form was found: 1-3 words on why, e.g. "Workday" or "needs login". Else null.'),
});

export type JobFields = z.infer<typeof JobFieldsSchema>;

/** The slice of the SDK client we use, so tests can pass a fake. */
export type ParseClient = Pick<Anthropic, 'messages'>;

export interface PageForExtraction {
  url: string;
  title: string;
  text: string;
  formLookup: FormLookup;
}

function describeForm({ form, missedApplyPage: missed }: FormLookup): string {
  if (!form.found) {
    if (!missed) return 'No application form on this page, and no link to one.';
    const seen = missed.text ? `It showed:\n${missed.text}` : 'It was not opened.';
    return `No application form on this page. The apply link (${missed.url}) had no form either. ${seen}`;
  }
  if (form.fields.length === 0) return 'The application form has no free-text fields.';
  return form.fields
    .map((f) => `- [${f.kind}, ${f.required ? 'required' : 'optional'}] ${f.label}`)
    .join('\n');
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
- coverLetter: "required", "optional", or "none" (not asked for, or not mentioned). A cover letter upload or text box
  counts. Use the form field's required flag when there is one.
- applicationQuestions: the application questions that will take real work to answer, and nothing else. When in doubt
  about a question that needs a thoughtful written answer, include it: missing one is worse than listing an extra.
  - The <application_form> list has already had choices (dropdowns, checkboxes, yes/no, radio buttons) and contact
    fields removed. Judge what is left:
    - long text: include (even "anything else you'd like to share"), unless it is a cover letter (that goes in
      coverLetter) or a place to paste a resume.
    - short text: include only if it asks for something you'd need to think about or write (e.g. "Link to a project
      you're proud of and why", "Describe your experience with X"). Leave out quick facts: how did you hear about us,
      referrer name, salary expectations, start date, notice period, years of experience, visa status, and the like.
  - If there is no application form on the page, use questions the page text says the application will ask, if any.
    Never list questions from job requirements ("5+ years of React") or from other postings.
- formNote: only when no application form was found. If the URLs or the apply page make the reason obvious, say it in
  1-3 words: "Workday", "needs login", "multi-step", "external site", "email to apply". null if it isn't obvious, and
  null whenever a form was found.

The page text may include navigation, other job listings, or cookie banners. Ignore them. Never invent values.`;

export async function extractFields(client: ParseClient, page: PageForExtraction): Promise<JobFields> {
  const response = await client.messages.parse({
    model: EXTRACTION_MODEL,
    max_tokens: 2048,
    system: SYSTEM,
    messages: [
      {
        role: 'user',
        content:
          `URL: ${page.url}\nDocument title: ${page.title}\n\n` +
          `<page_text>\n${page.text}\n</page_text>\n\n` +
          `<application_form>\n${describeForm(page.formLookup)}\n</application_form>`,
      },
    ],
    output_config: { format: zodOutputFormat(JobFieldsSchema) },
  });

  if (response.stop_reason === 'refusal') throw new Error('Claude declined to read this page.');
  if (!response.parsed_output) throw new Error('Could not read job details from this page.');
  return response.parsed_output;
}
