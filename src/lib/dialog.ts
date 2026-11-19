// OM58 review — the dialog close policy, as plain functions so it is testable
// without a browser.
//
// Backdrop click is not a close at all (Modal.tsx): losing a half-filled form
// to a stray tap is worse than pressing Close. Escape is the same risk on a
// keyboard, so it gets the same answer, softened to a confirm: an untouched
// form closes at once, a touched one asks first. The explicit Close button
// still closes without asking; pressing it is not an accident.

export const DISCARD_MESSAGE = "Discard what you've entered? It hasn't been saved.";

/** Escape closes a clean dialog; a dirty one only when the user confirms. */
export function shouldCloseOnEscape(dirty: boolean, confirm: (message: string) => boolean): boolean {
    return !dirty || confirm(DISCARD_MESSAGE);
}

const blank = (v: unknown) => v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);

/**
 * Has the form moved away from where it started? Empty-ish values (undefined,
 * null, "", []) count as equal so a field that was focused and left blank is
 * not "dirty". An unpopulated form ({}) is never dirty.
 */
export function formIsDirty(current: object, initial: object): boolean {
    const a = current as Record<string, unknown>;
    const b = initial as Record<string, unknown>;
    if (Object.keys(a).length === 0) return false;
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
        if (blank(a[k]) && blank(b[k])) continue;
        if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) return true;
    }
    return false;
}
