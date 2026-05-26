// OM12 smoke test — verify the canonicaliser matches §9 test plan expectations.
// Run via `npm run test:canonicalise` (or `npx tsx scripts/test_canonicalise.ts`).

import { canonicaliseIngredient, ingredientsMatch } from "../src/lib/ingredients";

interface Case { input: string; expected: string; }

const CASES: Case[] = [
  { input: "onion",                       expected: "onion" },
  { input: "garlic",                      expected: "garlic" },
  { input: "tomato",                      expected: "tomato" },
  { input: "tomatoes",                    expected: "tomato" },
  { input: "2 ripe Roma tomatoes, diced", expected: "roma tomato" },
  { input: "1 onion, diced",              expected: "onion" },
  { input: "1/2 tsp salt",                expected: "salt" },
  { input: "Black pepper",                expected: "pepper" },
  { input: "200g chopped tomatoes",       expected: "tomato" },
  { input: "Red Onion",                   expected: "onion" },
  { input: "2 cloves garlic, minced",     expected: "garlic" },
  { input: "olive oil",                   expected: "olive oil" },
  { input: "chicken breasts",             expected: "chicken" },
  { input: "Chicken stock (low sodium)",  expected: "chicken stock" },
  { input: "1 cup of plain flour",        expected: "flour" },
  { input: "spring onions",               expected: "spring onion" },
];

let pass = 0, fail = 0;
for (const c of CASES) {
  const got = canonicaliseIngredient(c.input);
  const ok = got === c.expected;
  if (ok) pass++; else fail++;
  console.log(`${ok ? "OK" : "FAIL"}  ${JSON.stringify(c.input)} → ${JSON.stringify(got)}  ${ok ? "" : `(expected ${JSON.stringify(c.expected)})`}`);
}

console.log(`\n${pass} pass · ${fail} fail`);

// Match-set sanity (recipe ingredient string vs pantry strings)
const recipe = "1 large onion, diced\n2 cloves garlic\n400g chopped tomatoes\n200g chicken breast";
const pantry = ["onion", "garlic", "tomatoes", "chicken thigh"];
const recipeKeys = recipe.split("\n").map(canonicaliseIngredient);
const pantryKeys = new Set(pantry.map(canonicaliseIngredient));
console.log("\nRecipe keys:", recipeKeys);
console.log("Pantry keys:", [...pantryKeys]);
const covered = recipeKeys.filter((k) => pantryKeys.has(k));
console.log(`Cookable? ${covered.length === recipeKeys.length ? "YES" : `NO (covered ${covered.length}/${recipeKeys.length}: ${covered.join(", ")})`}`);
console.log("ingredientsMatch('Red Onion', '1 onion, diced'):", ingredientsMatch("Red Onion", "1 onion, diced"));

process.exit(fail === 0 ? 0 : 1);
