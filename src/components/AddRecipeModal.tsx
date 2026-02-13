import { useState } from "react";
import { X, Loader2 } from "lucide-react";
import { Category } from "@/lib/types";

interface AddRecipeModalProps {
    isOpen: boolean;
    onClose: () => void;
    onAdd: (data: { title: string; category: Category[]; link: string; image_url: string }) => Promise<void>;
    categories: Category[];
}

export default function AddRecipeModal({ isOpen, onClose, onAdd, categories }: AddRecipeModalProps) {
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState<{
        title: string;
        category: Category[];
        link: string;
        image_url: string;
    }>({
        title: "",
        category: ["Mains"],
        link: "",
        image_url: "",
    });

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            await onAdd(formData);
            onClose();
            setFormData({ title: "", category: ["Mains"], link: "", image_url: "" });
        } catch (err) {
            console.error("Failed to add recipe", err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-stone-900/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl w-full max-w-md shadow-xl overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between p-4 border-b border-stone-100">
                    <h2 className="font-serif text-xl text-stone-900">Add New Dish</h2>
                    <button onClick={onClose} className="p-2 hover:bg-stone-100 rounded-full transition-colors">
                        <X className="w-5 h-5 text-stone-500" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-stone-700 mb-1">Dish Name</label>
                        <input
                            required
                            type="text"
                            className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:ring-2 focus:ring-stone-900 focus:outline-none"
                            placeholder="e.g. Spicy Rigatoni"
                            value={formData.title}
                            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-stone-700 mb-2">Categories</label>
                        <div className="flex flex-wrap gap-2">
                            {categories.map(cat => {
                                const isSelected = formData.category.includes(cat);
                                return (
                                    <button
                                        key={cat}
                                        type="button"
                                        onClick={() => {
                                            if (isSelected) {
                                                setFormData({ ...formData, category: formData.category.filter(c => c !== cat) });
                                            } else {
                                                setFormData({ ...formData, category: [...formData.category, cat] });
                                            }
                                        }}
                                        className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${isSelected
                                            ? "bg-stone-900 text-white shadow-md transform scale-105"
                                            : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                                            }`}
                                    >
                                        {cat}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-stone-700 mb-1">Recipe Link (Optional)</label>
                        <input
                            type="url"
                            className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:ring-2 focus:ring-stone-900 focus:outline-none"
                            placeholder="https://..."
                            value={formData.link}
                            onChange={(e) => setFormData({ ...formData, link: e.target.value })}
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-stone-700 mb-1">Image URL (Optional)</label>
                        <input
                            type="url"
                            className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:ring-2 focus:ring-stone-900 focus:outline-none"
                            placeholder="https://image..."
                            value={formData.image_url}
                            onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
                        />
                        <p className="text-xs text-stone-400 mt-1">Paste an image address from Google Images.</p>
                    </div>

                    <div className="pt-4 flex justify-end gap-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-sm font-medium text-stone-600 hover:bg-stone-50 rounded-lg transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="px-6 py-2 bg-stone-900 text-white text-sm font-medium rounded-lg hover:bg-stone-800 transition-colors flex items-center gap-2"
                        >
                            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                            Save Dish
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
