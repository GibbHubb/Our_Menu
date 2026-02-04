"use client";

import React, { useState, useEffect } from "react";
import { Recipe } from "@/lib/types";
import { X, ExternalLink, ClipboardList, StickyNote, Edit2, Save } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface RecipeDetailModalProps {
    recipe: Recipe | null;
    isOpen: boolean;
    onClose: () => void;
    onUpdate?: (recipe: Recipe) => void;
}

export default function RecipeDetailModal({
    recipe,
    isOpen,
    onClose,
    onUpdate,
}: RecipeDetailModalProps) {
    const [isEditingNotes, setIsEditingNotes] = useState(false);
    const [notes, setNotes] = useState("");
    const [shoppingList, setShoppingList] = useState("");
    const [isEditingShoppingList, setIsEditingShoppingList] = useState(false);

    // Sync state when recipe changes
    useEffect(() => {
        if (recipe) {
            setNotes(recipe.notes || "");
            setShoppingList(recipe.shopping_list || "");
        }
    }, [recipe]);

    if (!isOpen || !recipe) return null;

    const handleSaveNotes = () => {
        if (onUpdate) {
            onUpdate({ ...recipe, notes });
        }
        setIsEditingNotes(false);
    };

    const handleSaveShoppingList = () => {
        if (onUpdate) {
            onUpdate({ ...recipe, shopping_list: shoppingList });
        }
        setIsEditingShoppingList(false);
    };

    const hasExternalLink = !!recipe.link;
    const hasFullRecipe = recipe.ingredients && recipe.ingredients !== "See full recipe at RecipeTin Eats." && recipe.ingredients !== "See full recipe at Maggie Beer." && recipe.ingredients !== "See full recipe at RecipePierce.";

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.2 }}
                    className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col"
                >
                    {/* Header */}
                    <div className="relative">
                        {recipe.image_url && (
                            <div className="aspect-[21/9] bg-stone-100 overflow-hidden">
                                <img
                                    src={recipe.image_url}
                                    alt={recipe.title}
                                    className="w-full h-full object-cover"
                                />
                            </div>
                        )}
                        <button
                            onClick={onClose}
                            className="absolute top-4 right-4 p-2 bg-white/90 backdrop-blur-sm rounded-full shadow-lg hover:bg-white transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Scrollable Content */}
                    <div className="flex-1 overflow-y-auto p-8">
                        {/* Title */}
                        <div className="mb-6">
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <h2 className="text-3xl font-serif font-bold text-stone-900 mb-2">
                                        {recipe.title}
                                    </h2>
                                    <span className="inline-block px-3 py-1 rounded-full text-sm font-semibold bg-amber-100 text-amber-800">
                                        {recipe.category}
                                    </span>
                                </div>
                                {hasExternalLink && (
                                    <a
                                        href={recipe.link}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-2 px-4 py-2 bg-stone-900 text-white rounded-lg hover:bg-stone-800 transition-colors whitespace-nowrap"
                                    >
                                        <ExternalLink className="w-4 h-4" />
                                        View Recipe
                                    </a>
                                )}
                            </div>
                        </div>

                        {/* Recipe Content */}
                        {hasFullRecipe && (
                            <div className="grid md:grid-cols-2 gap-6 mb-8">
                                {/* Ingredients */}
                                <div className="bg-stone-50 rounded-xl p-6">
                                    <h3 className="text-xl font-serif font-bold text-stone-900 mb-4 flex items-center gap-2">
                                        <ClipboardList className="w-5 h-5 text-amber-600" />
                                        Ingredients
                                    </h3>
                                    <div className="whitespace-pre-wrap text-stone-700 leading-relaxed">
                                        {recipe.ingredients}
                                    </div>
                                </div>

                                {/* Instructions */}
                                <div className="bg-stone-50 rounded-xl p-6">
                                    <h3 className="text-xl font-serif font-bold text-stone-900 mb-4">
                                        Instructions
                                    </h3>
                                    <div className="whitespace-pre-wrap text-stone-700 leading-relaxed">
                                        {recipe.instructions}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Shopping List */}
                        <div className="mb-6">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-xl font-serif font-bold text-stone-900 flex items-center gap-2">
                                    <ClipboardList className="w-5 h-5 text-emerald-600" />
                                    Shopping List
                                </h3>
                                {!isEditingShoppingList ? (
                                    <button
                                        onClick={() => setIsEditingShoppingList(true)}
                                        className="text-sm text-stone-600 hover:text-stone-900 flex items-center gap-1"
                                    >
                                        <Edit2 className="w-4 h-4" />
                                        Edit
                                    </button>
                                ) : (
                                    <button
                                        onClick={handleSaveShoppingList}
                                        className="text-sm text-emerald-600 hover:text-emerald-700 flex items-center gap-1 font-semibold"
                                    >
                                        <Save className="w-4 h-4" />
                                        Save
                                    </button>
                                )}
                            </div>
                            {isEditingShoppingList ? (
                                <textarea
                                    value={shoppingList}
                                    onChange={(e) => setShoppingList(e.target.value)}
                                    placeholder="Add items to your shopping list..."
                                    className="w-full h-32 p-4 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                                />
                            ) : (
                                <div className="bg-emerald-50 rounded-xl p-6 min-h-[8rem]">
                                    {shoppingList ? (
                                        <div className="whitespace-pre-wrap text-stone-700">
                                            {shoppingList}
                                        </div>
                                    ) : (
                                        <p className="text-stone-400 italic">
                                            No shopping list yet. Click edit to add items.
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Notes */}
                        <div>
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-xl font-serif font-bold text-stone-900 flex items-center gap-2">
                                    <StickyNote className="w-5 h-5 text-amber-600" />
                                    Notes
                                </h3>
                                {!isEditingNotes ? (
                                    <button
                                        onClick={() => setIsEditingNotes(true)}
                                        className="text-sm text-stone-600 hover:text-stone-900 flex items-center gap-1"
                                    >
                                        <Edit2 className="w-4 h-4" />
                                        Edit
                                    </button>
                                ) : (
                                    <button
                                        onClick={handleSaveNotes}
                                        className="text-sm text-amber-600 hover:text-amber-700 flex items-center gap-1 font-semibold"
                                    >
                                        <Save className="w-4 h-4" />
                                        Save
                                    </button>
                                )}
                            </div>
                            {isEditingNotes ? (
                                <textarea
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    placeholder="Add your notes, modifications, or cooking tips..."
                                    className="w-full h-32 p-4 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
                                />
                            ) : (
                                <div className="bg-amber-50 rounded-xl p-6 min-h-[8rem]">
                                    {notes ? (
                                        <div className="whitespace-pre-wrap text-stone-700">
                                            {notes}
                                        </div>
                                    ) : (
                                        <p className="text-stone-400 italic">
                                            No notes yet. Click edit to add your thoughts.
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
