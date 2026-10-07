import { describe, expect, it, vi } from 'vitest';
import { fetchGreenhouseForm, parseGreenhouseUrl } from './greenhouse.ts';

describe('parseGreenhouseUrl', () => {
  it('reads board and job id from board, job-board, and embed URLs', () => {
    expect(parseGreenhouseUrl('https://job-boards.greenhouse.io/gitlab/jobs/8556658002')).toEqual({ board: 'gitlab', id: '8556658002' });
    expect(parseGreenhouseUrl('https://boards.greenhouse.io/acme/jobs/123?gh_src=x')).toEqual({ board: 'acme', id: '123' });
    expect(parseGreenhouseUrl('https://boards.greenhouse.io/embed/job_app?for=acme&token=123')).toEqual({ board: 'acme', id: '123' });
  });

  it('ignores everything else', () => {
    expect(parseGreenhouseUrl('https://acme.com/careers?gh_jid=123')).toBeNull();
    expect(parseGreenhouseUrl('https://notgreenhouse.io/acme/jobs/123')).toBeNull();
    expect(parseGreenhouseUrl('not a url')).toBeNull();
  });
});

/** Trimmed from a real response (gitlab, ?questions=true). */
const questions = [
  { required: true, label: 'First Name', fields: [{ name: 'first_name', type: 'input_text' }] },
  { required: true, label: 'Email', fields: [{ name: 'email', type: 'input_text' }] },
  { required: true, label: 'Resume/CV', fields: [{ name: 'resume', type: 'input_file' }, { name: 'resume_text', type: 'textarea' }] },
  { required: false, label: 'Cover Letter', fields: [{ name: 'cover_letter', type: 'input_file' }, { name: 'cover_letter_text', type: 'textarea' }] },
  { required: false, label: 'LinkedIn Profile', fields: [{ name: 'question_1', type: 'input_text' }] },
  { required: true, label: 'Will you require sponsorship?', fields: [{ name: 'question_2', type: 'multi_value_single_select' }] },
  { required: true, label: '<p>Why do you want to work at GitLab?</p>', fields: [{ name: 'question_3', type: 'textarea' }] },
  { required: false, label: 'How did you hear about us?', fields: [{ name: 'question_4', type: 'input_text' }] },
];

describe('fetchGreenhouseForm', () => {
  it('maps questions to the same fields the page reader produces', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ questions })));
    await expect(fetchGreenhouseForm(fetch, { board: 'gitlab', id: '1' })).resolves.toEqual({
      found: true,
      fields: [
        { kind: 'file upload', label: 'Cover Letter', required: false },
        { kind: 'long text', label: 'Why do you want to work at GitLab?', required: true },
        { kind: 'short text', label: 'How did you hear about us?', required: false },
      ],
    });
    expect(fetch).toHaveBeenCalledWith('https://boards-api.greenhouse.io/v1/boards/gitlab/jobs/1?questions=true');
  });

  it('throws on an error response', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('', { status: 404 }));
    await expect(fetchGreenhouseForm(fetch, { board: 'x', id: '1' })).rejects.toThrow(/404/);
  });
});
