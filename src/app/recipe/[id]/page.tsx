"use client";

import React, { useEffect, useState, use } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Recipe } from "@/lib/types";
import { CATEGORIES } from "@/lib/constants";
import { ArrowLeft, ExternalLink, ClipboardList, StickyNote, Edit2, Save, MoreHorizontal, Pencil, Copy, Check } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Image from "next/image";
import EditRecipeModal from "@/components/EditRecipeModal";
import ShoppingListComp from "@/components/ShoppingList";
import IngredientList from "@/components/IngredientList";

export default function RecipePage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const router = useRouter();

    const [recipe, setRecipe] = useState<Recipe | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Editing States
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isEditingNotes, setIsEditingNotes] = useState(false);
    const [notes, setNotes] = useState("");
    const [shoppingList, setShoppingList] = useState("");
    const [isEditingShoppingList, setIsEditingShoppingList] = useState(false);
    const [scale, setScale] = useState(1);

    useEffect(() => {
        const fetchRecipe = async () => {
            const { data, error } = await supabase
                .from("recipes")
                .select("*")
                .eq("id", id)
                .single();

            if (error) {
                console.error(error);
                setError("Recipe not found");
            } else {
                setRecipe(data as Recipe);
                setNotes(data.notes || "");
                setShoppingList(data.shopping_list || "");
            }
            setLoading(false);
        };

        if (id) fetchRecipe();
    }, [id]);

    const handleUpdateRecipe = async (updated: Recipe) => {
        // Optimistic update
        setRecipe(updated);
        setNotes(updated.notes || "");
        setShoppingList(updated.shopping_list || "");

        // Exclude UI-only fields if any (though Recipe type maps to DB 1:1)
        const { data, error } = await supabase
            .from("recipes")
            .update({
                title: updated.title,
                category: updated.category,
                link: updated.link,
                image_url: updated.image_url,
                ingredients: updated.ingredients,
                instructions: updated.instructions,
                notes: updated.notes,
                shopping_list: updated.shopping_list
            })
            .eq("id", updated.id)
            .select('id');

        if (error) {
            console.error("Update Error:", error);
            alert(`Failed to save! Error: ${error.message}\nTip: Run 'repair_database.sql' in Supabase.`);
        } else if (!data || data.length === 0) {
            alert("Failed to save! Permission denied (0 rows updated).\nPlease run 'repair_database.sql' in Supabase to fix permissions.");
        }
    };

    const handleSaveNotes = async () => {
        if (!recipe) return;
        const updated = { ...recipe, notes };
        await handleUpdateRecipe(updated);
        setIsEditingNotes(false);
    };

    const handleSaveShoppingList = async () => {
        if (!recipe) return;
        const updated = { ...recipe, shopping_list: shoppingList };
        await handleUpdateRecipe(updated);
        setIsEditingShoppingList(false);
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-stone-50">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-stone-900"></div>
            </div>
        );
    }

    if (!recipe) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-stone-50 gap-4">
                <h1 className="text-2xl font-serif text-stone-900">Recipe Not Found</h1>
                <Link href="/" className="text-amber-600 hover:underline">Return Home</Link>
            </div>
        );
    }

    const hasExternalLink = !!recipe.link;
    // Show full recipe logic if we have explicit ingredients text that isn't just the "See full recipe" placeholder
    // OR if we don't have an external link (then we surely must show whatever we have)
    const isPlaceholderIngredient = recipe.ingredients && (
        recipe.ingredients.includes("See full recipe at")
    );
    const showFullContent = !isPlaceholderIngredient || !hasExternalLink;

    return (
        <div className="min-h-screen bg-stone-50 font-sans pb-20">
            {/* Minimal Header */}
            <div className="bg-white sticky top-0 z-40 border-b border-stone-100 px-4 py-3 flex items-center justify-between shadow-sm">
                <button onClick={() => router.back()} className="p-2 -ml-2 text-stone-600 hover:bg-stone-100 rounded-full transition-colors">
                    <ArrowLeft className="w-6 h-6" />
                </button>
                <span className="font-serif font-bold text-stone-900 truncate max-w-[60%]">
                    {recipe.title}
                </span>
                <button
                    onClick={() => setIsEditModalOpen(true)}
                    className="p-2 text-stone-600 hover:bg-stone-100 rounded-full transition-colors"
                    title="Edit Recipe"
                >
                    <Pencil className="w-5 h-5" />
                </button>
            </div>

            <div className="max-w-4xl mx-auto">
                {/* Hero Image */}
                <div className="aspect-video w-full bg-stone-200 relative">
                    {recipe.image_url ? (
                        <img
                            src={recipe.image_url}
                            alt={recipe.title}
                            className="w-full h-full object-cover"
                        />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center text-stone-400">
                            No Image
                        </div>
                    )}
                    <div className="absolute bottom-4 left-4 flex flex-wrap gap-2">
                        {Array.isArray(recipe.category) ? (
                            recipe.category.map((cat, idx) => (
                                <span key={idx} className="bg-white/90 backdrop-blur-md px-3 py-1 rounded-lg text-sm font-bold text-stone-900 shadow-sm border border-stone-200">
                                    {cat}
                                </span>
                            ))
                        ) : (
                            <span className="bg-white/90 backdrop-blur-md px-3 py-1 rounded-lg text-sm font-bold text-stone-900 shadow-sm border border-stone-200">
                                {recipe.category}
                            </span>
                        )}
                    </div>
                </div>

                {/* Main Content */}
                <div className="p-6 space-y-8">

                    {/* External Link CTA */}
                    {hasExternalLink && (
                        <a
                            href={recipe.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-center gap-2 w-full p-4 bg-stone-900 text-white rounded-xl font-bold shadow-lg hover:bg-stone-800 transition-transform active:scale-95"
                        >
                            <ExternalLink className="w-5 h-5" />
                            View Original Recipe
                        </a>
                    )}

                    {/* Shopping List */}
                    <div className="bg-white rounded-2xl p-6 shadow-sm border border-stone-100">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-xl font-serif font-bold text-stone-900 flex items-center gap-2">
                                <ClipboardList className="w-5 h-5 text-emerald-600" />
                                Shopping List
                            </h3>
                            {!isEditingShoppingList ? (
                                <button
                                    onClick={() => setIsEditingShoppingList(true)}
                                    className="text-sm text-stone-500 hover:text-stone-900 font-medium px-3 py-1 hover:bg-stone-100 rounded-lg transition-colors"
                                >
                                    Edit
                                </button>
                            ) : (
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setIsEditingShoppingList(false)}
                                        className="text-sm text-stone-500 hover:text-stone-800 px-3 py-1"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleSaveShoppingList}
                                        className="text-sm bg-emerald-100 text-emerald-700 px-3 py-1 rounded-lg font-bold hover:bg-emerald-200"
                                    >
                                        Save
                                    </button>
                                </div>
                            )}
                        </div>

                        {isEditingShoppingList ? (
                            <textarea
                                value={shoppingList}
                                onChange={(e) => setShoppingList(e.target.value)}
                                placeholder="- Milk&#10;- Eggs..."
                                className="w-full h-40 p-4 bg-stone-50 rounded-xl border-none resize-none focus:ring-2 focus:ring-emerald-500"
                                autoFocus
                            />
                        ) : (
                            <div className="mt-2">
                                {shoppingList ? (
                                    <ShoppingListComp initialList={shoppingList} scale={scale} setScale={setScale} />
                                ) : (
                                    <p className="text-stone-400 italic">No items in shopping list.</p>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Ingredients & Instructions (If available locally) */}
                    {showFullContent && (
                        <div className="grid md:grid-cols-2 gap-6">
                            <div className="bg-white rounded-2xl p-6 shadow-sm border border-stone-100">
                                <IngredientList ingredients={recipe.ingredients || ""} scale={scale} setScale={setScale} />
                            </div>
                            <div className="bg-white rounded-2xl p-6 shadow-sm border border-stone-100">
                                <h3 className="text-xl font-serif font-bold text-stone-900 mb-4 border-b border-stone-100 pb-2">Instructions</h3>
                                <div className="whitespace-pre-wrap text-stone-700 leading-relaxed">
                                    {recipe.instructions || "No instructions listed."}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Notes */}
                    <div className="bg-amber-50/50 rounded-2xl p-6 border border-amber-100">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-xl font-serif font-bold text-amber-900 flex items-center gap-2">
                                <StickyNote className="w-5 h-5 text-amber-600" />
                                Chef's Notes
                            </h3>
                            {!isEditingNotes ? (
                                <button
                                    onClick={() => setIsEditingNotes(true)}
                                    className="text-sm text-amber-700 hover:text-amber-900 font-medium px-3 py-1 hover:bg-amber-100 rounded-lg transition-colors"
                                >
                                    Edit
                                </button>
                            ) : (
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setIsEditingNotes(false)}
                                        className="text-sm text-stone-500 hover:text-stone-800 px-3 py-1"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleSaveNotes}
                                        className="text-sm bg-amber-200 text-amber-800 px-3 py-1 rounded-lg font-bold hover:bg-amber-300"
                                    >
                                        Save
                                    </button>
                                </div>
                            )}
                        </div>

                        {isEditingNotes ? (
                            <textarea
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                placeholder="Family loved this! Use less salt next time..."
                                className="w-full h-32 p-4 bg-white rounded-xl border border-amber-200 resize-none focus:ring-2 focus:ring-amber-500"
                                autoFocus
                            />
                        ) : (
                            <div className={`prose prose-stone ${!notes && 'italic text-stone-400'}`}>
                                {notes ? (
                                    <div className="whitespace-pre-wrap text-stone-800">{notes}</div>
                                ) : (
                                    "Add your personal notes here..."
                                )}
                            </div>
                        )}
                    </div>

                </div>
            </div>

            <EditRecipeModal
                isOpen={isEditModalOpen}
                onClose={() => setIsEditModalOpen(false)}
                onUpdate={handleUpdateRecipe}
                recipe={recipe}
                categories={CATEGORIES}
            />
        </div>
    );
}
