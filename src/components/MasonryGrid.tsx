import { Recipe } from "@/lib/types";
import RecipeCard from "./RecipeCard";
import { motion, AnimatePresence } from "framer-motion";

interface MasonryGridProps {
    recipes: Recipe[];
}

export default function MasonryGrid({ recipes }: MasonryGridProps) {
    if (recipes.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-stone-400">
                <p className="text-lg font-serif italic">No recipes found...</p>
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
