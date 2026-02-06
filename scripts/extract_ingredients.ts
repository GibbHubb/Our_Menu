
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// --- Environment Variable Loading ---
// Simple .env parser to avoid adding 'dotenv' dependency
function loadEnv() {
    try {
        const envPath = path.resolve(process.cwd(), '.env');
        if (fs.existsSync(envPath)) {
            const envConfig = fs.readFileSync(envPath, 'utf-8');
            envConfig.split('\n').forEach((line) => {
                const parts = line.split('=');
                if (parts.length >= 2) {
                    const key = parts[0].trim();
                    const value = parts.slice(1).join('=').trim();
                    if (key && value && !process.env[key]) {
                        process.env[key] = value;
                    }
                }
            });
            console.log("Loaded .env file");
        }
    } catch (e) {
        console.warn("Could not load .env file", e);
    }
}

loadEnv();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase credentials in .env file");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// --- Types ---

interface Recipe {
    id: string;
    title: string;
    link: string;
    shopping_list: string | null;
}

// --- Main Logic ---

async function fetchAndParseRecipe(url: string): Promise<string[] | null> {
    try {
        console.log(`Fetching ${url}...`);
        const response = await fetch(url);
        if (!response.ok) {
            console.error(`Failed to fetch ${url}: ${response.statusText}`);
            return null;
        }
        const html = await response.text();

        // Extract JSON-LD
        // Simple regex to find <script type="application/ld+json">...</script>
        const jsonLdRegex = /<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/gi;
        let match;

        while ((match = jsonLdRegex.exec(html)) !== null) {
            try {
                const jsonContent = match[1];
                const data = JSON.parse(jsonContent);

                // Helper to find Recipe object in potentially nested structure
                const findRecipe = (obj: any): any => {
                    if (!obj) return null;
                    if (Array.isArray(obj)) {
                        for (const item of obj) {
                            const found = findRecipe(item);
                            if (found) return found;
                        }
                    } else if (typeof obj === 'object') {
                        if (obj['@type'] === 'Recipe' || (Array.isArray(obj['@type']) && obj['@type'].includes('Recipe'))) {
                            return obj;
                        }
                        // Check explicit @graph
                        if (obj['@graph']) {
                            return findRecipe(obj['@graph']);
                        }
                        // Shallow search in properties just in case, though usually it's top level or in graph
                        for (const key in obj) {
                            if (typeof obj[key] === 'object') {
                                // Recursive might be too deep, but let's try shallow graph traverse or specific keys
                            }
                        }
                    }
                    return null;
                };

                const recipeData = findRecipe(data);

                if (recipeData && recipeData.recipeIngredient) {
                    let ingredients = recipeData.recipeIngredient;
                    if (typeof ingredients === 'string') {
                        ingredients = [ingredients];
                    }
                    if (Array.isArray(ingredients)) {
                        return ingredients.map((i: any) => i.toString().trim());
                    }
                }
            } catch (jsonError) {
                console.warn("Failed to parse a JSON-LD block", jsonError);
            }
        }

        console.log("No JSON-LD Recipe with recipeIngredient found.");
        return null;

    } catch (error) {
        console.error(`Error processing ${url}:`, error);
        return null;
    }
}

async function main() {
    console.log("Starting grocery list extraction...");

    // 1. Get recipes with links but no shopping list
    // Note: Checking for null or empty string
    const { data: recipes, error } = await supabase
        .from('recipes')
        .select('id, title, link, shopping_list')
        .not('link', 'is', null)
        .neq('link', '');

    if (error) {
        console.error("Error fetching recipes:", error);
        return;
    }

    const recipesToProcess = recipes.filter(r => !r.shopping_list || r.shopping_list.trim() === '');

    console.log(`Found ${recipesToProcess.length} recipes to process out of ${recipes.length} total.`);

    for (const recipe of recipesToProcess) {
        if (!recipe.link) continue;

        console.log(`Processing "${recipe.title}" (${recipe.link})`);
        const ingredients = await fetchAndParseRecipe(recipe.link);

        if (ingredients && ingredients.length > 0) {
            const shoppingList = ingredients.map(i => `- [ ] ${i}`).join('\n');

            const { error: updateError } = await supabase
                .from('recipes')
                .update({ shopping_list: shoppingList })
                .eq('id', recipe.id);

            if (updateError) {
                console.error(`Failed to update recipe ${recipe.id}:`, updateError);
            } else {
                console.log(`Successfully updated shopping list for "${recipe.title}"`);
            }
        } else {
            console.log(`Could not extract ingredients for "${recipe.title}"`);
        }

        // Polite delay
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log("Done.");
}

main();
