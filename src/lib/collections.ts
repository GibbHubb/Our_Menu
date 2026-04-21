import { supabase } from './supabaseClient';

export interface Collection {
    id: string;
    name: string;
    created_at: string;
}

export async function getCollections(): Promise<Collection[]> {
    const { data, error } = await supabase
        .from('recipe_collections')
        .select('*')
        .order('name', { ascending: true });
    if (error) { console.error('Error fetching collections:', error); return []; }
    return data as Collection[];
}

export async function createCollection(name: string): Promise<Collection | null> {
    const { data, error } = await supabase
        .from('recipe_collections')
        .insert({ name })
        .select()
        .single();
    if (error) { console.error('Error creating collection:', error); return null; }
    return data as Collection;
}

export async function renameCollection(id: string, name: string): Promise<boolean> {
    const { error } = await supabase
        .from('recipe_collections')
        .update({ name })
        .eq('id', id);
    if (error) { console.error('Error renaming collection:', error); return false; }
    return true;
}

export async function deleteCollection(id: string): Promise<boolean> {
    const { error } = await supabase
        .from('recipe_collections')
        .delete()
        .eq('id', id);
    if (error) { console.error('Error deleting collection:', error); return false; }
    return true;
}

export async function addRecipeToCollection(collectionId: string, recipeId: string): Promise<boolean> {
    const { error } = await supabase
        .from('recipe_collection_items')
        .insert({ collection_id: collectionId, recipe_id: recipeId });
    if (error && error.code !== '23505') { // ignore duplicate key
        console.error('Error adding recipe to collection:', error);
        return false;
    }
    return true;
}

export async function removeRecipeFromCollection(collectionId: string, recipeId: string): Promise<boolean> {
    const { error } = await supabase
        .from('recipe_collection_items')
        .delete()
        .eq('collection_id', collectionId)
        .eq('recipe_id', recipeId);
    if (error) { console.error('Error removing recipe from collection:', error); return false; }
    return true;
}

/** Get the map of collection_id -> Set<recipe_id> for all collections. */
export async function getCollectionMemberships(): Promise<Record<string, Set<string>>> {
    const { data, error } = await supabase.from('recipe_collection_items').select('collection_id, recipe_id');
    if (error || !data) return {};
    const map: Record<string, Set<string>> = {};
    for (const row of data) {
        if (!map[row.collection_id]) map[row.collection_id] = new Set();
        map[row.collection_id].add(row.recipe_id);
    }
    return map;
}

/** Get the set of collection IDs a recipe belongs to. */
export async function getRecipeCollections(recipeId: string): Promise<string[]> {
    const { data, error } = await supabase
        .from('recipe_collection_items')
        .select('collection_id')
        .eq('recipe_id', recipeId);
    if (error || !data) return [];
    return data.map((r) => r.collection_id);
}
