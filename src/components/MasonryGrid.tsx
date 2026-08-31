import { Recipe } from "@/lib/types";
import RecipeCard from "./RecipeCard";
import { motion, AnimatePresence } from "framer-motion";
import { Database, AlertCircle, LogIn, FilterX } from "lucide-react";
import Link from "next/link";

interface MasonryGridProps {
    recipes: Recipe[];
    onSeed?: () => void;
    onEdit?: (recipe: Recipe) => void;
    onClick?: (recipe: Recipe) => void;
    error?: string | null;
    /** OM12 — set of recipe ids whose ingredients are fully in the pantry. */
    /**
     * OM38 — there is no Supabase session. Every recipe is household-scoped and
     * RLS returns nothing to anon, so an empty grid means "signed out", not
     * "empty kitchen". Say that instead, and never offer the seed button: the
     * insert would create a second, orphaned copy of the initial menu.
     */
    signedOut?: boolean;
    /**
     * OM39 — how many recipes exist BEFORE filtering. An empty grid with a
     * non-empty kitchen means the filters excluded everything, which is a very
     * different message — and must never offer the seed button. Bron hit the
     * "Kitchen is Empty" state by ticking two filter chips and seeded 82
     * duplicate recipes from it.
     */
    totalCount?: number;
    /** OM39 — clears every active filter; shown with the no-matches state. */
    onClearFilters?: () => void;
}

export default function MasonryGrid({ recipes, onSeed, onEdit, onClick, error, signedOut, totalCount, onClearFilters }: MasonryGridProps) {
    if (error) {
        return (
            <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
                <div className="bg-red-50 text-red-600 p-4 rounded-full mb-4">
                    <AlertCircle className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-serif text-stone-900 mb-2">Connection Error</h3>
                <p className="text-stone-500 max-w-md mb-6">{error}</p>
                <div className="text-sm bg-stone-100 p-4 rounded-lg text-left font-mono text-stone-600">
                    Check your .env.local or Vercel Environment Variables.<br />
                    Ensure NEXT_PUBLIC_SUPABASE_URL and KEY are correct.
                </div>
            </div>
        );
    }

    if (recipes.length === 0 && signedOut) {
        return (
            <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
                <div className="bg-stone-100 p-6 rounded-full mb-6">
                    <span className="text-4xl">🔒</span>
                </div>
                <h3 className="text-2xl font-serif text-stone-900 mb-2">Sign in to see your menu</h3>
                <p className="text-stone-500 max-w-md mb-8">
                    Your recipes are still there — they&apos;re private to your household, so we
                    need to know who you are before we can show them.
                </p>

                <Link
                    href="/login"
                    className="px-8 py-3 bg-stone-900 text-white rounded-full font-medium hover:bg-stone-800 transition-transform active:scale-95 flex items-center gap-2 shadow-lg"
                >
                    <LogIn className="w-4 h-4" />
                    Sign in
                </Link>
            </div>
        );
    }

    // OM39 — filters excluded everything, but the kitchen is full. Say so, and
    // offer the way out rather than a button that duplicates the whole menu.
    if (recipes.length === 0 && (totalCount ?? 0) > 0) {
        return (
            <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
                <div className="bg-stone-100 p-6 rounded-full mb-6">
                    <span className="text-4xl">🔍</span>
                </div>
                <h3 className="text-2xl font-serif text-stone-900 mb-2">Nothing matches those filters</h3>
                <p className="text-stone-500 max-w-md mb-8">
                    You have {totalCount} recipes — none of them fit this combination.
                    Diet and season chips only match recipes that have been tagged.
                </p>
                {onClearFilters && (
                    <button
                        onClick={onClearFilters}
                        className="px-8 py-3 bg-stone-900 text-white rounded-full font-medium hover:bg-stone-800 transition-transform active:scale-95 flex items-center gap-2 shadow-lg"
                    >
                        <FilterX className="w-4 h-4" />
                        Clear filters
                    </button>
                )}
            </div>
        );
    }

    if (recipes.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
                <div className="bg-stone-100 p-6 rounded-full mb-6">
                    <span className="text-4xl">🧑‍🍳</span>
                </div>
                <h3 className="text-2xl font-serif text-stone-900 mb-2">The Kitchen is Empty!</h3>
                <p className="text-stone-500 max-w-md mb-8">
                    Your menu is currently empty. Would you like to load the initial list of Max & Bron's favorites?
                </p>

                <div className="flex flex-col sm:flex-row gap-4">
                    {onSeed && (
                        <button
                            onClick={onSeed}
                            className="px-8 py-3 bg-stone-900 text-white rounded-full font-medium hover:bg-stone-800 transition-transform active:scale-95 flex items-center gap-2 shadow-lg"
                        >
                            <Database className="w-4 h-4" />
                            Load Initial Menu
                        </button>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div>
            <div className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-4 px-4 pb-20">
                <AnimatePresence>
                    {recipes.map((recipe) => (
                        <RecipeCard
                            key={recipe.id}
                            recipe={recipe}
                            onEdit={onEdit}
                            onClick={onClick}
                        />
                    ))}
                </AnimatePresence>
            </div>

            {/* Footer */}
            <div className="flex flex-col items-center gap-4 pb-12 pt-4 border-t border-stone-100 mt-10">
                <p className="text-stone-400 text-sm italic">Max & Bron's Digital Menu</p>
            </div>
        </div>
    );
}
