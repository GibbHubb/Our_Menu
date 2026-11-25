// OM69 — supabase/migrations/ is the schema's record, so it has to stay in
// step with prod. Static checks only: no database is reachable from the unit
// suite (or from CI, which has no Supabase key on purpose).
//
//   * file numbers are three digits, unique and gapless, so two branches that
//     both add "the next" migration collide here instead of in prod;
//   * 028 records OM50's hand-run drops and removes the two hand-made backups,
//     every DROP is IF EXISTS (prod already lacks the OM50 objects; a rebuilt
//     database never had the backups), and the backups are only dropped behind
//     the row-count guard that matches the 2026-11-25 export.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { rejectWrong } from './control';

const DIR = path.resolve(__dirname, '../../../supabase/migrations');
const files = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();

/** The numbers 1..N that are missing or repeated in a list of migration numbers. */
function numberingProblems(nums: number[]): { missing: number[]; repeated: number[] } {
    const seen = new Map<number, number>();
    for (const n of nums) seen.set(n, (seen.get(n) ?? 0) + 1);
    const max = Math.max(0, ...nums);
    const missing: number[] = [];
    for (let i = 1; i <= max; i++) if (!seen.has(i)) missing.push(i);
    const repeated = [...seen].filter(([, c]) => c > 1).map(([n]) => n);
    return { missing, repeated };
}

/** DROP TABLE / DROP COLUMN statements in `sql` (comments stripped) that lack IF EXISTS. */
function unguardedDrops(sql: string): string[] {
    const code = sql.replace(/--.*$/gm, '');
    return [...code.matchAll(/\bDROP\s+(TABLE|COLUMN)\s+(?!IF\s+EXISTS)[^;\s]+/gi)].map((m) => m[0]);
}

const sql028 = readFileSync(
    path.join(DIR, files.find((f) => f.startsWith('028_')) ?? '028_missing.sql'),
    'utf8',
);
const code028 = sql028.replace(/--.*$/gm, '');

describe('migration numbering', () => {
    it('every file is NNN_<what>.sql', () => {
        expect(files.filter((f) => !/^\d{3}_[a-z0-9_]+\.sql$/.test(f))).toEqual([]);
    });
    it('numbers are unique and gapless from 001', () => {
        const nums = files.map((f) => Number(f.slice(0, 3)));
        expect(numberingProblems(nums)).toEqual({ missing: [], repeated: [] });
        expect(nums[0]).toBe(1);
    });
});

describe('028 — OM69 makes the files match prod', () => {
    it('records the three OM50 hand-run drops', () => {
        expect(code028).toMatch(/DROP TABLE IF EXISTS public\.meal_basket\b/);
        expect(code028).toMatch(/ALTER TABLE public\.pantry_items\s+DROP COLUMN IF EXISTS needed\b/);
        expect(code028).toMatch(/ALTER TABLE public\.shopping_extras\s+DROP COLUMN IF EXISTS checked\b/);
    });
    it('drops both hand-made backup tables', () => {
        expect(code028).toMatch(/DROP TABLE IF EXISTS public\.recipes_backup_om40\b/);
        expect(code028).toMatch(/DROP TABLE IF EXISTS public\.recipes_orphan_backup_2026_08_26\b/);
    });
    it('every DROP is IF EXISTS, so a re-run or a rebuilt database is a no-op', () => {
        expect(unguardedDrops(sql028)).toEqual([]);
    });
    it('never cascades (a hidden dependent should stop it, not be dropped with it)', () => {
        expect(code028).not.toMatch(/\bCASCADE\b/i);
    });
    it('runs in one transaction with the export row counts guarded before any drop', () => {
        const begin = code028.indexOf('BEGIN;');
        const guard96 = code028.indexOf('n <> 96');
        const guard82 = code028.indexOf('n <> 82');
        const firstDrop = code028.search(/\bDROP (TABLE|COLUMN)\b/);
        expect(begin).toBeGreaterThanOrEqual(0);
        expect(guard96).toBeGreaterThan(begin);
        expect(guard82).toBeGreaterThan(begin);
        expect(firstDrop).toBeGreaterThan(Math.max(guard96, guard82));
        expect(code028.trimEnd().endsWith('COMMIT;')).toBe(true);
    });
    it('the unguarded-drop check does catch a bare DROP', () => {
        expect(unguardedDrops('DROP TABLE public.meal_basket;')).toEqual(['DROP TABLE public.meal_basket']);
    });
});

describe('controls', () => {
    it('CONTROL: two branches both adding 028 is not a clean numbering', () => {
        // Goes red under OM54_INVERT_CONTROLS=1. The known-wrong answer is the collision this
        // file exists to catch: om69 and another worktree each adding "the next" migration.
        const clash = [...files.map((f) => Number(f.slice(0, 3))), 28];
        rejectWrong(numberingProblems(clash), { missing: [], repeated: [] });
    });
});
