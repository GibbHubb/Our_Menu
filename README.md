# Our Menu

A personal recipe collection and meal planning app built by Max & Bron. Browse, organise, and plan meals from a shared recipe library — with shopping lists, cooking notes, and an AI chat assistant.

## Features

- **Recipe library** — Masonry card grid with category filtering and per-recipe detail view
- **Multi-category tags** — Each recipe can belong to multiple categories (Mains, Midweek, Soup, Sweets, etc.)
- **Add & edit recipes** — Full CRUD: title, category, image URL, external link, ingredients, instructions
- **Cooking notes** — Per-recipe personal notes saved to the database
- **Shopping lists** — Generate and save a shopping list per recipe
- **AI chat assistant** — Built-in chat agent for recipe suggestions and cooking help
- **Decision maker** — Can't decide what to cook? Let the app pick for you
- **Ingredient extractor** — Script to extract and consolidate ingredients across recipes

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth |
| Styling | Tailwind CSS v4 · clsx · tailwind-merge |
| Animation | Framer Motion |
| Icons | Lucide React |
| AI | Claude API (via `/api` route) |

## Getting Started

### 1. Clone & install
```bash
git clone https://github.com/GibbHubb/Our_Menu.git
cd Our_Menu
npm install
```

### 2. Set up environment variables
```bash
cp .env.local.example .env.local
```
Fill in your Supabase project URL and anon key:
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 3. Set up the database
Run the schema in your Supabase SQL editor:
```bash
# Initial schema
supabase_schema.sql

# Migrations (if upgrading)
add_shopping_list_migration.sql
migration_multiple_categories.sql
```

### 4. Run the dev server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000).

## Project Structure

```
src/
├── app/
│   ├── api/            # API routes (AI chat)
│   ├── recipe/         # Recipe detail pages
│   ├── layout.tsx
│   └── page.tsx        # Main recipe grid
├── components/
│   ├── AIChat.tsx          # AI chat panel
│   ├── ChatAgent.tsx       # Chat agent logic
│   ├── DecisionMaker.tsx   # Random meal picker
│   ├── AddRecipeModal.tsx  # Add new recipe form
│   ├── EditRecipeModal.tsx # Edit existing recipe
│   ├── IngredientList.tsx  # Ingredient display
│   ├── MasonryGrid.tsx     # Responsive card grid
│   ├── MenuContainer.tsx   # Main container + state
│   ├── RecipeCard.tsx      # Individual recipe card
│   ├── ShoppingList.tsx    # Shopping list editor
│   └── Header.tsx
└── lib/
    ├── types.ts            # Recipe & Category types
    ├── supabaseClient.ts   # Supabase instance
    ├── recipeUtils.ts      # Shared recipe helpers
    ├── constants.ts
    └── initialData.ts
scripts/
├── extract_ingredients.ts  # Bulk ingredient extractor
└── test_add_recipe.ts
```

## Recipe Categories

`Want to Cook` · `Mains` · `Soup` · `Snacks` · `Breakfast` · `Sweets` · `Midweek` · `Cheap and Healthy` · `Salad` · `Pasta` · `Winter Warmer`

## Scripts

```bash
npm run extract-list   # Extract & consolidate ingredients from all recipes
npm run dev            # Start development server
npm run build          # Production build
npm run lint           # ESLint
```

## Git Workflow

Branches: `main` → `feature/*` / `fix/*`

Commit convention (Conventional Commits):
```
feat(recipes): add multi-category support
fix(shopping-list): persist list on modal close
chore(deps): bump next to 16.1.6
```
