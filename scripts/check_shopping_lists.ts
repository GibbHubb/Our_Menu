
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

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
        }
    } catch (e) { console.warn("Could not load .env file", e); }
}
loadEnv();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) { process.exit(1); }

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
    const { data: recipes, error } = await supabase
        .from('recipes')
        .select('id, title, shopping_list, link');

    if (error) {
        console.error("Error fetching recipes:", error);
        return;
    }

    const total = recipes.length;
    const withList = recipes.filter(r => r.shopping_list && r.shopping_list.trim().length > 0).length;
    const withoutList = total - withList;

    console.log(`Total Recipes: ${total}`);
    console.log(`With Shopping List: ${withList}`);
    console.log(`Without Shopping List: ${withoutList}`);

    if (withoutList > 0) {
        console.log("\nSample missing:");
        recipes.filter(r => !r.shopping_list).slice(0, 5).forEach(r => {
            console.log(`- ${r.title} (${r.link ? 'Has Link' : 'No Link'})`);
        });
    }
}

main();
