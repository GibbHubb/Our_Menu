import React, { useState } from "react";
import { Recipe } from "@/lib/types";
import { Link2 } from "lucide-react";
import { motion } from "framer-motion";

interface RecipeCardProps {
    recipe: Recipe;
}

export default function RecipeCard({ recipe }: RecipeCardProps) {
    // Simple deterministic color seed based on category for placeholder
    const getCategoryColor = (cat: string) => {
        switch (cat) {
            case "Want to Cook": return "bg-orange-100 text-orange-800";
            case "Mains": return "bg-emerald-100 text-emerald-800";
            case "Sweets": return "bg-rose-100 text-rose-800";
            case "Breakfast": return "bg-amber-100 text-amber-800";
            case "Soup": return "bg-stone-200 text-stone-800";
            default: return "bg-slate-100 text-slate-800";
        }
    };

    const [imgError, setImgError] = useState(false);


    const handleClick = () => {
        if (recipe.link) {
            window.open(recipe.link, "_blank", "noopener,noreferrer");
        }
    };

    return (
        <motion.div
            layout
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.2 }}
            onClick={handleClick}
            className={`group relative bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all border border-stone-100 flex flex-col break-inside-avoid mb-4 ${recipe.link ? 'cursor-pointer' : ''}`}
        >
            {/* Image Area */}
            <div className="aspect-[4/3] bg-stone-100 relative overflow-hidden">
                {recipe.image_url && !imgError ? (
                    <img
                        src={recipe.image_url}
                        alt={recipe.title}
                        onError={() => setImgError(true)}
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                        loading="lazy"
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center bg-stone-100">
                        <span className="text-3xl opacity-20 filter grayscale">🍽️</span>
                    </div>
                )}

                {/* Category Tag Overlay */}
                <div className="absolute top-3 left-3">
                    <span className={`px-2 py-1 rounded-md text-xs font-bold uppercase tracking-wider ${getCategoryColor(recipe.category)} shadow-sm`}>
                        {recipe.category}
                    </span>
                </div>

                {/* Link Indicator */}
                {recipe.link && (
                    <div className="absolute top-3 right-3 bg-white/90 backdrop-blur-sm p-1.5 rounded-full shadow-sm opacity-0 group-hover:opacity-100 transition-opacity">
                        <Link2 className="w-3 h-3 text-stone-900" />
                    </div>
                )}
            </div>

            {/* Content */}
            <div className="p-4 flex flex-col gap-2">
                <h3 className="font-serif text-lg leading-tight text-stone-900 group-hover:text-amber-700 transition-colors">
                    {recipe.title}
                </h3>
            </div>
        </motion.div>
    );
}
