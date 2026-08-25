/**
 * OM40 step 7 — write inferred diet tags.
 *
 * DRY RUN BY DEFAULT. It prints the before→after counts per diet and a sample
 * of classifications, and writes nothing until you pass --write. That is the
 * numbers-first rule the Equans backfill bought, applied to Max's own data:
 * the rule was agreed, the blast radius still gets shown first.
 *
 *   npx tsx scripts/backfill_diet_tags.ts            # dry run
 *   npx tsx scripts/backfill_diet_tags.ts --write    # apply
 */

import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import { inferDiets, type Diet } from "../src/lib/dietInfer";

for (const file of [".env", ".env.local"]) {
    const p = path.resolve(process.cwd(), file);
    if (!fs.existsSync(p)) continue;
    for (const raw of fs.readFileSync(p, "utf-8").split("\n")) {
        const i = raw.indexOf("=");
        if (i < 1) continue;
        const k = raw.slice(0, i).trim();
        const v = raw.slice(i + 1).trim();
        if (k && v) process.env[k] = v;
    }
}

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const WRITE = process.argv.includes("--write");
const HOUSEHOLD = "27da12de-8aa6-4271-b2e5-fb3c0cfa2848";

async function main() {
    const { data, error } = await supabase
        .from("recipes")
        .select("id, title, ingredients, diet, diet_auto")
        .eq("household_id", HOUSEHOLD)
        .order("title");
    if (error) throw error;

    const counts: Record<Diet | "untagged" | "skipped", number> = {
        vegetarian: 0, vegan: 0, "gluten-free": 0, "dairy-free": 0, untagged: 0, skipped: 0,
    };
    const before = (data ?? []).filter((r) => (r.diet ?? []).length > 0).length;
    const ownerSet = (data ?? []).filter((r) => (r.diet ?? []).length > 0 && !r.diet_auto);
    const updates: Array<{ id: string; diet: string[]; title: string }> = [];
    const sample: string[] = [];

    for (const r of data ?? []) {
        // Never touch a tag a human set — that is the whole point of diet_auto.
        if ((r.diet ?? []).length > 0 && !r.diet_auto) continue;

        const { diets, skipped } = inferDiets(r.ingredients as string | null);
        if (skipped) counts.skipped++;
        if (!diets.length) counts.untagged++;
        for (const d of diets) counts[d]++;

        updates.push({ id: r.id as string, diet: diets, title: (r.title as string).trim() });
        if (sample.length < 12) {
            sample.push(`  ${(r.title as string).trim().slice(0, 32).padEnd(34)} ${diets.join(", ") || (skipped ?? "— nothing claimed")}`);
        }
    }

    console.log(`\nrecipes considered:        ${updates.length}`);
    console.log(`already tagged by a human: ${ownerSet.length}  (left alone)`);
    console.log(`tagged before this run:    ${before}`);
    console.log(`\nafter this run, per chip:`);
    console.log(`  vegetarian   ${counts.vegetarian}`);
    console.log(`  vegan        ${counts.vegan}`);
    console.log(`  gluten-free  ${counts["gluten-free"]}`);
    console.log(`  dairy-free   ${counts["dairy-free"]}`);
    console.log(`  no tag       ${counts.untagged}   (of which ${counts.skipped} had too little to judge)`);
    console.log(`\nsample:\n${sample.join("\n")}`);

    if (!WRITE) {
        console.log(`\nDRY RUN — nothing written. Re-run with --write to apply.`);
        return;
    }

    let ok = 0;
    for (const u of updates) {
        const { error: e } = await supabase
            .from("recipes")
            .update({ diet: u.diet, diet_auto: true })
            .eq("id", u.id);
        if (e) console.error(`  FAIL ${u.title}: ${e.message}`);
        else ok++;
    }
    console.log(`\nwrote ${ok}/${updates.length} rows (diet_auto = true on every one).`);
}

main();
