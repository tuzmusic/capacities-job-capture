import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';
import { findApplyUrl } from './applyLink.ts';
import { readApplicationForm, type ApplicationForm } from './formFields.ts';
import { filterSections } from './sectionFilter.ts';

/** What one frame of the tab yields. Runs inside the page (injected), so it must only use DOM APIs. */
export interface PageCapture {
  url: string;
  title: string;
  /** Visible text of the whole frame, unfiltered: input for the AI field extraction. */
  text: string;
  /** Main posting content as markdown, with unwanted sections dropped: goes into the object verbatim. */
  descriptionMarkdown: string;
  /** The application form's free-text fields, if the form is on this page. */
  applicationForm: ApplicationForm;
  /** Where to look for the form when it isn't here (resolved from this frame's own URL). Null when it's here. */
  applyUrl: string | null;
}

/** Below this, Readability probably grabbed a fragment rather than the posting. */
const MIN_ARTICLE_CHARS = 200;

const turndown = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-', codeBlockStyle: 'fenced' });
turndown.remove(['script', 'style', 'noscript', 'button', 'form', 'iframe']);

function mainContentHtml(doc: Document): string {
  // Readability mutates the document it parses, so hand it a copy.
  const article = new Readability(doc.cloneNode(true) as Document).parse();
  if (article?.content && (article.textContent ?? '').trim().length >= MIN_ARTICLE_CHARS) return article.content;
  return doc.body?.innerHTML ?? '';
}

const tidy = (s: string) => s.replace(/\n{3,}/g, '\n\n').trim();

export function capturePage(doc: Document, url: string): PageCapture {
  const body = doc.body;
  const applicationForm = readApplicationForm(doc);
  return {
    url,
    title: doc.title,
    text: tidy(body?.innerText || body?.textContent || ''),
    descriptionMarkdown: filterSections(tidy(turndown.turndown(mainContentHtml(doc)))),
    applicationForm,
    applyUrl: applicationForm.found ? null : findApplyUrl(doc, url),
  };
}
