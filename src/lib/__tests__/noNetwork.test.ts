// OM54 review — prove the no-network stub fires, rather than assume it.
import { it, expect } from 'vitest';
import { supabase } from '@/lib/supabaseClient';
import { CONTROLS_INVERTED } from './control';

it('fetch throws inside the unit suite', async () => {
    await expect(fetch('https://example.test/')).rejects.toThrow(/network call attempted/);
});

it('CONTROL: a supabase-js query cannot reach the network', async () => {
    const { error } = await supabase.from('recipes').select('id').limit(1);
    // supabase-js turns the thrown fetch into an `error`; inverted, we claim it
    // succeeded, which must go red.
    if (CONTROLS_INVERTED) expect(error).toBeNull();
    else expect(String(error?.message)).toMatch(/network call attempted/);
});
