// OM54 — quantity.ts: parse, scale, base amounts, formatting, aggregation.
// Every input shape below is one the file header says it supports, taken from
// recipes in the database.
import { describe, it, expect } from 'vitest';
import { parseIngredient, scale, toBaseAmount, formatAmount, aggregate } from '@/lib/quantity';
import { rejectWrong } from './control';

const p = (line: string) => {
    const r = parseIngredient(line);
    return { qty: r.qty, unit: r.unit, family: r.family, item: r.item };
};

describe('parseIngredient — the shapes in the file header', () => {
    it('plain: "2 tbsp lime juice"', () => {
        expect(p('2 tbsp lime juice')).toEqual({ qty: 2, unit: 'tbsp', family: 'volume', item: 'lime juice' });
    });
    it('ascii fraction: "1/2 tsp cumin powder" is half a teaspoon', () => {
        expect(p('1/2 tsp cumin powder')).toEqual({ qty: 0.5, unit: 'tsp', family: 'volume', item: 'cumin powder' });
    });
    it('mixed number: "1 1/2 cups flour" is one and a half cups', () => {
        expect(p('1 1/2 cups flour')).toEqual({ qty: 1.5, unit: 'cup', family: 'volume', item: 'flour' });
    });
    it('vulgar fraction: "½ cup coriander"', () => {
        expect(p('½ cup coriander')).toEqual({ qty: 0.5, unit: 'cup', family: 'volume', item: 'coriander' });
    });
    it('vulgar fraction glued to a whole number: "1½ cups milk"', () => {
        expect(p('1½ cups milk')).toEqual({ qty: 1.5, unit: 'cup', family: 'volume', item: 'milk' });
    });
    it('vulgar fraction after a space: "1 ½ cups rice"', () => {
        expect(p('1 ½ cups rice')).toEqual({ qty: 1.5, unit: 'cup', family: 'volume', item: 'rice' });
    });
    it('ranges take the upper bound: "2 - 3", "2-3", "2 to 3"', () => {
        expect(p('2 - 3 garlic cloves').qty).toBe(3);
        expect(p('2-3 garlic cloves').qty).toBe(3);
        expect(p('2 to 3 onions').qty).toBe(3);
    });
    it('a word that is not a unit belongs to the item: "2 garlic cloves"', () => {
        expect(p('2 garlic cloves')).toEqual({ qty: 2, unit: null, family: 'count', item: 'garlic cloves' });
    });
    it('a counted unit: "3 cloves garlic"', () => {
        expect(p('3 cloves garlic')).toEqual({ qty: 3, unit: 'clove', family: 'count', item: 'garlic' });
    });
    it('dual units prefer the metric half and strip nested notes', () => {
        const r = parseIngredient('1 lb / 500g beef steak ((rump and skirt are ideal) (Note 1))');
        expect({ qty: r.qty, unit: r.unit, item: r.item }).toEqual({ qty: 500, unit: 'g', item: 'beef steak' });
        expect(r.note).toContain('rump and skirt');
    });
    it('dual units, metric second with a fraction first: "1/2 cup / 120 ml milk"', () => {
        expect(p('1/2 cup / 120 ml milk')).toEqual({ qty: 120, unit: 'ml', family: 'volume', item: 'milk' });
    });
    it('dual units with a mixed number: "1 1/2 cups / 350 ml flour" is 350 ml of flour', () => {
        expect(p('1 1/2 cups / 350 ml flour')).toEqual({ qty: 350, unit: 'ml', family: 'volume', item: 'flour' });
        expect(p('1 1/2 lb / 700g beef')).toEqual({ qty: 700, unit: 'g', family: 'mass', item: 'beef' });
        expect(p('1 ½ cups / 355 ml milk')).toEqual({ qty: 355, unit: 'ml', family: 'volume', item: 'milk' });
    });
    it('dual units with ranges: "2-3 tbsp / 30-45 ml oil" takes the metric upper bound', () => {
        expect(p('2-3 tbsp / 30-45 ml oil')).toEqual({ qty: 45, unit: 'ml', family: 'volume', item: 'oil' });
    });
    it('dual units, neither metric, keeps the first half: "4 tbsp / 1/4 cup orange juice"', () => {
        expect(p('4 tbsp / 1/4 cup orange juice')).toEqual({ qty: 4, unit: 'tbsp', family: 'volume', item: 'orange juice' });
    });
    it('no quantity: "Salt and pepper" is null, not zero', () => {
        expect(p('Salt and pepper')).toEqual({ qty: null, unit: null, family: null, item: 'salt and pepper' });
    });
    it('European decimal comma: "1,5 kg potatoes"', () => {
        expect(p('1,5 kg potatoes')).toEqual({ qty: 1.5, unit: 'kg', family: 'mass', item: 'potatoes' });
    });
    it('strips list bullets, checkboxes, unit dots and stray punctuation', () => {
        expect(p('- 2 eggs').item).toBe('eggs');
        expect(p('[x] 1 can tomatoes')).toEqual({ qty: 1, unit: 'can', family: 'count', item: 'tomatoes' });
        expect(p('1 tsp. salt')).toEqual({ qty: 1, unit: 'tsp', family: 'volume', item: 'salt' });
        expect(p('guanciale (, fresh (1 orange))').item).toBe('guanciale');
    });
    it('aliases canonicalise: "1 tin" is a can, "1 lb" is a pound', () => {
        expect(p('1 tin tomatoes').unit).toBe('can');
        expect(p('1 lb flour')).toEqual({ qty: 1, unit: 'lb', family: 'mass', item: 'flour' });
    });
    it('keeps the raw line verbatim', () => {
        expect(parseIngredient('  2 tbsp soy sauce ').raw).toBe('  2 tbsp soy sauce ');
    });
    it('CONTROL: "1/2 tsp" must never read as 1 of something (the pre-OM54 bug)', () => {
        // Goes red under OM54_INVERT_CONTROLS=1, which proves this file's
        // assertions can fail: the real answer is not { qty: 1, unit: null }.
        const r = p('1/2 tsp cumin powder');
        rejectWrong({ qty: r.qty, unit: r.unit }, { qty: 1, unit: null });
    });
});

