/**
 * Web app for "Add Reachouts to Sheet". Not part of the extension build: paste it into the sheet's own
 * Apps Script project (Extensions → Apps Script), then Deploy → New deployment → Web app, execute as Me, access
 * Anyone. Put the /exec URL in the extension's Options.
 *
 * POST body: {"rows": [["Company", "=HYPERLINK(...)", "Role", "10/9/2026", "Notes", "Type"], ...]}
 * Answer:    {"ok": true, "added": 3, "firstRow": 3990} or {"ok": false, "error": "..."}
 */

const SHEET_NAME = 'Sheet1';
const WIDTH = 6; // Company | Name | Role | Date | Notes | Type. Incoming, Pushed and Tags are left alone.

function doPost(e) {
  try {
    const rows = JSON.parse(e.postData.contents).rows;
    if (!Array.isArray(rows)) throw new Error('Expected {"rows": [...]}');
    if (!rows.length) return json({ ok: true, added: 0, firstRow: 0 });

    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
    if (!sheet) throw new Error('No sheet named ' + SHEET_NAME);

    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      // After the last row with a Company or Name. getLastRow() would count the Incoming/Pushed checkboxes, which
      // run further down than the data.
      const filled = sheet.getRange(1, 1, sheet.getMaxRows(), 2).getValues();
      let last = filled.length;
      while (last > 0 && filled[last - 1][0] === '' && filled[last - 1][1] === '') last--;
      const firstRow = last + 1;

      const values = rows.map(function (row) {
        const cells = [];
        for (let i = 0; i < WIDTH; i++) cells.push(toCell(row[i]));
        return cells;
      });
      const needed = firstRow + values.length - 1 - sheet.getMaxRows();
      if (needed > 0) sheet.insertRowsAfter(sheet.getMaxRows(), needed);

      // Strings starting with "=" go in as formulas, so HYPERLINK works.
      sheet.getRange(firstRow, 1, values.length, WIDTH).setValues(values);
      return json({ ok: true, added: values.length, firstRow: firstRow });
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return json({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

/** "10/9/2026" → a real date, so the sheet's date formulas count it. */
function toCell(value) {
  if (value === undefined || value === null) return '';
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(value));
  return m ? new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2])) : String(value);
}

function json(body) {
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
}
