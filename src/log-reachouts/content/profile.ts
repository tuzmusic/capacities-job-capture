// Injected into each LinkedIn profile tab (see ../run.ts). Exposes the page reader on the extension's isolated-world
// global so a follow-up executeScript({ func }) call can use it.
import { readProfile } from '../lib/profilePage.ts';

const g = globalThis as { __capacitiesReachouts?: unknown };
g.__capacitiesReachouts = { read: () => readProfile(document) };
