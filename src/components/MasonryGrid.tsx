import { Recipe } from "@/lib/types";
import RecipeCard from "./RecipeCard";
import { motion, AnimatePresence } from "framer-motion";
import { Database, AlertCircle, Trash2 } from "lucide-react";

interface MasonryGridProps {
    recipes: Recipe[];
    onSeed?: () => void;
    onReset?: () => void;
    onEdit?: (recipe: Recipe) => void;
    onClick?: (recipe: Recipe) => void;
    error?: string | null;
}

export default function MasonryGrid({ recipes, onSeed, onReset, onEdit, onClick, error }: MasonryGridProps) {
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
                    {onReset && (
                        <button
                            onClick={onReset}
                            className="px-8 py-3 bg-red-50 text-red-600 rounded-full font-medium hover:bg-red-100 transition-transform active:scale-95 flex items-center gap-2 border border-red-200"
                        >
                            <Trash2 className="w-4 h-4" />
                            Reset Database
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
                        <RecipeCard key={recipe.id} recipe={recipe} onEdit={onEdit} onClick={onClick} />
                    ))}
                </AnimatePresence>
            </div>

            {/* Footer / Reset Area */}
            <div className="flex flex-col items-center gap-4 pb-12 pt-4 border-t border-stone-100 mt-10">
                <p className="text-stone-400 text-sm italic">Max & Bron's Digital Menu</p>
                {onReset && (
                    <button
                        onClick={onReset}
                        className="flex items-center gap-2 text-xs font-semibold text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 px-4 py-2 rounded-full border border-red-100 transition-colors shadow-sm"
                    >
                        <Trash2 className="w-3 h-3" />
                        Clean Slate (Delete All Recipes)
                    </button>
                )}
            </div>
        </div>
    );
}
