/**
 * OM42 — tag recipes with the season they belong to.
 *
 * DRY RUN BY DEFAULT: prints the before→after counts and a sample, writes
 * nothing until --write. Same numbers-first rule as the diet backfill.
 *
 *   npx tsx scripts/backfill_seasons.ts
 *   npx tsx scripts/backfill_seasons.ts --write
 */
import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import { inferSeasons, type Season } from "../src/lib/seasonInfer";

for (const file of [".env", ".env.local"]) {
    const p = path.resolve(process.cwd(), file);
    if (!fs.existsSync(p)) continue;
    for (const raw of fs.readFileSync(p, "utf-8").split("\n")) {
        const i = raw.indexOf("=");
        if (i < 1) continue;
        const k = raw.slice(0, i).trim(), v = raw.slice(i + 1).trim();
        if (k && v) process.env[k] = v;
    }
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const WRITE = process.argv.includes("--write");
const HOUSEHOLD = "27da12de-8aa6-4271-b2e5-fb3c0cfa2848";

async function main() {
    const { data, error } = await supabase
        .from("recipes")
        .select("id, title, category, ingredients, instructions, seasons")
        .eq("household_id", HOUSEHOLD)
        .order("title");
    if (error) throw error;

    const counts: Record<Season | "year-round", number> = {
        spring: 0, summer: 0, autumn: 0, winter: 0, "year-round": 0,
    };
    const basisCount: Record<string, number> = {};
    const updates: Array<{ id: string; seasons: string[]; title: string; basis: string }> = [];

    for (const r of data ?? []) {
        // Never overwrite a season someone set by hand.
        if ((r.seasons ?? []).length > 0) continue;
        const { seasons, basis } = inferSeasons(
            r.category as string[] | null,
            r.ingredients as string | null,
            r.instructions as string | null,
        );
        basisCount[basis] = (basisCount[basis] ?? 0) + 1;
        if (!seasons.length) counts["year-round"]++;
        for (const s of seasons) counts[s]++;
        updates.push({ id: r.id as string, seasons, title: (r.title as string).trim(), basis });
    }

    console.log(`\nrecipes considered: ${updates.length}`);
    console.log(`  spring ${counts.spring} · summer ${counts.summer} · autumn ${counts.autumn} · winter ${counts.winter}`);
    console.log(`  year-round (untagged, always shown): ${counts["year-round"]}`);
    console.log(`  decided by: ${Object.entries(basisCount).map(([k, v]) => `${k} ${v}`).join(" · ")}`);
    console.log(`\nsample:`);
    for (const u of updates.filter((x) => x.seasons.length).slice(0, 12)) {
        console.log(`  ${u.title.slice(0, 32).padEnd(34)} ${u.seasons.join(", ").padEnd(16)} (${u.basis})`);
    }

    if (!WRITE) { console.log(`\nDRY RUN — nothing written.`); return; }

    let ok = 0;
    for (const u of updates.filter((x) => x.seasons.length)) {
        const { error: e } = await supabase.from("recipes").update({ seasons: u.seasons }).eq("id", u.id);
        if (e) console.error(`  FAIL ${u.title}: ${e.message}`); else ok++;
    }
    console.log(`\nwrote ${ok} rows; the rest stay year-round.`);
}

main();
