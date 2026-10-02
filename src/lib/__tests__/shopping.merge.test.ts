// OM54 — shopping.ts merge rules (OM49), tested without a database.
//
// The rule from migration 023: merging happens WITHIN a family only. 2 cans +
// 1 can = 3 cans, while 200 g + 1 can stays two lines, because an invented
// g<->can conversion would put a wrong number in front of someone in a shop.
import { describe, it, expect } from 'vitest';
import {
    toCopyLine, foldCopyLines, mergeKey, shoppingKey, listAmount, listLineText,
    tripIsStale, AUTO_FINISH_MS, type ListRow,
} from '@/lib/shopping';
import { rejectWrong } from './control';

const fold = (...raw: string[]) => [...foldCopyLines(raw.map((r) => toCopyLine(r))).values()];

describe('toCopyLine', () => {
    it('carries the amount in base units with its family', () => {
        expect(toCopyLine('200 g tomatoes')).toEqual({
            item: 'tomatoes', key: 'tomato', qty_base: 200, family: 'mass', unit_hint: 'g',
        });
    });
    it('scales by the servings factor', () => {
        expect(toCopyLine('2 cans tomatoes', 1.5).qty_base).toBe(3);
    });
    it('a line with no number has no family: salt and pepper is not 0 g of salt', () => {
        const l = toCopyLine('Salt and pepper');
        expect(l.qty_base).toBeNull();
        expect(l.family).toBeNull();
        expect(l.unit_hint).toBeNull();
    });
    it('cuts prep notes and alternatives off the name', () => {
        expect(toCopyLine('1 onion, chopped').item).toBe('onion');
        expect(toCopyLine('spaghetti or other pasta').item).toBe('spaghetti');
    });
    it('a fraction reaches the list as a fraction (pre-OM54 it was "1 cumin")', () => {
        const l = toCopyLine('1/2 tsp cumin');
        expect(l.qty_base).toBe(2.5);
        expect(l.family).toBe('volume');
        expect(listAmount({ id: 'x', label: l.item, item_key: l.key, qty_base: l.qty_base, family: l.family, unit_hint: l.unit_hint })).toBe('0.5 tsp');
    });
});

describe('foldCopyLines — the merge', () => {
    it('same family, same counted noun: 2 cans + 1 can = 3 cans', () => {
        const out = fold('2 cans tomatoes', '1 can tomatoes');
        expect(out).toHaveLength(1);
        expect(out[0].qty_base).toBe(3);
    });
    it('mass merges exactly: 500 g + 1 kg = 1500 g', () => {
        const out = fold('500 g rice', '1 kg rice');
        expect(out).toHaveLength(1);
        expect(out[0].qty_base).toBe(1500);
    });
    it('CROSS-FAMILY NEGATIVE: 200 g tomatoes + 1 can tomatoes stay TWO rows', () => {
        const out = fold('200 g tomatoes', '1 can tomatoes');
        expect(out).toHaveLength(2);
        expect(out.map((l) => l.family).sort()).toEqual(['count', 'mass']);
        expect(out.find((l) => l.family === 'mass')!.qty_base).toBe(200);
        expect(out.find((l) => l.family === 'count')!.qty_base).toBe(1);
    });
    it('count with different nouns stays apart: 2 cans + 3 (bare) tomatoes', () => {
        const out = fold('2 cans tomatoes', '3 tomatoes');
        expect(out).toHaveLength(2);
    });
    it('an unnumbered line does not merge with a numbered one', () => {
        expect(fold('salt', '20 g salt')).toHaveLength(2);
    });
    it('two unnumbered lines fold to one with no number', () => {
        const out = fold('salt', 'Salt');
        expect(out).toHaveLength(1);
        expect(out[0].qty_base).toBeNull();
    });
    it('blank lines are skipped', () => {
        expect(foldCopyLines([{ item: '  ', key: 'x', qty_base: 1, family: 'count', unit_hint: null }]).size).toBe(0);
    });
    it('CONTROL: 200 g + 1 can is never one row of 201', () => {
        const out = fold('200 g tomatoes', '1 can tomatoes');
        rejectWrong(out.length, 1);
    });
});

describe('mergeKey', () => {
    it('buckets counted things by their noun, mass and volume by family only', () => {
        expect(mergeKey('tomato', 'count', 'can')).not.toBe(mergeKey('tomato', 'count', null));
        expect(mergeKey('rice', 'mass', 'g')).toBe(mergeKey('rice', 'mass', 'kg'));
        expect(mergeKey('tomato', 'mass', 'g')).not.toBe(mergeKey('tomato', 'count', 'can'));
    });
});

describe('shoppingKey', () => {
    it('cuts at the choice and keeps the first option', () => {
        expect(shoppingKey('spaghetti or other pasta, long or short')).toBe('spaghetti');
        expect(shoppingKey('cilantro/coriander')).toBe('cilantro');
    });
    it('word boundaries: "coriander" keeps its "or"', () => {
        expect(shoppingKey('coriander')).toBe('coriander');
    });
});

describe('listAmount / listLineText', () => {
    const row = (over: Partial<ListRow>): ListRow => ({
        id: '1', label: 'tomatoes', item_key: 'tomato', qty_base: 3, family: 'count', unit_hint: 'can', ...over,
    });
    it('renders the amount from qty_base', () => {
        expect(listLineText(row({}))).toBe('3 cans tomatoes');
        expect(listLineText(row({ qty_base: 1500, family: 'mass', unit_hint: 'g' }))).toBe('1.5 kg tomatoes');
    });
    it('no number, no amount', () => {
        expect(listAmount(row({ qty_base: null }))).toBeNull();
        expect(listLineText(row({ qty_base: null, label: 'salt' }))).toBe('salt');
    });
});

describe('tripIsStale', () => {
    const t0 = new Date('2026-10-01T10:00:00Z');
    it('an untouched list (no ticks) never auto-finishes', () => {
        expect(tripIsStale(t0, new Set(), t0.getTime() + 7 * 864e5)).toBe(false);
        expect(tripIsStale(null, new Set(['extra:1']), t0.getTime() + 7 * 864e5)).toBe(false);
    });
    it('a ticked list goes stale only after AUTO_FINISH_MS', () => {
        const ticks = new Set(['extra:1']);
        expect(tripIsStale(t0, ticks, t0.getTime() + AUTO_FINISH_MS)).toBe(false);
        expect(tripIsStale(t0, ticks, t0.getTime() + AUTO_FINISH_MS + 1)).toBe(true);
    });
});