describe('scale', () => {
    it('multiplies the amount and leaves the rest alone', () => {
        const r = scale(parseIngredient('200 g rice'), 1.5);
        expect(r.qty).toBe(300);
        expect(r.unit).toBe('g');
    });
    it('a line with no number stays without one', () => {
        expect(scale(parseIngredient('salt'), 3).qty).toBeNull();
    });
    it('factor 1 returns the same object', () => {
        const r = parseIngredient('2 eggs');
        expect(scale(r, 1)).toBe(r);
    });
});

describe('toBaseAmount', () => {
    it('converts to the family base unit', () => {
        expect(toBaseAmount(parseIngredient('1 kg flour'))).toBe(1000);
        expect(toBaseAmount(parseIngredient('2 tbsp oil'))).toBe(30);
        expect(toBaseAmount(parseIngredient('1 cup milk'))).toBe(240);
        expect(toBaseAmount(parseIngredient('1 lb beef'))).toBeCloseTo(453.592);
        expect(toBaseAmount(parseIngredient('2 cans tomatoes'))).toBe(2);
    });
    it('unitless counts are the count; no number is null', () => {
        expect(toBaseAmount(parseIngredient('3 eggs'))).toBe(3);
        expect(toBaseAmount(parseIngredient('salt and pepper'))).toBeNull();
    });
});

describe('formatAmount', () => {
    it('mass switches to kg at 1000 g', () => {
        expect(formatAmount(999, 'mass', null)).toBe('999 g');
        expect(formatAmount(1500, 'mass', null)).toBe('1.5 kg');
    });
    it('volume: spoons stay spoons, otherwise ml / l', () => {
        expect(formatAmount(45, 'volume', 'tbsp')).toBe('3 tbsp');
        expect(formatAmount(480, 'volume', 'cup')).toBe('2 cup');
        expect(formatAmount(250, 'volume', null)).toBe('250 ml');
        expect(formatAmount(1500, 'volume', 'ml')).toBe('1.5 l');
    });
    it('count pluralises correctly, including -es after ch/sh/s/x/z', () => {
        expect(formatAmount(1, 'count', 'can')).toBe('1 can');
        expect(formatAmount(3, 'count', 'can')).toBe('3 cans');
        expect(formatAmount(2, 'count', 'pinch')).toBe('2 pinches');
        expect(formatAmount(2, 'count', 'bunch')).toBe('2 bunches');
        expect(formatAmount(3, 'count', null)).toBe('3');
    });
    it('rounds to two decimals', () => {
        expect(formatAmount(1 / 3, 'mass', null)).toBe('0.33 g');
    });
});

describe('aggregate', () => {
    const lines = [
        { parsed: parseIngredient('2 tbsp soy sauce'), source: 'A', key: 'soy' },
        { parsed: parseIngredient('1 tbsp soy sauce'), source: 'B', key: 'soy' },
        { parsed: parseIngredient('2 cloves garlic'), source: 'A', key: 'garlic' },
        { parsed: parseIngredient('1 tsp garlic paste'), source: 'B', key: 'garlic' },
        { parsed: parseIngredient('salt'), source: 'A', key: 'salt' },
    ];
    const out = aggregate(lines);
    const by = (k: string) => out.find((l) => l.item === k)!;

    it('sums the same family: 2 tbsp + 1 tbsp = 3 tbsp', () => {
        expect(by('soy sauce').amounts).toEqual([{ qty: 45, unit: 'tbsp', display: '3 tbsp' }]);
        expect(by('soy sauce').sources).toEqual(['A', 'B']);
    });
    it('never adds across families: 2 cloves + 1 tsp stay side by side', () => {
        expect(by('garlic').amounts.map((a) => a.display)).toEqual(['2 cloves', '1 tsp']);
    });
    it('keeps unparsed lines verbatim instead of dropping them', () => {
        expect(by('salt').amounts).toEqual([]);
        expect(by('salt').unparsed).toEqual(['salt']);
    });
    it('CONTROL: 2 cloves + 1 tsp of garlic is not one merged amount', () => {
        rejectWrong(by('garlic').amounts.length, 1);
    });
});
