// OM74 — the pure parts of the OM73 leftovers: receipt photo sizing, reading a non-JSON error
// response, and the meal-plan "meal is a meal type" repair.
import { describe, expect, it } from 'vitest';
import { fitWithin, MAX_LONG_EDGE, JPEG_QUALITY } from '@/lib/imageDownscale';
import { errorText, readJsonSafe } from '@/lib/readJsonSafe';
import { FALLBACK_MEAL_NAME, fixMealNames, isMealTypeWord } from '@/lib/mealPlan';
import { rejectWrong } from './control';

describe('fitWithin', () => {
    it('scales a 4032x3024 phone photo to a 1600 px long edge, keeping the aspect', () => {
        expect(fitWithin(4032, 3024)).toEqual({ width: 1600, height: 1200 });
        expect(fitWithin(3024, 4032)).toEqual({ width: 1200, height: 1600 });
    });

    it('never upscales a small image', () => {
        expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
        expect(fitWithin(1600, 900)).toEqual({ width: 1600, height: 900 });
    });

    it('keeps a very thin receipt at least 1 px wide', () => {
        expect(fitWithin(10, 100000)).toEqual({ width: 1, height: 1600 });
    });

    it('uses the agreed defaults', () => {
        expect(MAX_LONG_EDGE).toBe(1600);
        expect(JPEG_QUALITY).toBe(0.8);
    });
});

describe('readJsonSafe', () => {
    it('returns the parsed JSON body', async () => {
        expect(await readJsonSafe(new Response('{"items":[1]}', { status: 200 }))).toEqual({ items: [1] });
        expect(await readJsonSafe(new Response('{"error":"nope"}', { status: 400 }))).toEqual({ error: 'nope' });
    });

    it('turns the platform plain-text 413 into "Upload failed (HTTP 413)", not a parse error', async () => {
        const res = new Response('Request Entity Too Large', { status: 413 });
        expect(await readJsonSafe(res, 'Upload')).toEqual({ error: 'Upload failed (HTTP 413)' });
    });

    it('handles an HTML 504 and an empty body', async () => {
        expect(await readJsonSafe(new Response('<html>timeout</html>', { status: 504 })))
            .toEqual({ error: 'Request failed (HTTP 504)' });
        expect(await readJsonSafe(new Response(null, { status: 502 })))
            .toEqual({ error: 'Request failed (HTTP 502)' });
    });

    it('errorText prefers the route\'s own error, else the status', () => {
        const res = new Response(null, { status: 503 });
        expect(errorText(res, { error: 'AI is busy, try again in a minute.' })).toBe('AI is busy, try again in a minute.');
        expect(errorText(res, {}, 'Upload')).toBe('Upload failed (HTTP 503)');
        expect(errorText(res, { error: 42 })).toBe('Request failed (HTTP 503)');
    });

    it('CONTROL: a non-JSON 413 is not passed through as a JSON parse error', async () => {
        // Goes red under OM54_INVERT_CONTROLS=1. The known-wrong answer is the OM74 bug: the
        // scanner showed the JSON parse error instead of the HTTP status.
        const out = await readJsonSafe(new Response('Request Entity Too Large', { status: 413 }), 'Upload');
        let parseError = '';
        try { JSON.parse('Request Entity Too Large'); } catch (e) { parseError = (e as Error).message; }
        rejectWrong(out.error, parseError);
    });
});

describe('fixMealNames', () => {
    it('recognises meal-type words, case and trailing punctuation ignored', () => {
        for (const w of ['Lunch', 'DINNER', ' breakfast ', 'Snack.', 'Dessert', 'Meal', '']) {
            expect(isMealTypeWord(w)).toBe(true);
        }
        for (const w of ['Lamb Curry', 'Lunchbox pasta', 'Dinner rolls with soup']) {
            expect(isMealTypeWord(w)).toBe(false);
        }
    });

    it('replaces a meal-type `meal` with the recipe title, else the fallback, and keeps every day', () => {
        const out = fixMealNames([
            { day: 1, meal: 'Lunch', recipe_title: 'Lamb Curry' },
            { day: 2, meal: 'dinner', recipe_title: null },
            { day: 3, meal: 'Fish Tacos', recipe_title: 'Fish Tacos' },
            { day: 4, meal: 'Dinner', recipe_title: 'Dinner' },
        ]);
        expect(out.map((d) => d.meal)).toEqual(['Lamb Curry', FALLBACK_MEAL_NAME, 'Fish Tacos', FALLBACK_MEAL_NAME]);
        expect(out).toHaveLength(4);
    });
});
