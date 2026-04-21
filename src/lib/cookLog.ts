import { supabase } from './supabaseClient';

export interface CookLogEntry {
    id: string;
    recipe_id: string;
    cooked_at: string;
}

/** Log a "made it" event for a recipe — inserts now() timestamp. */
export async function logCook(recipeId: string): Promise<CookLogEntry | null> {
    const { data, error } = await supabase
        .from('cook_log')
        .insert({ recipe_id: recipeId })
        .select()
        .single();

    if (error) {
        console.error('Error logging cook event:', error);
        return null;
    }
    return data as CookLogEntry;
}

/** Get the most recent cooked_at timestamp per recipe, as a map. */
export async function getLatestCooks(): Promise<Record<string, string>> {
    const { data, error } = await supabase
        .from('cook_log')
        .select('recipe_id, cooked_at')
        .order('cooked_at', { ascending: false });

    if (error || !data) return {};

    const map: Record<string, string> = {};
    for (const row of data) {
        if (!map[row.recipe_id]) {
            map[row.recipe_id] = row.cooked_at;
        }
    }
    return map;
}

/** Get recipe IDs cooked within the last N days. */
export async function getRecentlyCookedIds(daysAgo: number = 3): Promise<string[]> {
    const cutoff = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
        .from('cook_log')
        .select('recipe_id')
        .gte('cooked_at', cutoff);

    if (error || !data) return [];
    return [...new Set(data.map((r) => r.recipe_id))];
}

/** Format the "last cooked" relative time for a recipe. */
export function formatLastCooked(cookedAt: string | undefined): string | null {
    if (!cookedAt) return null;
    const msAgo = Date.now() - new Date(cookedAt).getTime();
    const days = Math.floor(msAgo / (24 * 60 * 60 * 1000));
    if (days === 0) return 'Cooked today';
    if (days === 1) return 'Cooked yesterday';
    if (days < 7) return `Cooked ${days} days ago`;
    if (days < 30) return `Cooked ${Math.floor(days / 7)} weeks ago`;
    return `Cooked ${Math.floor(days / 30)} months ago`;
}
