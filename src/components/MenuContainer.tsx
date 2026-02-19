"use client";

import { useEffect, useState, Suspense } from "react";
import { Category, Recipe } from "@/lib/types";
import { supabase } from "@/lib/supabaseClient";
import Header from "./Header";
import MasonryGrid from "./MasonryGrid";
import AddRecipeModal from "./AddRecipeModal";
import EditRecipeModal from "./EditRecipeModal";
import DecisionMaker from "./DecisionMaker";
import { Plus, Wand2, Database } from "lucide-react";
import { INITIAL_RECIPES } from "@/lib/initialData";
import { useRouter, useSearchParams } from "next/navigation";

import { CATEGORIES } from "@/lib/constants";

function MenuContent() {
    const router = useRouter();
    const searchParams = useSearchParams();

    const [recipes, setRecipes] = useState<Recipe[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const initialCategory = (searchParams.get("category") as Category) || "All";
    const initialSearch = searchParams.get("search") || "";

    const [selectedCategory, setSelectedCategory] = useState<Category | "All">(initialCategory);
    const [searchTerm, setSearchTerm] = useState(initialSearch);

    // Sync state to URL
    useEffect(() => {
        const params = new URLSearchParams();
        if (selectedCategory !== "All") params.set("category", selectedCategory);
        if (searchTerm) params.set("search", searchTerm);
        router.replace(`?${params.toString()}`, { scroll: false });
    }, [selectedCategory, searchTerm, router]);

    // Modals
    const [isAddOpen, setIsAddOpen] = useState(false);
    const [isDecisionOpen, setIsDecisionOpen] = useState(false);
    const [isDetailOpen, setIsDetailOpen] = useState(false);

    // Editing
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null);
    const [detailRecipe, setDetailRecipe] = useState<Recipe | null>(null);

    // Fetch Recipes
    const fetchRecipes = async () => {
        setLoading(true);
        setError(null);
        const { data, error } = await supabase
            .from("recipes")
            .select("*")
            .order("created_at", { ascending: false });

        if (error) {
            console.error("Error fetching recipes:", error);
            setError(error.message);
        } else {
            setRecipes(data as Recipe[]);
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchRecipes();
    }, []);

    // Filter Logic
    const filteredRecipes = recipes.filter((recipe) => {
        const normalizedSearch = searchTerm.toLowerCase();
        const matchesSearch = recipe.title.toLowerCase().includes(normalizedSearch) ||
            (recipe.ingredients && recipe.ingredients.toLowerCase().includes(normalizedSearch));

        // If there is a search term, we search ALL categories (user request).
        // Otherwise, we filter by the selected category.
        const matchesCategory = searchTerm
            ? true
            : (selectedCategory === "All" || recipe.category.includes(selectedCategory));

        return matchesCategory && matchesSearch;
    });

    // Add Recipe Handler
    const handleAddRecipe = async (newRecipe: any) => {
        const { data, error } = await supabase.from("recipes").insert([newRecipe]).select();
        if (error) {
            alert("Error adding recipe! " + error.message);
            throw error;
        }
        if (data) {
            setRecipes((prev) => [data[0] as Recipe, ...prev]);
        }
    };

    // Update Recipe Handler
    const handleUpdateRecipe = async (updated: Recipe) => {
        const { error } = await supabase.from("recipes").update(updated).eq("id", updated.id);
        if (error) {
            alert("Error updating recipe! " + error.message);
            return;
        }

        setRecipes((prev) => prev.map(r => r.id === updated.id ? updated : r));
    };

    const handleOpenEdit = (recipe: Recipe) => {
        setEditingRecipe(recipe);
        setIsEditOpen(true);
    };

    const handleOpenDetail = (recipe: Recipe) => {
        setDetailRecipe(recipe);
        setIsDetailOpen(true);
    };

    // Seed Data Handler (Dev/Setup usage)
    const handleSeedData = async () => {
        if (!confirm("This will upload all initial recipes. Duplicates will be skipped. Continue?")) return;

        setLoading(true);
        let count = 0;
        let skipCount = 0;

        // Get existing titles to prevent duplicates
        const { data: existing } = await supabase.from("recipes").select("title");
        const existingTitles = new Set(existing?.map(r => r.title.toLowerCase()) || []);

        for (const r of INITIAL_RECIPES) {
            if (r.title && existingTitles.has(r.title.toLowerCase())) {
                skipCount++;
                continue;
            }

            const { error } = await supabase.from("recipes").insert([r]);
            if (!error) {
                count++;
            } else {
                console.error("Seed error:", error);
            }
        }

        alert(`Finished! Added ${count} new recipes. Skipped ${skipCount} already in menu.`);
        fetchRecipes();
    };

    // Reset Data Handler
    const handleResetData = async () => {
        if (!confirm("⚠️ WARNING: This will DELETE ALL recipes from the database. This cannot be undone. Are you sure?")) return;

        setLoading(true);
        // "select" option is needed to return the count of deleted rows
        const { error, count } = await supabase.from("recipes").delete({ count: 'exact' }).neq("id", "00000000-0000-0000-0000-000000000000");

        if (error) {
            alert(`Error resetting: ${error.message}. Check your Supabase Policies!`);
        } else if (count !== null && count === 0 && recipes.length > 0) {
            alert("Warning: 0 recipes were deleted. This usually means Supabase is blocking the DELETE action. Please run the SQL command to enable 'delete' policies.");
        } else {
            alert("Menu cleared! You can now reload the initial data.");
            setRecipes([]);
        }
        setLoading(false);
    };

    return (
        <div className="min-h-screen bg-stone-50 text-stone-900 font-sans pb-20">
            <Header
                categories={CATEGORIES}
                selectedCategory={selectedCategory}
                onSelectCategory={setSelectedCategory}
                searchTerm={searchTerm}
                onSearchChange={setSearchTerm}
            />

            <main className="max-w-7xl mx-auto pt-6">
                {loading ? (
                    <div className="flex justify-center pt-20">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-stone-900"></div>
                    </div>
                ) : (
                    <MasonryGrid
                        recipes={filteredRecipes}
                        onSeed={handleSeedData}
                        onReset={handleResetData}
                        onEdit={handleOpenEdit}
                        error={error}
                    />
                )}
            </main>

            {/* Floating Action Buttons */}
            <div className="fixed bottom-6 right-6 flex flex-col gap-3 z-40">
                <button
                    onClick={() => setIsDecisionOpen(true)}
                    className="p-4 bg-white text-amber-600 rounded-full shadow-lg hover:bg-amber-50 transition-transform hover:scale-105 border border-amber-100"
                    title="Pick for us!"
                >
                    <Wand2 className="w-6 h-6" />
                </button>

                <button
                    onClick={() => setIsAddOpen(true)}
                    className="p-4 bg-stone-900 text-white rounded-full shadow-lg hover:bg-stone-800 transition-transform hover:scale-105"
                    title="Add Recipe"
                >
                    <Plus className="w-6 h-6" />
                </button>
            </div>

            <AddRecipeModal
                isOpen={isAddOpen}
                onClose={() => setIsAddOpen(false)}
                onAdd={handleAddRecipe}
                categories={CATEGORIES}
            />

            <EditRecipeModal
                isOpen={isEditOpen}
                onClose={() => setIsEditOpen(false)}
                onUpdate={handleUpdateRecipe}
                recipe={editingRecipe}
                categories={CATEGORIES}
            />

            <DecisionMaker
                isOpen={isDecisionOpen}
                onClose={() => setIsDecisionOpen(false)}
                recipes={filteredRecipes}
            />
        </div>
    );
}

export default function MenuContainer() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-stone-50" />}>
            <MenuContent />
        </Suspense>
    );
}
