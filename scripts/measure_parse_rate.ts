/**
 * OM40 step 2 — how much of the real ingredient corpus can we actually parse?
 *
 * The plan gates the whole feature on this number: below ~80% the shopping
 * list is noise and the design needs rethinking rather than shipping. Run:
 *
 *   npx tsx scripts/measure_parse_rate.ts            # summary
 *   npx tsx scripts/measure_parse_rate.ts --misses   # every unparsed line
 */

import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import { parseIngredient } from "../src/lib/quantity";

for (const file of [".env", ".env.local"]) {
    const p = path.resolve(process.cwd(), file);
    if (!fs.existsSync(p)) continue;
    for (const raw of fs.readFileSync(p, "utf-8").split("\n")) {
        const i = raw.indexOf("=");
        if (i < 1) continue;
        const k = raw.slice(0, i).trim();
        const v = raw.slice(i + 1).trim();
        // OM35: an EMPTY value in .env.local outranks a real one in .env and is
        // how local dev silently talked to placeholder.supabase.co for months.
        if (k && v) process.env[k] = v;
    }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(url, key);

async function main() {
    const { data, error } = await supabase
        .from("recipes")
        .select("title, ingredients")
        .not("ingredients", "is", null);
    if (error) throw error;

    let total = 0;
    let withQty = 0;
    let withUnit = 0;
    const misses: string[] = [];
    const unitTally = new Map<string, number>();

    for (const r of data ?? []) {
        for (const raw of (r.ingredients as string).split("\n")) {
            const line = raw.trim();
            if (!line) continue;
            total++;
            const p = parseIngredient(line);
            if (p.qty !== null) withQty++; else misses.push(`${r.title?.trim()} :: ${line}`);
            if (p.unit) {
                withUnit++;
                unitTally.set(p.unit, (unitTally.get(p.unit) ?? 0) + 1);
            }
        }
    }

    const pct = (n: number) => `${((n / total) * 100).toFixed(1)}%`;
    console.log(`\ningredient lines:        ${total}`);
    console.log(`with a usable quantity:  ${withQty}  (${pct(withQty)})   <- the number the plan gates on`);
    console.log(`with a recognised unit:  ${withUnit}  (${pct(withUnit)})`);
    console.log(`no quantity (kept raw):  ${misses.length}  (${pct(misses.length)})`);
    console.log(`\nunits seen: ${[...unitTally.entries()].sort((a, b) => b[1] - a[1]).map(([u, n]) => `${u}×${n}`).join("  ")}`);

    if (process.argv.includes("--misses")) {
        console.log(`\n── every line without a quantity ──`);
        for (const m of misses) console.log("  " + m);
    } else {
        console.log(`\nsample of unparsed lines:`);
        for (const m of misses.slice(0, 25)) console.log("  " + m);
    }
}

main();
