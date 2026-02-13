
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

// --- LLM Helper ---

async function extractWithLLM(url: string, html: string): Promise<string[] | null> {
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

        const response = await fetch("http://192.168.2.182:8003/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                // "Authorization": "Bearer not-needed" // vLLM usually doesn't need key if not configured
            },
            body: JSON.stringify({
                model: "meta-llama/Meta-Llama-3-8B-Instruct", // Just a guess/placeholder, usually vLLM ignores or uses loaded model
                messages: [
                    { role: "system", content: "You are a helpful assistant that extracts ingredients from recipes as a JSON array." },
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

async function fetchAndParseRecipe(url: string): Promise<string[] | null> {
    try {
        console.log(`Fetching ${url}...`);
        const response = await fetch(url);
        if (!response.ok) {
            console.error(`Failed to fetch ${url}: ${response.statusText}`);
            return null;
        }
        const html = await response.text();

        // 1. Try JSON-LD first (fast & accurate)
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
                        console.log("Found JSON-LD ingredients!");
                        return ingredients.map((i: any) => i.toString().trim());
                    }
                }
            } catch (jsonError) {
                console.warn("Failed to parse a JSON-LD block", jsonError);
            }
        }

        console.log("No JSON-LD Recipe found. Falling back to LLM...");
        return await extractWithLLM(url, html);

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
