// OM54 — unitConversion.ts: display-time metric <-> US conversion (OM27) and
// the density-based volume <-> mass bridge (OM31).
import { describe, it, expect, afterEach, vi } from 'vitest';
import { convertForDisplay, getUnitSystem, setUnitSystem } from '@/lib/unitConversion';
import { rejectWrong } from './control';

const c = convertForDisplay;

describe('convertForDisplay — same dimension', () => {
    it('in-system values pass through untouched', () => {
        expect(c(100, 'g', 'metric')).toEqual({ quantity: 100, unit: 'g' });
        expect(c(2, 'cup', 'us')).toEqual({ quantity: 2, unit: 'cup' });
    });
    it('US mass to metric: 2 lb = 907 g', () => {
        expect(c(2, 'lb', 'metric')).toEqual({ quantity: 907, unit: 'g' });
    });
    it('metric mass to US: 500 g = 1.1 lb; 2000 g = 4.4 lb; 100 g in oz', () => {
        expect(c(500, 'g', 'us')).toEqual({ quantity: 1.1, unit: 'lb' });
        expect(c(2000, 'g', 'us')).toEqual({ quantity: 4.4, unit: 'lb' });
        expect(c(100, 'g', 'us')).toEqual({ quantity: 3.5, unit: 'oz' });
    });
    it('US volume to metric: 1 cup = 237 ml; 2 tsp = 10 ml; 1 gal ~ 3.8 l', () => {
        expect(c(1, 'cup', 'metric')).toEqual({ quantity: 237, unit: 'ml' });
        expect(c(2, 'tsp', 'metric')).toEqual({ quantity: 10, unit: 'ml' });
        const gal = c(1, 'gal', 'metric');
        expect(gal.unit).toBe('l');
        expect(gal.quantity).toBeCloseTo(3.8, 5);
    });
    it('metric volume to US walks tsp -> tbsp -> cup -> pt -> qt', () => {
        expect(c(5, 'ml', 'us').unit).toBe('tsp');
        expect(c(10, 'ml', 'us')).toEqual({ quantity: 0.75, unit: 'tbsp' });
        expect(c(250, 'ml', 'us')).toEqual({ quantity: 1, unit: 'cup' });
        expect(c(600, 'ml', 'us')).toEqual({ quantity: 1.25, unit: 'pt' });
        expect(c(3, 'l', 'us')).toEqual({ quantity: 3.25, unit: 'qt' });
    });
    it('unit aliases resolve ("Tablespoons", "kilos", "fl oz")', () => {
        expect(c(1, 'Tablespoons', 'metric')).toEqual({ quantity: 15, unit: 'ml' });
        expect(c(2, 'kilos', 'us')).toEqual({ quantity: 4.4, unit: 'lb' });
        expect(c(1, 'fl oz', 'metric')).toEqual({ quantity: 30, unit: 'ml' });
    });
    it('unknown units, null quantity and null unit pass through', () => {
        expect(c(1, 'pinch', 'us')).toEqual({ quantity: 1, unit: 'pinch' });
        expect(c(null, 'g', 'us')).toEqual({ quantity: null, unit: 'g' });
        expect(c(3, null, 'us')).toEqual({ quantity: 3, unit: null });
    });
});

describe('convertForDisplay — density bridge (OM31)', () => {
    it('US cup of flour shows grams to a metric reader (125 g)', () => {
        expect(c(1, 'cup', 'metric', 'flour')).toEqual({ quantity: 125, unit: 'g' });
    });
    it('a lot of flour switches to kg', () => {
        expect(c(10, 'cup', 'metric', 'flour')).toEqual({ quantity: 1.25, unit: 'kg' });
    });
    it('metric grams of flour show cups to a US reader', () => {
        expect(c(200, 'g', 'us', 'flour')).toEqual({ quantity: 1.5, unit: 'cup' });
        expect(c(1000, 'g', 'us', 'flour')).toEqual({ quantity: 2, unit: 'qt' });
    });
    it('small amounts of salt become spoons', () => {
        expect(c(5, 'g', 'us', 'salt')).toEqual({ quantity: 0.75, unit: 'tsp' });
        expect(c(10, 'g', 'us', 'salt')).toEqual({ quantity: 0.5, unit: 'tbsp' });
    });
    it('metric ml stays ml for a metric reader even with a known density', () => {
        expect(c(250, 'ml', 'metric', 'milk')).toEqual({ quantity: 250, unit: 'ml' });
    });
    it('unknown ingredient falls back to same-dimension conversion, never a guessed mass', () => {
        expect(c(1, 'cup', 'metric', 'unobtainium')).toEqual({ quantity: 237, unit: 'ml' });
    });
    it('CONTROL: 1 cup of flour is not 237 g (that would be water density)', () => {
        rejectWrong(c(1, 'cup', 'metric', 'flour'), { quantity: 237, unit: 'g' });
    });
});

describe('getUnitSystem / setUnitSystem', () => {
    afterEach(() => { vi.unstubAllGlobals(); });

    it('server-side (no window) is metric and setting is a no-op', () => {
        expect(getUnitSystem()).toBe('metric');
        expect(() => setUnitSystem('us')).not.toThrow();
    });
    it('round-trips through localStorage and announces the change', () => {
        const store = new Map<string, string>();
        const events: string[] = [];
        vi.stubGlobal('window', {
            localStorage: {
                getItem: (k: string) => store.get(k) ?? null,
                setItem: (k: string, v: string) => { store.set(k, v); },
            },
            dispatchEvent: (e: Event) => { events.push(e.type); return true; },
        });
        expect(getUnitSystem()).toBe('metric');
        setUnitSystem('us');
        expect(getUnitSystem()).toBe('us');
        expect(events).toEqual(['om27-unit-system-changed']);
        store.set('om27_unit_system', 'garbage');
        expect(getUnitSystem()).toBe('metric');
    });
});
