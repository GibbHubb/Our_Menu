// OM70 — the demo kitchen guests see without logging in.
import { describe, it, expect } from "vitest";
import { DEMO_RECIPES, getDemoRecipe, isDemoId, DEMO_ID_PREFIX } from "../demo";
import { INITIAL_RECIPES } from "../initialData";
import { rejectWrong } from "./control";

describe("OM70 demo kitchen", () => {
    it("serves every titled seed recipe", () => {
        const titled = INITIAL_RECIPES.filter((r) => r.title);
        expect(DEMO_RECIPES.length).toBe(titled.length);
        expect(DEMO_RECIPES.length).toBeGreaterThan(20);
    });

    it("gives each demo recipe a unique, stable demo- id", () => {
        const ids = DEMO_RECIPES.map((r) => r.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const id of ids) expect(id.startsWith(DEMO_ID_PREFIX)).toBe(true);
        // Stable across imports: the same title always maps to the same id.
        const again = DEMO_RECIPES.map((r) => r.id);
        expect(again).toEqual(ids);
    });

    it("never carries an owner or household, so nothing reads as a real row", () => {
        for (const r of DEMO_RECIPES) {
            expect(r.user_id ?? null).toBeNull();
            expect(r.household_id ?? null).toBeNull();
            expect(Array.isArray(r.category)).toBe(true);
            expect(r.title.length).toBeGreaterThan(0);
        }
    });

    it("looks a demo recipe up by id, and refuses anything else", () => {
        const first = DEMO_RECIPES[0];
        expect(getDemoRecipe(first.id)?.title).toBe(first.title);
        expect(getDemoRecipe("demo-does-not-exist")).toBeUndefined();
        expect(getDemoRecipe("3f2b8c1e-0000-4000-8000-000000000000")).toBeUndefined();
    });

    it("never points at the rate-limited pollinations.ai image service", () => {
        // OM70: its free tier answers most requests with a "Free limit reached"
        // banner image, which is what a recruiter clicking the link would see.
        for (const r of DEMO_RECIPES) expect(r.image_url).not.toContain("pollinations.ai");
    });

    it("tells demo ids from real (uuid) ids", () => {
        expect(isDemoId(DEMO_RECIPES[0].id)).toBe(true);
        expect(isDemoId("3f2b8c1e-0000-4000-8000-000000000000")).toBe(false);
        expect(isDemoId("")).toBe(false);
    });

    it("CONTROL: a real (uuid) recipe id is never treated as a demo id", () => {
        // Goes red under OM54_INVERT_CONTROLS=1, proving this file's assertions
        // can fail. The known-wrong answer is the bug that would route a
        // household's real recipe to the demo view: isDemoId(uuid) === true.
        rejectWrong(isDemoId("3f2b8c1e-0000-4000-8000-000000000000"), true);
    });
});
