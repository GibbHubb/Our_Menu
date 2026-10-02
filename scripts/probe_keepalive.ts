// OM65 — the keepalive probe must go red for a missing table.
// ⚠️ PROBE, NOT A TEST (OM54): read-only selects against LIVE Supabase with the anon key.
// Not part of `npm test`. Run: npm run probe:keepalive
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) { console.error('Supabase env vars missing'); process.exit(2); }
const sb = createClient(url, key, { auth: { persistSession: false } });

const probe = (t: string) => sb.from(t).select('id').limit(1); // same shape as keepalive/route.ts

(async () => {
    const good = await probe('recipes');
    const bad = await probe('this_table_does_not_exist_om65');
    const blind = await sb.from('this_table_does_not_exist_om65').select('id', { count: 'exact', head: true });
    const checks: [string, boolean][] = [
        ['real table passes', !good.error],
        ['missing table fails (PGRST205)', bad.error?.code === 'PGRST205'],
        ['(documents the bug) HEAD probe is blind to the missing table', blind.error === null],
    ];
    let fail = 0;
    for (const [n, ok] of checks) { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}`); if (!ok) fail++; }
    process.exit(fail ? 1 : 0);
})();
