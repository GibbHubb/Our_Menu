// OM54 — aisles.ts: which section of the shop a line belongs in.
// Seeded with the four real mis-files fixed in b3e07eb (OM45).
import { describe, it, expect } from 'vitest';
import { aisleFor, AISLE_ORDER, AISLE_LABEL, AISLE_EMOJI } from '@/lib/aisles';
import { rejectWrong } from './control';

describe('aisleFor — the four OM45 mis-files stay fixed', () => {
    it('"lime juice" is produce, not drinks (bare "juice" was a drinks rule)', () => {
        expect(aisleFor('lime juice')).toBe('produce');
    });
    it('"onion powder" is a spice, not fresh onion', () => {
        expect(aisleFor('onion powder')).toBe('spices');
    });
    it('"chipotle powder" is a spice, not Other', () => {
        expect(aisleFor('chipotle powder')).toBe('spices');
    });
    it('"chicken stock" is cupboard, not meat', () => {
        expect(aisleFor('chicken stock')).toBe('cupboard');
    });
});

describe('aisleFor — longest match wins', () => {
    it('"spring onion" / "coconut milk" / "garlic powder" beat their shorter namesakes', () => {
        expect(aisleFor('spring onion')).toBe('produce');
        expect(aisleFor('coconut milk')).toBe('cupboard');
        expect(aisleFor('garlic powder')).toBe('spices');
    });
    it('plain cases land where a shopper expects', () => {
        expect(aisleFor('chicken')).toBe('meat');
        expect(aisleFor('salmon fillet')).toBe('fish');
        expect(aisleFor('Cheddar Cheese')).toBe('dairy');
        expect(aisleFor('beer')).toBe('drinks');
        expect(aisleFor('foil')).toBe('household');
        expect(aisleFor('sourdough loaf')).toBe('bakery');
        expect(aisleFor('frozen peas')).toBe('frozen');
    });
    it('anything unrecognised or empty goes to Other rather than a guess', () => {
        expect(aisleFor('xyzzy')).toBe('other');
        expect(aisleFor('   ')).toBe('other');
    });
    it('CONTROL: chicken stock is not filed under meat', () => {
        rejectWrong(aisleFor('chicken stock'), 'meat');
    });
});

describe('aisle tables', () => {
    it('every aisle in the shop order has a label and an emoji, Other last', () => {
        for (const a of AISLE_ORDER) {
            expect(AISLE_LABEL[a]).toBeTruthy();
            expect(AISLE_EMOJI[a]).toBeTruthy();
        }
        expect(AISLE_ORDER.at(-1)).toBe('other');
        expect(new Set(AISLE_ORDER).size).toBe(Object.keys(AISLE_LABEL).length);
    });
});
