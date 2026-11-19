// OM58 review (2026-11-17) — Escape on a half-filled form asks before it
// discards, the same decision that keeps backdrop click from closing at all.
import { describe, it, expect, vi } from 'vitest';
import { shouldCloseOnEscape, formIsDirty, DISCARD_MESSAGE } from '@/lib/dialog';
import { rejectWrong } from './control';

describe('Escape', () => {
    it('closes an untouched form without asking', () => {
        const ask = vi.fn(() => false);
        expect(shouldCloseOnEscape(false, ask)).toBe(true);
        expect(ask.mock.calls).toHaveLength(0);
    });
    it('asks first on a dirty form, and stays open on Cancel', () => {
        const ask = vi.fn(() => false);
        expect(shouldCloseOnEscape(true, ask)).toBe(false);
        expect(ask.mock.calls).toEqual([[DISCARD_MESSAGE]]);
    });
    it('closes a dirty form once the user confirms', () => {
        expect(shouldCloseOnEscape(true, () => true)).toBe(true);
    });
    it('CONTROL: a dirty form is never discarded on a Cancel', () => {
        rejectWrong(shouldCloseOnEscape(true, () => false), true);
    });
});

describe('formIsDirty', () => {
    const empty = { title: '', category: ['Mains'], link: '', seasons: [] as string[] };
    it('an untouched Add form is clean', () => {
        expect(formIsDirty({ ...empty }, empty)).toBe(false);
    });
    it('typing a title makes it dirty', () => {
        expect(formIsDirty({ ...empty, title: 'Laksa' }, empty)).toBe(true);
    });
    it('changing a picked category makes it dirty', () => {
        expect(formIsDirty({ ...empty, category: ['Soup'] }, empty)).toBe(true);
    });
    it('empty-ish values are equal (undefined vs "" vs null vs [])', () => {
        expect(formIsDirty({ title: 'x', notes: '' }, { title: 'x', notes: null, seasons: undefined })).toBe(false);
    });
    it('the Edit form before its effect has filled it ({}) is clean', () => {
        expect(formIsDirty({}, { title: 'Laksa' })).toBe(false);
    });
});
