/**
 * Appends rows through the Apps Script web app in ../apps-script/Code.gs, deployed from the sheet. Plain-text body:
 * Apps Script reads it as is, and it needs no CORS preflight.
 */
export async function appendToSheet({
  fetch,
  url,
  rows,
}: {
  fetch: typeof globalThis.fetch;
  url: string;
  rows: string[][];
}): Promise<{ added: number; firstRow: number }> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ rows }),
  });
  if (!res.ok) throw new Error(`The sheet's web app answered ${res.status}.`);

  const text = await res.text();
  let body: { ok?: unknown; added?: unknown; firstRow?: unknown; error?: unknown };
  try {
    body = JSON.parse(text);
  } catch {
    // A Google sign-in or "no access" page: the web app isn't deployed for "Anyone".
    throw new Error("The sheet's web app didn't answer with JSON. Check it's deployed with access: Anyone.");
  }
  if (body.ok !== true) throw new Error(typeof body.error === 'string' ? body.error : "The sheet's web app failed.");
  return { added: Number(body.added) || 0, firstRow: Number(body.firstRow) || 0 };
}
