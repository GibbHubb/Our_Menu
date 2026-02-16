
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// --- Environment Variable Loading ---
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
    } catch (e) {
        console.warn("Could not load .env file", e);
    }
}
loadEnv();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase credentials");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
    console.log("Testing Add Recipe...");

    const testRecipe = {
        title: "Test Recipe " + Date.now(),
        category: ["Mains", "Pasta"], // Testing array
        link: "https://example.com",
        image_url: "https://example.com/image.jpg"
    };

    const { data, error } = await supabase.from("recipes").insert([testRecipe]).select();

    if (error) {
        console.error("❌ Error adding recipe:", error);
        console.error("Details:", error.details);
        console.error("Hint:", error.hint);
        console.error("Message:", error.message);
    } else {
        console.log("✅ Successfully added recipe:", data);

        // Clean up
        await supabase.from("recipes").delete().eq("id", data[0].id);
        console.log("Cleaned up test recipe.");
    }
}

main();
