import { useState, useEffect } from "react";
import { Category, Recipe } from "@/lib/types";
import { X, Loader2, Sparkles } from "lucide-react";

interface EditRecipeModalProps {
    isOpen: boolean;
    onClose: () => void;
    onUpdate: (updatedRecipe: Recipe) => Promise<void>;
    recipe: Recipe | null;
    categories: Category[]; // No change needed here really, but context
}

export default function EditRecipeModal({ isOpen, onClose, onUpdate, recipe, categories }: EditRecipeModalProps) {
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState<Partial<Recipe>>({});

    useEffect(() => {
        if (recipe) {
            setFormData({
                ...recipe,
                ingredients: recipe.ingredients || "",
                instructions: recipe.instructions || "",
                notes: recipe.notes || ""
            });
        }
    }, [recipe]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            if (recipe) {
                await onUpdate({ ...recipe, ...formData } as Recipe);
                onClose();
            }
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const handleRegenerateImage = () => {
        if (!formData.title) return;
        const newUrl = `https://image.pollinations.ai/prompt/delicious%20${encodeURIComponent(formData.title)}%20gourmet%20plated%20food%20photography?width=800&height=600&nologo=true&seed=${Math.floor(Math.random() * 10000)}`;
        setFormData({ ...formData, image_url: newUrl });
    };

    if (!isOpen || !recipe) return null;

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white text-stone-900 rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
                <div className="p-6 border-b border-stone-100 flex justify-between items-center sticky top-0 bg-white z-10">
                    <h2 className="text-2xl font-serif">Edit Recipe</h2>
                    <button onClick={onClose} className="p-2 hover:bg-stone-100 rounded-full">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-6">
                    {/* Basic Info */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label className="text-sm font-bold uppercase tracking-wider text-stone-500">Title</label>
                            <input
                                required
                                value={formData.title || ""}
                                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                className="w-full p-3 bg-stone-50 rounded-xl border-none focus:ring-2 focus:ring-amber-500"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-bold uppercase tracking-wider text-stone-500">Categories</label>
                            <div className="flex flex-wrap gap-2">
                                {categories.map(c => {
                                    const currentCats = formData.category || [];
                                    // Handle legacy string case if necessary, though we migrated
                                    const isSelected = Array.isArray(currentCats)
                                        ? currentCats.includes(c)
                                        : currentCats === c;

                                    return (
                                        <button
                                            key={c}
                                            type="button"
                                            onClick={() => {
                                                let newCats = Array.isArray(currentCats) ? [...currentCats] : [currentCats as Category];
                                                if (newCats.includes(c)) {
                                                    newCats = newCats.filter(cat => cat !== c);
                                                } else {
                                                    newCats.push(c);
                                                }
                                                setFormData({ ...formData, category: newCats });
                                            }}
                                            className={`px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-colors ${isSelected
                                                ? "bg-stone-900 text-white shadow-md transform scale-105"
                                                : "bg-stone-100 text-stone-500 hover:bg-stone-200"
                                                }`}
                                        >
                                            {c}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    {/* Image Section */}
                    <div className="space-y-2">
                        <label className="text-sm font-bold uppercase tracking-wider text-stone-500">Photo</label>
                        <div className="flex gap-2">
                            <input
                                type="url"
                                placeholder="https://..."
                                value={formData.image_url || ""}
                                onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
                                className="flex-1 p-3 bg-stone-50 rounded-xl border-none focus:ring-2 focus:ring-amber-500 font-mono text-sm"
                            />
                            <button
                                type="button"
                                onClick={handleRegenerateImage}
                                className="px-4 py-2 bg-amber-100 text-amber-800 rounded-xl hover:bg-amber-200 transition-colors flex items-center gap-2 font-medium text-sm"
                                title="Generate New AI Image"
                            >
                                <Sparkles className="w-4 h-4" />
                                New AI Photo
                            </button>
                        </div>
                        {formData.image_url && (
                            <div className="h-40 w-full rounded-xl overflow-hidden bg-stone-100 mt-2 relative">
                                <img src={formData.image_url} className="w-full h-full object-cover" alt="Preview" />
                            </div>
                        )}
                    </div>

                    {/* Link */}
                    <div className="space-y-2">
                        <label className="text-sm font-bold uppercase tracking-wider text-stone-500">Recipe Link (Optional)</label>
                        <input
                            type="url"
                            placeholder="https://recipetineats.com/..."
                            value={formData.link || ""}
                            onChange={(e) => setFormData({ ...formData, link: e.target.value })}
                            className="w-full p-3 bg-stone-50 rounded-xl border-none focus:ring-2 focus:ring-amber-500"
                        />
                    </div>

                    {/* Ingredients */}
                    <div className="space-y-2">
                        <label className="text-sm font-bold uppercase tracking-wider text-stone-500">Ingredients</label>
                        <textarea
                            rows={5}
                            placeholder="• 500g Beef Mince&#10;• 1 Onion, diced..."
                            value={formData.ingredients || ""}
                            onChange={(e) => setFormData({ ...formData, ingredients: e.target.value })}
                            className="w-full p-3 bg-stone-50 rounded-xl border-none focus:ring-2 focus:ring-amber-500 font-sans"
                        />
                    </div>

                    {/* Instructions */}
                    <div className="space-y-2">
                        <label className="text-sm font-bold uppercase tracking-wider text-stone-500">Instructions</label>
                        <textarea
                            rows={5}
                            placeholder="1. Brown the mince...&#10;2. Add the sauce..."
                            value={formData.instructions || ""}
                            onChange={(e) => setFormData({ ...formData, instructions: e.target.value })}
                            className="w-full p-3 bg-stone-50 rounded-xl border-none focus:ring-2 focus:ring-amber-500 font-sans"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-4 bg-stone-900 text-white rounded-xl font-bold text-lg hover:bg-stone-800 transition-transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex justify-center gap-2"
                    >
                        {loading ? <Loader2 className="animate-spin" /> : "Save Changes"}
                    </button>
                </form>
            </div>
        </div>
    );
}
