// OM54 — ingredients.ts: the canonical key every match and merge runs on.
import { describe, it, expect } from 'vitest';
import { canonicaliseIngredient, ingredientsMatch } from '@/lib/ingredients';
import { rejectWrong } from './control';

const k = canonicaliseIngredient;

describe('canonicaliseIngredient', () => {
    it('strips quantity, unit, prep words and the comma note', () => {
        expect(k('2 ripe Roma tomatoes, diced')).toBe('roma tomato');
        expect(k('1 onion, diced')).toBe('onion');
        expect(k('1/2 tsp salt')).toBe('salt');
        expect(k('200g plain flour')).toBe('flour');
    });
    it('strips parenthetical asides', () => {
        expect(k('fresh basil (optional)')).toBe('basil');
    });
    it('singularises: -oes, -ies, -xes, -s, but not -ss', () => {
        expect(k('Tomatoes')).toBe('tomato');
        expect(k('potatoes')).toBe('potato');
        expect(k('berries')).toBe('berry');
        expect(k('boxes')).toBe('box');
        expect(k('shoes')).toBe('shoe');
        expect(k('glass')).toBe('glass');
    });
    it('applies the alias table to the singular form', () => {
        expect(k('sea salt')).toBe('salt');
        expect(k('red onions')).toBe('onion');
        expect(k('chicken breasts')).toBe('chicken');
        expect(k('black pepper')).toBe('pepper');
        expect(k('olive oil')).toBe('olive oil');
        expect(k('chicken stock')).toBe('chicken stock');
    });
    it('empty and all-noise inputs give an empty key', () => {
        expect(k('')).toBe('');
        expect(k('2 tbsp')).toBe('');
    });
});

describe('ingredientsMatch', () => {
    it('matches across quantity, prep and colour words', () => {
        expect(ingredientsMatch('Red Onion', '1 onion, diced')).toBe(true);
        expect(ingredientsMatch('2 cans tomatoes', 'tomato')).toBe(true);
    });
    it('different things do not match, and empty never matches empty', () => {
        expect(ingredientsMatch('chicken stock', 'chicken')).toBe(false);
        expect(ingredientsMatch('', '')).toBe(false);
    });
    it('CONTROL: olive oil is not the same thing as oil', () => {
        rejectWrong(ingredientsMatch('olive oil', 'oil'), true);
    });
});
