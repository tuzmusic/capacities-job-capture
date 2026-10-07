/**
 * Drops whole sections of a job description that don't help pursue the job (benefits, "why join us", EEO
 * boilerplate, ...). Deterministic and free: works off headings, so unheaded text is always kept.
 *
 * Tune by editing DROP_HEADINGS.
 */
export const DROP_HEADINGS: RegExp[] = [
  /benefits/,
  /perks/,
  /what we(?:'ll| will)? offer/,
  /^why (?:join|work|you'?ll love|you will love)/,
  /our values/,
  /^life at\b/,
  /^working at\b/,
  /^come (?:work|join)\b/,
  /how we'?re different/,
  /equal (?:employment )?opportunit/,
  /\beeo\b/,
  /accommodation/,
  /privacy/,
];

/** Bold-only lines ("**Benefits**") are pseudo-headings, nested below every real markdown heading level. */
const PSEUDO_LEVEL = 7;

function parseHeading(line: string): { level: number; text: string } | null {
  const real = line.match(/^(#{1,6})\s+(.*)$/);
  if (real) return { level: real[1].length, text: real[2] };
  const bold = line.match(/^(?:\*\*|__)(.+?)(?:\*\*|__):?\s*$/);
  if (bold) return { level: PSEUDO_LEVEL, text: bold[1] };
  return null;
}

function normalize(text: string): string {
  return text
    .replace(/[*_]/g, '')
    .replace(/[’‘]/g, "'")
    .trim()
    .toLowerCase();
}

export function isDroppedHeading(text: string): boolean {
  const t = normalize(text);
  return DROP_HEADINGS.some((re) => re.test(t));
}

export function filterSections(markdown: string): string {
  const kept: string[] = [];
  let droppingBelow: number | null = null; // level of the heading whose section we're skipping

  for (const line of markdown.split('\n')) {
    const heading = parseHeading(line);
    if (heading && droppingBelow !== null && heading.level <= droppingBelow) droppingBelow = null;
    if (heading && droppingBelow === null && isDroppedHeading(heading.text)) droppingBelow = heading.level;
    if (droppingBelow === null) kept.push(line);
  }

  return kept.join('\n').replace(/\s+$/, '');
}
