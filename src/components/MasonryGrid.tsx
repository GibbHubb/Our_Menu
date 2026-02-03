import { Recipe } from "@/lib/types";
import RecipeCard from "./RecipeCard";
import { motion, AnimatePresence } from "framer-motion";
import { Database, AlertCircle } from "lucide-react";

interface MasonryGridProps {
    recipes: Recipe[];
    onSeed?: () => void;
    error?: string | null;
}

export default function MasonryGrid({ recipes, onSeed, error }: MasonryGridProps) {
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
        );
    }

    return (
        <div className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-4 px-4 pb-20 space-y-4">
            <AnimatePresence>
                {recipes.map((recipe) => (
                    <RecipeCard key={recipe.id} recipe={recipe} />
                ))}
            </AnimatePresence>
        </div>
    );
}
