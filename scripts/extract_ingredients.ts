
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import {
    fetchAndParseRecipe,
    ingredientsToShoppingList,
    instructionsToText,
} from '../src/lib/recipeExtractor';

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
// Extraction lifted to src/lib/recipeExtractor.ts so the API route + this
// batch script share one implementation. The legacy in-file helpers below
// are kept temporarily for reference but are no longer called.

// --- LLM Helper (DEPRECATED — kept for reference; main() uses fetchAndParseRecipe) ---

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function _legacyExtractWithLLM(url: string, html: string): Promise<string[] | null> {
    try {
        console.log(` Attempting LLM extraction for ${url}...`);

        // Naive clean up: remove scripts, styles, comments to reduce token count
        const textContent = html
            .replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gim, "")
            .replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gim, "")
            .replace(/<!--([\s\S]*?)-->/gim, "")
            .replace(/<[^>]+>/g, "\n") // strip tags
            .replace(/\n\s*\n/g, "\n") // collapse newlines
            .slice(0, 15000); // Limit to ~15k chars to be safe for typical context windows

        const prompt = `
You are a grocery list extractor.
I will give you the text content of a recipe webpage.
Your task is to extract the list of ingredients/shopping list.
Return ONLY the ingredients as a JSON array of strings.
Do not include any conversational text.
Example response: ["1 onion", "500g beef", "Salt"]

Webpage URL: ${url}
Content:
${textContent}
`;

        // Auto-detect model if possible, or use a default
        let modelName = "meta-llama/Meta-Llama-3-8B-Instruct";
        try {
            const modelRes = await fetch("http://192.168.2.182:8003/v1/models");
            if (modelRes.ok) {
                const modelData = await modelRes.json();
                if (modelData.data && modelData.data.length > 0) {
                    modelName = modelData.data[0].id;
                    console.log(`Using detected model: ${modelName}`);
                }
            }
        } catch (e) {
            console.warn("Could not auto-detect model, using default.");
        }

        // Use standard OpenAI-compatible endpoint
        const response = await fetch("http://192.168.2.182:8003/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: modelName,
                messages: [
                    { role: "system", content: "You are a grocery list extractor. Return ONLY a JSON array of ingredients." },
                    { role: "user", content: prompt }
                ],
                temperature: 0.1,
                max_tokens: 1000
            })
        });

        if (!response.ok) {
            console.warn(`LLM request failed: ${response.status} ${response.statusText}`);
            return null;
        }

        const json = await response.json();
        const content = json.choices?.[0]?.message?.content;

        if (!content) return null;

        // Try to parse JSON from content (it might be wrapped in markdown code blocks)
        const jsonMatch = content.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }

        // Fallback for non-json response (bullet points)
        return content.split('\n').filter((l: string) => l.trim().startsWith('-')).map((l: string) => l.replace(/^[-\s*]+/, '').trim());

    } catch (e) {
        console.error("LLM extraction error:", e);
        return null;
    }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function _legacyFetchAndParseRecipe(url: string, title: string): Promise<{ ingredients: string[], categories: string[] } | null> {
    try {
        console.log(`Fetching ${url}...`);
        const response = await fetch(url);
        if (!response.ok) {
            console.error(`Failed to fetch ${url}: ${response.statusText}`);
            return null;
        }
        const html = await response.text();
        let extractedIngredients: string[] | null = null;

        // 1. Try JSON-LD first (fast & accurate)
        const jsonLdRegex = /<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/gi;
        let match;

        while ((match = jsonLdRegex.exec(html)) !== null) {
            try {
                const jsonContent = match[1];
                const data = JSON.parse(jsonContent);

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
                        if (obj['@graph']) return findRecipe(obj['@graph']);
                    }
                    return null;
                };

                const recipeData = findRecipe(data);

                if (recipeData && recipeData.recipeIngredient) {
                    let ingredients = recipeData.recipeIngredient;
                    if (typeof ingredients === 'string') ingredients = [ingredients];
                    if (Array.isArray(ingredients)) {
                        console.log("Found JSON-LD ingredients!");
                        extractedIngredients = ingredients.map((i: any) => i.toString().trim());
                        break; // Stop after finding first valid recipe
                    }
                }
            } catch (jsonError) {
                console.warn("Failed to parse a JSON-LD block", jsonError);
            }
        }

        // 2. Enriched with LLM (for categories AND ingredients if missing)
        // (legacy stub; no longer reachable — kept for reference)
        const ingredients = extractedIngredients || [];
        return { ingredients, categories: [] };

    } catch (error) {
        console.error(`Error processing ${url}:`, error);
        return null;
    }
}

// Main Execution
async function main() {
    console.log("Starting recipe enrichment (Ingredients + Categories)...");

    // Fetch recipes that need processing. 
    // We process ALL recipes that have a link, to update their categories too.
    // Or maybe just ones with missing shopping list OR default 'Mains' category if we want to be smart.
    // For now, let's process ones that haven't been enriched yet.
    // We can assume if shopping_list is populated, we might have skipped it. 
    // BUT the user specifically asked to apply tags. So let's re-process everything with a link.

    // To safe time, maybe checking if category is just ["Mains"] (default) or empty?
    // Let's do ALL to be safe, but maybe limit concurrency.

    const { data: recipes, error } = await supabase
        .from('recipes')
        .select('id, title, link, shopping_list, category')
        .not('link', 'is', null)
        .neq('link', '');

    if (error) {
        console.error("Error fetching recipes:", error);
        return;
    }

    console.log(`Found ${recipes.length} recipes with links.`);

    for (const recipe of recipes) {
        console.log(`Processing "${recipe.title}" (${recipe.link})`);

        const result = await fetchAndParseRecipe(recipe.link);
        const { ingredients, instructions, sourcePath, warnings } = result;

        if (warnings.length) console.warn("  warnings:", warnings.join("; "));

        const updates: Record<string, string> = {};
        if ((!recipe.shopping_list || recipe.shopping_list.length < 10) && ingredients.length) {
            updates.shopping_list = ingredientsToShoppingList(ingredients);
        }
        if (instructions.length) {
            // Only fill if blank — preserve user-edited instructions.
            // (The script doesn't fetch `instructions`/`ingredients` columns so we conservatively
            // skip; if you want overwrite behaviour, add those to the SELECT above.)
        }

        if (Object.keys(updates).length > 0) {
            const { error: updateError } = await supabase
                .from('recipes')
                .update(updates)
                .eq('id', recipe.id);
            if (updateError) console.error(`Failed to update ${recipe.title}:`, updateError);
            else console.log(`✅ Updated "${recipe.title}" (via ${sourcePath})`, Object.keys(updates));
        } else {
            console.log(`No updates needed for "${recipe.title}" (path: ${sourcePath})`);
        }

        // Polite delay
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log("Done.");
}

main();
