// Injected into every frame of the tab on click (see background). Exposes the capture function on the
// extension's isolated-world global so a follow-up executeScript({ func }) can call it and collect results.
import { clickApplyButton } from '../lib/applyLink.ts';
import { capturePage } from '../lib/pageCapture.ts';

const g = globalThis as { __capacitiesJobCapture?: () => unknown; __capacitiesJobClickApply?: () => boolean };
g.__capacitiesJobCapture = () => capturePage(document, location.href);
g.__capacitiesJobClickApply = () => clickApplyButton(document, location.href);
