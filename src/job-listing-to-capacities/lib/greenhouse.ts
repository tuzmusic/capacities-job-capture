import { worthListing, type ApplicationForm, type FormField } from './formFields.ts';

/**
 * Greenhouse's public job board API lists every application question with its field types, so we don't need the
 * page at all. https://developers.greenhouse.io/job-board.html#retrieve-a-job
 */
export interface GreenhouseJobRef {
  board: string;
  id: string;
}

export function parseGreenhouseUrl(url: string): GreenhouseJobRef | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (!/(?:^|\.)greenhouse\.io$/.test(u.hostname)) return null;
  const path = u.pathname.match(/^\/([^/]+)\/jobs\/(\d+)/);
  if (path) return { board: path[1], id: path[2] };
  const board = u.searchParams.get('for');
  const id = u.searchParams.get('token');
  return board && id && /^\d+$/.test(id) ? { board, id } : null;
}

interface GreenhouseQuestion {
  label: string;
  required: boolean;
  fields: { name: string; type: string }[];
}

const stripHtml = (s: string) =>
  s
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();

function kindOf(q: GreenhouseQuestion): FormField['kind'] | null {
  const types = q.fields.map((f) => f.type);
  if (types.includes('input_file')) return 'file upload'; // resume and cover letter: an upload with a paste-in option
  if (types.includes('textarea')) return 'long text';
  if (types.includes('input_text')) return 'short text';
  return null; // multi_value_* (selects, checkboxes), hidden
}

export async function fetchGreenhouseForm(fetch: typeof globalThis.fetch, ref: GreenhouseJobRef): Promise<ApplicationForm> {
  const res = await fetch(
    `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(ref.board)}/jobs/${ref.id}?questions=true`,
  );
  if (!res.ok) throw new Error(`Greenhouse ${res.status}`);
  const { questions = [] } = (await res.json()) as { questions?: GreenhouseQuestion[] };

  const fields: FormField[] = [];
  for (const q of questions) {
    const kind = kindOf(q);
    const label = stripHtml(q.label);
    if (kind && label && worthListing(kind, label)) fields.push({ kind, label, required: q.required });
  }
  return { found: true, fields };
}
