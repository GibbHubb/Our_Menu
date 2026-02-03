"use client";

import { useEffect, useState } from "react";
import { Category, Recipe } from "@/lib/types";
import { supabase } from "@/lib/supabaseClient";
import Header from "./Header";
import MasonryGrid from "./MasonryGrid";
import AddRecipeModal from "./AddRecipeModal";
import DecisionMaker from "./DecisionMaker";
import { Plus, Wand2, Database } from "lucide-react";
import { INITIAL_RECIPES } from "@/lib/initialData";

const CATEGORIES: Category[] = [
    "Want to Cook",
    "Mains",
    "Soup",
    "Snacks",
    "Breakfast",
    "Sweets",
];

export default function MenuContainer() {
    const [recipes, setRecipes] = useState<Recipe[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedCategory, setSelectedCategory] = useState<Category | "All">("All");
    const [searchTerm, setSearchTerm] = useState("");

    // Modals
    const [isAddOpen, setIsAddOpen] = useState(false);
    const [isDecisionOpen, setIsDecisionOpen] = useState(false);

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
        const matchesCategory =
            selectedCategory === "All" || recipe.category === selectedCategory;
        const matchesSearch = recipe.title
            .toLowerCase()
            .includes(searchTerm.toLowerCase());
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

    // Seed Data Handler (Dev/Setup usage)
    const handleSeedData = async () => {
        if (!confirm("This will upload all initial recipes to the database. Continue?")) return;

        setLoading(true);
        // Upload in batches to be safe, or just loop
        let count = 0;
        let lastError = null;
        for (const r of INITIAL_RECIPES) {
            const { error } = await supabase.from("recipes").insert([r]);
            if (!error) {
                count++;
            } else {
                console.error("Seed error:", error);
                lastError = error;
            }
        }

        if (count === 0 && lastError) {
            alert(`Failed to seed recipes. Error: ${lastError.message || JSON.stringify(lastError)}`);
        } else {
            alert(`Seeded ${count} recipes!`);
        }
        fetchRecipes();
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

            <DecisionMaker
                isOpen={isDecisionOpen}
                onClose={() => setIsDecisionOpen(false)}
                recipes={filteredRecipes}
            />
        </div>
    );
}
