import { beforeEach, describe, expect, it } from 'vitest';
import { readApplicationForm } from './formFields.ts';

function read(html: string) {
  document.body.innerHTML = html;
  return readApplicationForm(document);
}

const resume = '<label for="resume">Resume/CV*</label><input type="file" id="resume" required>';

describe('readApplicationForm', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('finds no form on a posting without one', () => {
    expect(read('<h1>Engineer</h1><p>Apply on the next page.</p>')).toEqual({ found: false, fields: [] });
  });

  it('counts a form with only basics as found, with no fields', () => {
    const form = read(`
      ${resume}
      <label for="fn">First Name*</label><input id="fn" type="text" required>
      <label for="em">Email</label><input id="em" type="email">
      <label for="li">LinkedIn Profile</label><input id="li" type="text">
      <label for="ph">Phone</label><input id="ph" type="tel">`);
    expect(form).toEqual({ found: true, fields: [] });
  });

  it('drops selects, comboboxes, checkboxes, and radios', () => {
    const { fields } = read(`
      ${resume}
      <label for="s">Are you authorized to work in the US?</label><select id="s"><option>Yes</option></select>
      <label for="c">Which office?</label><input id="c" type="text" role="combobox">
      <label><input type="checkbox"> I agree to the privacy policy</label>
      <fieldset><legend>Do you need sponsorship?</legend><label><input type="radio" name="r"> Yes</label></fieldset>`);
    expect(fields).toEqual([]);
  });

  it('keeps textareas and non-contact text inputs, with their required flag', () => {
    const { fields } = read(`
      ${resume}
      <label for="q1">Why do you want to work at Postscript?<span>*</span></label><textarea id="q1"></textarea>
      <label for="q2">How did you hear about us?</label><input id="q2" type="text">
      <label for="q3">What's the name of a project you're proud of?</label><input id="q3" required>`);
    expect(fields).toEqual([
      { kind: 'long text', label: 'Why do you want to work at Postscript?', required: true },
      { kind: 'short text', label: 'How did you hear about us?', required: false },
      { kind: 'short text', label: "What's the name of a project you're proud of?", required: true },
    ]);
  });

  it('keeps a cover letter upload but not the resume upload', () => {
    const { fields } = read(`${resume}<label for="cl">Cover Letter</label><input type="file" id="cl">`);
    expect(fields).toEqual([{ kind: 'file upload', label: 'Cover Letter', required: false }]);
  });

  it('reads Lever-style labels from a nearby element', () => {
    const { fields } = read(`
      ${resume}
      <li class="application-question">
        <div class="application-label">Tell us about a hard bug you fixed<span class="required">✱</span></div>
        <div class="application-field"><textarea name="cards[abc][field0]" required></textarea></div>
      </li>`);
    expect(fields).toEqual([{ kind: 'long text', label: 'Tell us about a hard bug you fixed', required: true }]);
  });

  it('treats a trailing asterisk in the label as required', () => {
    const { fields } = read(`${resume}<label>Why us? *<textarea></textarea></label>`);
    expect(fields).toEqual([{ kind: 'long text', label: 'Why us?', required: true }]);
  });

  it('reads aria-label and aria-labelledby', () => {
    const { fields } = read(`
      ${resume}
      <textarea aria-label="Describe your design process"></textarea>
      <span id="lbl">What are you looking for next?</span><textarea aria-labelledby="lbl"></textarea>`);
    expect(fields.map((f) => f.label)).toEqual(['Describe your design process', 'What are you looking for next?']);
  });

  it("takes only the text before the field in Lever's wrapping labels, not the widget chrome after it", () => {
    const { fields } = read(`
      ${resume}
      <label><div class="application-label">Where are you based? <span>✱</span></div>
        <div class="application-field"><input type="text" required>
          <div class="dropdown-no-results">No location found. Try entering a different location</div></div></label>`);
    expect(fields).toEqual([{ kind: 'short text', label: 'Where are you based?', required: true }]);
  });

  it("finds Greenhouse's cover letter upload behind its generic \"Attach\" label", () => {
    const { fields } = read(`
      <div role="group" aria-labelledby="upload-label-cover_letter">
        <div id="upload-label-cover_letter">Cover Letter</div>
        <button type="button">Attach</button><label class="visually-hidden" for="cover_letter">Attach</label>
        <input id="cover_letter" type="file">
      </div>`);
    expect(fields).toEqual([{ kind: 'file upload', label: 'Cover Letter', required: false }]);
  });

  it('skips hidden validation inputs behind custom dropdowns', () => {
    const { fields } = read(`${resume}<div><div>Select...</div><input required tabindex="-1" aria-hidden="true"></div>`);
    expect(fields).toEqual([]);
  });

  it('lists a repeated field once', () => {
    const { fields } = read(`${resume}<textarea aria-label="Why us?"></textarea><textarea aria-label="Why us?"></textarea>`);
    expect(fields).toHaveLength(1);
  });
});
