// OM54 — positive controls (BB18 / F-GREENBLIND).
//
// A green suite that has never been seen to fail proves nothing. Each suite has
// a `control(...)` case: a known-WRONG answer pushed through the same code path,
// asserted to be rejected. Run `npm run test:controls` and every control must
// go RED — that is the proof the assertions in that file can fail at all.
import { expect } from 'vitest';

export const CONTROLS_INVERTED = process.env.OM54_INVERT_CONTROLS === '1';

/** Assert `actual` is NOT the known-wrong value (or, inverted, that it is). */
export function rejectWrong<T>(actual: T, wrong: T): void {
    if (CONTROLS_INVERTED) expect(actual).toEqual(wrong);
    else expect(actual).not.toEqual(wrong);
}
