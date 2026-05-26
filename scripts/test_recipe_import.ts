// OM10 — smoke test for the recipe-import parser. Run with:
//   npx tsx scripts/test_recipe_import.ts
// Exits non-zero on the first failure.

import { parseRecipeHtml } from "../src/lib/recipeImport";

let failures = 0;
function check(label: string, ok: boolean, got?: unknown) {
    if (ok) {
        console.log(`  ✓ ${label}`);
    } else {
        failures++;
        console.error(`  ✗ ${label}`);
        if (got !== undefined) console.error(`    got: ${JSON.stringify(got)}`);
    }
}

console.log("\n[1] JSON-LD Recipe at root:");
const jsonLdSimple = `<html><head>
    <script type="application/ld+json">
    {
        "@context": "https://schema.org",
        "@type": "Recipe",
        "name": "Spicy Rigatoni",
        "image": "https://example.com/rigatoni.jpg",
        "recipeYield": "4 servings",
        "recipeIngredient": ["1 lb rigatoni", "1 jar vodka sauce", "1 tsp red pepper flakes"],
        "recipeInstructions": [
            {"@type":"HowToStep","text":"Boil pasta"},
            {"@type":"HowToStep","text":"Heat sauce"},
            {"@type":"HowToStep","text":"Combine and serve"}
        ]
    }
    </script>
</head><body>page</body></html>`;
{
    const r = parseRecipeHtml(jsonLdSimple, "https://example.com/r");
    check("source detected as json-ld", r.source === "json-ld", r.source);
    check("title", r.title === "Spicy Rigatoni", r.title);
    check("image_url", r.image_url === "https://example.com/rigatoni.jpg", r.image_url);
    check("servings", r.servings === 4, r.servings);
    check("3 ingredients", r.ingredients?.length === 3, r.ingredients);
    check("3 instructions (HowToStep unwrapped)", r.instructions?.length === 3, r.instructions);
    check("first instruction text", r.instructions?.[0] === "Boil pasta", r.instructions?.[0]);
}

console.log("\n[2] JSON-LD Recipe nested inside @graph (NYT-style):");
const jsonLdGraph = `<html><head>
    <script type="application/ld+json">
    {
        "@context": "https://schema.org",
        "@graph": [
            {"@type": "WebPage", "name": "page"},
            {
                "@type": "Recipe",
                "name": "Carbonara",
                "image": [{"@type":"ImageObject","url":"https://i.cdn/c.jpg"}],
                "recipeYield": ["6"],
                "recipeIngredient": ["spaghetti", "guanciale", "eggs"],
                "recipeInstructions": "Cook the pasta\\nFry the guanciale\\nMix with eggs"
            }
        ]
    }
    </script>
</head></html>`;
{
    const r = parseRecipeHtml(jsonLdGraph, "https://nyt.example/c");
    check("found Recipe inside @graph", r.title === "Carbonara", r.title);
    check("image unwrapped from ImageObject", r.image_url === "https://i.cdn/c.jpg", r.image_url);
    check("yield from string array", r.servings === 6, r.servings);
    check("instructions split on newlines", r.instructions?.length === 3, r.instructions);
}

console.log("\n[3] OpenGraph fallback when JSON-LD absent:");
const ogOnly = `<html><head>
    <title>Old Blog Title</title>
    <meta property="og:title" content="Lemon Tart">
    <meta property="og:image" content="https://blog.example/lt.jpg">
</head><body>recipe text here…</body></html>`;
{
    const r = parseRecipeHtml(ogOnly, "https://blog.example/lt");
    check("source detected as open-graph", r.source === "open-graph", r.source);
    check("title from og:title", r.title === "Lemon Tart", r.title);
    check("image from og:image", r.image_url === "https://blog.example/lt.jpg", r.image_url);
    check("ingredients null (OG can't supply them)", r.ingredients === null, r.ingredients);
}

console.log("\n[4] Mixed: JSON-LD partial + OG fills image:");
const mixed = `<html><head>
    <meta property="og:image" content="https://og.example/x.jpg">
    <script type="application/ld+json">
    {"@type":"Recipe","name":"Stew","recipeIngredient":["beef","onion"]}
    </script>
</head></html>`;
{
    const r = parseRecipeHtml(mixed, "https://m.example/s");
    check("source mixed", r.source === "mixed", r.source);
    check("title from JSON-LD", r.title === "Stew", r.title);
    check("image from OG (JSON-LD lacked it)", r.image_url === "https://og.example/x.jpg", r.image_url);
    check("ingredients preserved from JSON-LD", r.ingredients?.length === 2, r.ingredients);
}

console.log("\n[5] Malformed JSON-LD (trailing comma) — soft recovery:");
const broken = `<html><head>
    <script type="application/ld+json">
    {"@type":"Recipe","name":"Soup","recipeIngredient":["water","salt",]}
    </script>
</head></html>`;
{
    const r = parseRecipeHtml(broken, "https://b.example/s");
    check("recovered title despite trailing comma", r.title === "Soup", r.title);
}

console.log("\n[6] No useful metadata at all:");
const empty = `<html><body><p>just paragraphs</p></body></html>`;
{
    const r = parseRecipeHtml(empty, "https://e.example/x");
    check("source = none", r.source === "none", r.source);
    check("title null", r.title === null, r.title);
    check("ingredients null", r.ingredients === null, r.ingredients);
}

console.log("");
if (failures > 0) {
    console.error(`\n❌ ${failures} parser assertion(s) failed.`);
    process.exit(1);
}
console.log(`✅ All parser checks passed.`);
