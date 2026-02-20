import React, { useState } from "react";
import { Recipe } from "@/lib/types";
import { Link2, Pencil } from "lucide-react";
import { motion } from "framer-motion";
import Link from "next/link";

interface RecipeCardProps {
    recipe: Recipe;
    onEdit?: (recipe: Recipe) => void;
    onClick?: (recipe: Recipe) => void; // Kept for type compatibility but unused if we use Link
}

export default function RecipeCard({ recipe, onEdit }: RecipeCardProps) {
    // Simple deterministic color seed based on category for placeholder
    const getCategoryColor = (cat: string) => {
        switch (cat) {
            case "Want to Cook": return "bg-orange-100 text-orange-800";
            case "Mains": return "bg-emerald-100 text-emerald-800";
            case "Sweets": return "bg-rose-100 text-rose-800";
            case "Breakfast": return "bg-amber-100 text-amber-800";
            case "Soup": return "bg-stone-200 text-stone-800";
            case "Midweek": return "bg-indigo-100 text-indigo-800";
            case "Cheap and Healthy": return "bg-lime-100 text-lime-800";
            case "Salad": return "bg-green-100 text-green-800";
            case "Pasta": return "bg-yellow-100 text-yellow-800";
            case "Winter Warmer": return "bg-blue-100 text-blue-800";
            default: return "bg-slate-100 text-slate-800";
        }
    };

    const [imgError, setImgError] = useState(false);

    // Using Link instead of onClick handler for better navigation/UX
    return (
        <motion.div
            layout
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.2 }}
            className="break-inside-avoid mb-4 inline-block w-full"
            style={{ transform: "translateZ(0)" }}
        >
            <Link
                href={`/recipe/${recipe.id}`}
                className="group relative bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all border border-stone-100 flex flex-col block"
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
                    <div className="absolute top-3 left-3 flex flex-wrap gap-1 max-w-[80%]">
                        {recipe.category.map((cat) => (
                            <span key={cat} className={`px-2 py-1 rounded-md text-xs font-bold uppercase tracking-wider ${getCategoryColor(cat)} shadow-sm`}>
                                {cat}
                            </span>
                        ))}
                    </div>

                    <div className="absolute top-3 right-3 flex gap-2">
                        {/* Edit Button - Needs preventDefault to not trigger header link */}
                        {onEdit && (
                            <button
                                onClick={(e) => {
                                    e.preventDefault(); // Stop Link navigation
                                    e.stopPropagation();
                                    onEdit(recipe);
                                }}
                                className="bg-white/90 backdrop-blur-sm p-1.5 rounded-full shadow-sm opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white hover:text-amber-600 z-10"
                                title="Edit Recipe"
                            >
                                <Pencil className="w-3 h-3" />
                            </button>
                        )}

                        {/* Link Indicator */}
                        {recipe.link && (
                            <div className="bg-white/90 backdrop-blur-sm p-1.5 rounded-full shadow-sm opacity-0 group-hover:opacity-100 transition-opacity">
                                <Link2 className="w-3 h-3 text-stone-900" />
                            </div>
                        )}
                    </div>
                </div>

                {/* Content */}
                <div className="p-4 flex flex-col gap-2">
                    <h3 className="font-serif text-lg leading-tight text-stone-900 group-hover:text-amber-700 transition-colors">
                        {recipe.title}
                    </h3>
                </div>
            </Link>
        </motion.div>
    );
}
