"use client";

import { useEffect, useState, Suspense } from "react";
import { Category, Recipe } from "@/lib/types";
import { supabase } from "@/lib/supabaseClient";
import Header from "./Header";
import MasonryGrid from "./MasonryGrid";
import AddRecipeModal from "./AddRecipeModal";
import EditRecipeModal from "./EditRecipeModal";
import DecisionMaker from "./DecisionMaker";
import ChatAgent from "./ChatAgent";
import CollectionBar from "./CollectionBar";
import { Plus, Wand2, Database, Sparkles, X } from "lucide-react";
import { INITIAL_RECIPES } from "@/lib/initialData";
import { useRouter, useSearchParams } from "next/navigation";

import { CATEGORIES } from "@/lib/constants";
import {
    getCollections,
    createCollection,
    renameCollection as renameCollectionApi,
    deleteCollection as deleteCollectionApi,
    getCollectionMemberships,
    type Collection,
} from "@/lib/collections";

function MenuContent() {
    const router = useRouter();
    const searchParams = useSearchParams();

    const [recipes, setRecipes] = useState<Recipe[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // OM9 — collections
    const [collections, setCollections] = useState<Collection[]>([]);
    const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
    const [membershipMap, setMembershipMap] = useState<Record<string, Set<string>>>({});

    const refreshCollections = async () => {
        const [cols, mems] = await Promise.all([getCollections(), getCollectionMemberships()]);
        setCollections(cols);
        setMembershipMap(mems);
    };

    useEffect(() => {
        refreshCollections();
    }, []);

    const handleCreateCollection = async (name: string) => {
        await createCollection(name);
        await refreshCollections();
    };
    const handleRenameCollection = async (id: string, name: string) => {
        await renameCollectionApi(id, name);
        await refreshCollections();
    };
    const handleDeleteCollection = async (id: string) => {
        await deleteCollectionApi(id);
        if (selectedCollectionId === id) setSelectedCollectionId(null);
        await refreshCollections();
    };

    // Semantic search state (OM1)
    const [semanticQuery, setSemanticQuery] = useState('');
    const [semanticResults, setSemanticResults] = useState<Recipe[] | null>(null);
    const [semanticLoading, setSemanticLoading] = useState(false);
    const [semanticError, setSemanticError] = useState('');

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

    // Semantic search handler (OM1)
    const handleSemanticSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!semanticQuery.trim()) { setSemanticResults(null); return; }
        setSemanticLoading(true);
        setSemanticError('');
        try {
            const res = await fetch('/api/recipes/search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: semanticQuery }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
            setSemanticResults(data.results ?? []);
        } catch (e: unknown) {
            setSemanticError(e instanceof Error ? e.message : String(e));
            setSemanticResults(null);
        } finally {
            setSemanticLoading(false);
        }
    };

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

        // Explicitly hide any legacy recipes in "Back Burner" category unless we searched for something
        const isBackBurner = recipe.category.some(c => c.toLowerCase().includes("back burner"));
        const hideBackBurner = isBackBurner && !searchTerm && selectedCategory === "All";

        // OM9 — collection filter (applies alongside category/search)
        const matchesCollection = selectedCollectionId === null
            ? true
            : membershipMap[selectedCollectionId]?.has(recipe.id) ?? false;

        return matchesCategory && matchesSearch && !hideBackBurner && matchesCollection;
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

            {/* Semantic Search Bar (OM1) */}
            <div className="max-w-7xl mx-auto px-4 pt-4">
                <form onSubmit={handleSemanticSearch} className="flex gap-2">
                    <div className="relative flex-1">
                        <Sparkles className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-400" />
                        <input
                            type="text"
                            placeholder="Search recipes semantically…"
                            value={semanticQuery}
                            onChange={e => { setSemanticQuery(e.target.value); if (!e.target.value) setSemanticResults(null); }}
                            className="w-full pl-10 pr-4 py-2 bg-white border border-indigo-200 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 shadow-sm"
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={semanticLoading}
                        className="px-4 py-2 bg-indigo-600 text-white rounded-full text-sm font-medium hover:bg-indigo-700 disabled:opacity-60 transition-colors"
                    >
                        {semanticLoading ? '…' : 'Search'}
                    </button>
                    {semanticResults !== null && (
                        <button
                            type="button"
                            onClick={() => { setSemanticResults(null); setSemanticQuery(''); setSemanticError(''); }}
                            className="px-3 py-2 bg-stone-200 text-stone-700 rounded-full text-sm hover:bg-stone-300 transition-colors"
                            title="Clear semantic search"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    )}
                </form>
                {semanticError && (
                    <p className="text-red-600 text-xs mt-1 pl-2">{semanticError}</p>
                )}
                {semanticResults !== null && (
                    <p className="text-xs text-stone-500 mt-1 pl-2">
                        {semanticResults.length
                            ? `${semanticResults.length} semantic match${semanticResults.length !== 1 ? 'es' : ''}`
                            : 'No semantic matches found — showing all recipes below.'}
                    </p>
                )}
                {/* Admin-only: sync embeddings — visible at ?admin=1 */}
                {searchParams.get('admin') === '1' && (
                    <button
                        onClick={async () => {
                            await fetch('/api/recipes/embed', { method: 'POST' });
                            alert('Embeddings synced!');
                        }}
                        className="mt-2 text-xs px-3 py-1 border border-stone-300 rounded-full text-stone-500 hover:bg-stone-100"
                    >
                        Sync embeddings
                    </button>
                )}
            </div>

            {/* OM9 — Collections filter bar */}
            <CollectionBar
                collections={collections}
                selectedId={selectedCollectionId}
                onSelect={setSelectedCollectionId}
                onCreate={handleCreateCollection}
                onRename={handleRenameCollection}
                onDelete={handleDeleteCollection}
            />

            <main className="max-w-7xl mx-auto pt-4">
                {loading ? (
                    <div className="flex justify-center pt-20">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-stone-900"></div>
                    </div>
                ) : (
                    <MasonryGrid
                        recipes={semanticResults !== null && semanticResults.length > 0
                            ? semanticResults
                            : filteredRecipes}
                        onSeed={handleSeedData}
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

            <ChatAgent />
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
