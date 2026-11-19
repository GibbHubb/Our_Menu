// OM58 review (2026-11-17) — the grid card's Edit control. Server-rendered
// markup, so it needs no DOM: what is inside the <a>, and what the button's
// classes promise about visibility on keyboard focus.
import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import RecipeCard from '@/components/RecipeCard';
import type { Recipe } from '@/lib/types';
import { rejectWrong } from './control';

const recipe = {
    id: 'r1', created_at: '2026-01-01', title: 'Laksa', category: ['Soup'],
    link: 'https://example.com/laksa', image_url: '',
} as Recipe;

const html = renderToStaticMarkup(createElement(RecipeCard, { recipe, onEdit: () => {} }));
const anchor = html.match(/<a\b[^>]*>([\s\S]*?)<\/a>/);
const editButton = html.match(/<button\b[^>]*aria-label="Edit (?:recipe|Laksa)"[^>]*>/)?.[0] ?? '';
const nestedButton = (a: RegExpMatchArray | null) => !!a && /<button\b/.test(a[1]);

describe('RecipeCard', () => {
    it('the card is still one link to the recipe', () => {
        expect(anchor?.[0] ?? '').toMatch('href="/recipe/r1"');
    });
    it('the Edit button is NOT inside the link (no nested interactive)', () => {
        expect(editButton).not.toBe('');
        expect(nestedButton(anchor)).toBe(false);
    });
    it('the Edit button shows on keyboard focus, not only on hover', () => {
        expect(editButton).toMatch('focus-visible:opacity-100');
        expect(editButton).toMatch('group-focus-within:opacity-100');
    });
    it('the hover rule is kept', () => {
        expect(editButton).toMatch('group-hover:opacity-100');
    });
    it('no Edit button without an onEdit handler', () => {
        const plain = renderToStaticMarkup(createElement(RecipeCard, { recipe }));
        expect(plain).not.toMatch('<button');
    });
    it('CONTROL: the card never has a button inside its link', () => {
        rejectWrong(nestedButton(anchor), true);
    });
});
