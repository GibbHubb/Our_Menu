import { useRef, useState } from "react";
import { X, Loader2, Link2, Sparkles, Upload } from "lucide-react";
import { Category } from "@/lib/types";
import { SEASONS, SEASON_LABEL, type Season } from "@/lib/seasons";
import { uploadRecipeImage } from "@/lib/recipeImages";  // OM25

// OM10 — wider payload so URL-imported ingredients/instructions land in the same insert.
// OM13 — seasons added to the same payload.
export interface AddRecipePayload {
    title: string;
    category: Category[];
    link: string;
    image_url: string;
    ingredients?: string;
    instructions?: string;
    seasons?: Season[];
}

interface AddRecipeModalProps {
    isOpen: boolean;
    onClose: () => void;
    onAdd: (data: AddRecipePayload) => Promise<void>;
    categories: Category[];
}

const EMPTY_FORM = {
    title: "",
    category: ["Mains"] as Category[],
    link: "",
    image_url: "",
    ingredients: "",
    instructions: "",
    seasons: [] as Season[],
};

export default function AddRecipeModal({ isOpen, onClose, onAdd, categories }: AddRecipeModalProps) {
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState<typeof EMPTY_FORM>(EMPTY_FORM);

    // OM10 — URL-import state
    const [importUrl, setImportUrl] = useState("");
    const [importing, setImporting] = useState(false);
    const [importError, setImportError] = useState<string | null>(null);
    const [importSource, setImportSource] = useState<string | null>(null);

    if (!isOpen) return null;

    const reset = () => {
        setFormData(EMPTY_FORM);
        setImportUrl("");
        setImportError(null);
        setImportSource(null);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            const payload: AddRecipePayload = {
                title: formData.title,
                category: formData.category,
                link: formData.link,
                image_url: formData.image_url,
            };
            if (formData.ingredients.trim()) payload.ingredients = formData.ingredients;
            if (formData.instructions.trim()) payload.instructions = formData.instructions;
            if (formData.seasons.length) payload.seasons = formData.seasons;
            await onAdd(payload);
            onClose();
            reset();
        } catch (err) {
            console.error("Failed to add recipe", err);
        } finally {
            setLoading(false);
        }
    };

    const handleImport = async () => {
        const trimmed = importUrl.trim();
        if (!trimmed) return;
        setImporting(true);
        setImportError(null);
        setImportSource(null);
        try {
            const res = await fetch("/api/import-url", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ url: trimmed }),
            });
            const body = await res.json();
            if (!res.ok) {
                setImportError(body.detail || "Could not import that page.");
                return;
            }
            // Pre-fill: title / image_url / link from the source. Keep any
            // values the user already typed (don't clobber).
            setFormData((prev) => ({
                ...prev,
                title: prev.title || body.title || prev.title,
                image_url: prev.image_url || body.image_url || prev.image_url,
                link: prev.link || body.source_url,
                ingredients: prev.ingredients || (Array.isArray(body.ingredients) ? body.ingredients.join("\n") : prev.ingredients),
                instructions: prev.instructions || (Array.isArray(body.instructions) ? body.instructions.join("\n") : prev.instructions),
            }));
            setImportSource(body.source);
            if (body.source === "none") {
                setImportError("Couldn't find recipe metadata on that page — please add the details manually.");
            }
        } catch {
            setImportError("Network error — please try again.");
        } finally {
            setImporting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-stone-900/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto shadow-xl animate-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between p-4 border-b border-stone-100 sticky top-0 bg-white z-10">
                    <h2 className="font-serif text-xl text-stone-900">Add New Dish</h2>
                    <button onClick={onClose} className="p-2 hover:bg-stone-100 rounded-full transition-colors">
                        <X className="w-5 h-5 text-stone-500" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    {/* OM10 — Import from URL */}
                    <div className="bg-stone-50 border border-stone-200 rounded-lg p-3">
                        <label className="block text-sm font-medium text-stone-700 mb-1 flex items-center gap-1.5">
                            <Link2 className="w-4 h-4" /> Import from a recipe URL (optional)
                        </label>
                        <div className="flex gap-2">
                            <input
                                type="url"
                                className="flex-1 px-3 py-2 border border-stone-200 rounded-lg focus:ring-2 focus:ring-stone-900 focus:outline-none text-sm"
                                placeholder="https://www.allrecipes.com/recipe/…"
                                value={importUrl}
                                onChange={(e) => setImportUrl(e.target.value)}
                                disabled={importing}
                            />
                            <button
                                type="button"
                                onClick={handleImport}
                                disabled={importing || !importUrl.trim()}
                                className="px-3 py-2 bg-stone-800 text-white text-sm rounded-lg hover:bg-stone-900 transition-colors flex items-center gap-1 disabled:opacity-50"
                            >
                                {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                                Import
                            </button>
                        </div>
                        {importError && <p className="text-xs text-red-600 mt-1.5">{importError}</p>}
                        {importSource && importSource !== "none" && !importError && (
                            <p className="text-xs text-emerald-700 mt-1.5">
                                ✓ Imported via {importSource} — review the fields below.
                            </p>
                        )}
                    </div>

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
                        <label className="block text-sm font-medium text-stone-700 mb-2">
                            Seasons <span className="text-xs text-stone-400">(leave empty for year-round)</span>
                        </label>
                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                onClick={() => setFormData({ ...formData, seasons: [] })}
                                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                                    formData.seasons.length === 0
                                        ? "bg-stone-900 text-white shadow-md"
                                        : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                                }`}
                            >
                                Year-round
                            </button>
                            {SEASONS.map((s) => {
                                const isSelected = formData.seasons.includes(s);
                                return (
                                    <button
                                        key={s}
                                        type="button"
                                        onClick={() => {
                                            const next = isSelected
                                                ? formData.seasons.filter((x) => x !== s)
                                                : [...formData.seasons, s];
                                            setFormData({ ...formData, seasons: next });
                                        }}
                                        className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                                            isSelected
                                                ? "bg-stone-900 text-white shadow-md"
                                                : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                                        }`}
                                    >
                                        {SEASON_LABEL[s]}
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
                        <div className="flex gap-2">
                            <input
                                type="url"
                                className="flex-1 px-3 py-2 border border-stone-200 rounded-lg focus:ring-2 focus:ring-stone-900 focus:outline-none"
                                placeholder="https://image..."
                                value={formData.image_url}
                                onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
                            />
                            <ImageUploadButton
                                onUploaded={(url) => setFormData((f) => ({ ...f, image_url: url }))}
                            />
                        </div>
                        <p className="text-xs text-stone-400 mt-1">Paste an image address, or upload one (auto-resized, scoped to your account).</p>
                        {formData.image_url && (
                            <img
                                src={formData.image_url}
                                alt="Preview"
                                className="mt-2 h-24 w-24 object-cover rounded border border-stone-200"
                            />
                        )}
                    </div>

                    {/* OM10 — extracted ingredients/instructions only show when we have them */}
                    {formData.ingredients && (
                        <div>
                            <label className="block text-sm font-medium text-stone-700 mb-1">
                                Ingredients <span className="text-xs text-stone-400">(imported — edit before saving)</span>
                            </label>
                            <textarea
                                rows={5}
                                className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:ring-2 focus:ring-stone-900 focus:outline-none text-sm font-mono"
                                value={formData.ingredients}
                                onChange={(e) => setFormData({ ...formData, ingredients: e.target.value })}
                            />
                        </div>
                    )}

                    {formData.instructions && (
                        <div>
                            <label className="block text-sm font-medium text-stone-700 mb-1">
                                Instructions <span className="text-xs text-stone-400">(imported — edit before saving)</span>
                            </label>
                            <textarea
                                rows={6}
                                className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:ring-2 focus:ring-stone-900 focus:outline-none text-sm"
                                value={formData.instructions}
                                onChange={(e) => setFormData({ ...formData, instructions: e.target.value })}
                            />
                        </div>
                    )}

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


// OM25 — Small upload button used by Add and Edit recipe modals.
export function ImageUploadButton({ onUploaded }: { onUploaded: (url: string) => void }) {
    const ref = useRef<HTMLInputElement>(null);
    const [busy, setBusy] = useState(false);
    return (
        <>
            <input
                ref={ref}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setBusy(true);
                    try {
                        const res = await uploadRecipeImage(file);
                        if (res) onUploaded(res.url);
                    } finally {
                        setBusy(false);
                        if (ref.current) ref.current.value = "";
                    }
                }}
            />
            <button
                type="button"
                onClick={() => ref.current?.click()}
                disabled={busy}
                className="px-3 py-2 border border-stone-200 rounded-lg text-stone-700 hover:bg-stone-50 flex items-center gap-1.5 text-sm"
                title="Upload a photo"
            >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {busy ? "" : "Upload"}
            </button>
        </>
    );
}
