// Injected into every frame of the tab on click (see background). Exposes the capture function on the
// extension's isolated-world global so a follow-up executeScript({ func }) can call it and collect results.
import { capturePage } from '../lib/pageCapture.ts';

(globalThis as { __capacitiesJobCapture?: () => unknown }).__capacitiesJobCapture = () =>
  capturePage(document, location.href);
