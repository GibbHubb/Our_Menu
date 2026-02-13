import { Recipe } from "@/lib/types";
import { X, Sparkles, RefreshCw } from "lucide-react";
import { useState, useEffect } from "react";
import RecipeCard from "./RecipeCard";

interface DecisionMakerProps {
    isOpen: boolean;
    onClose: () => void;
    recipes: Recipe[];
}

export default function DecisionMaker({ isOpen, onClose, recipes }: DecisionMakerProps) {
    const [selected, setSelected] = useState<Recipe | null>(null);
    const [isSpinning, setIsSpinning] = useState(false);

    const [selectedCategory, setSelectedCategory] = useState<string>("All");

    // Pick a random recipe
    const pickRandom = () => {
        const candidates = selectedCategory === "All"
            ? recipes
            : recipes.filter(r => r.category && r.category.includes(selectedCategory as any));

        if (candidates.length === 0) {
            setSelected(null);
            return;
        }

        setIsSpinning(true);
        setSelected(null);

        // Fake "spinning" delay
        setTimeout(() => {
            const random = candidates[Math.floor(Math.random() * candidates.length)];
            setSelected(random);
            setIsSpinning(false);
        }, 800);
    };

    useEffect(() => {
        if (isOpen && recipes.length > 0) {
            pickRandom();
        }
    }, [isOpen]); // Keep simple dependency to avoid infinite loops if we added selectedCategory here

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-md animate-in fade-in duration-300">
            <div className="w-full max-w-sm flex flex-col items-center">
                <div className="bg-white/10 p-2 rounded-full mb-4">
                    <Sparkles className="w-8 h-8 text-amber-300" />
                </div>

                <h2 className="font-serif text-3xl text-white mb-8 text-center">
                    {isSpinning ? "Consulting the Food Gods..." : "Have you tried..."}
                </h2>

                <div className="flex flex-wrap justify-center gap-2 mb-6 max-w-xs">
                    {["All", "Mains", "Midweek", "Salad", "Pasta", "Soup", "Snacks"].map(cat => (
                        <button
                            key={cat}
                            onClick={() => {
                                setSelectedCategory(cat);
                                // Optional: auto-spin on change? Maybe better to let them click spin.
                            }}
                            className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider transition-colors ${selectedCategory === cat
                                    ? "bg-amber-500 text-stone-900"
                                    : "bg-white/10 text-white hover:bg-white/20"
                                }`}
                        >
                            {cat}
                        </button>
                    ))}
                </div>

                {isSpinning ? (
                    <div className="w-64 h-80 bg-white/5 rounded-2xl animate-pulse flex items-center justify-center border border-white/10">
                        <LoaderIcon />
                    </div>
                ) : selected ? (
                    <div className="w-full animate-in zoom-in-50 duration-500 hover:scale-105 transition-transform">
                        <div className="pointer-events-none">
                            <RecipeCard recipe={selected} />
                        </div>
                    </div>
                ) : (
                    <div className="text-white">No recipes in this view!</div>
                )}

                <div className="mt-8 flex gap-4">
                    <button
                        onClick={onClose}
                        className="px-6 py-3 rounded-full bg-white/10 text-white backdrop-blur-md hover:bg-white/20 transition-colors font-medium border border-white/10"
                    >
                        Nah, close
                    </button>
                    <button
                        onClick={pickRandom}
                        className="px-6 py-3 rounded-full bg-amber-500 text-stone-900 shadow-lg shadow-amber-500/20 hover:bg-amber-400 transition-colors font-bold flex items-center gap-2"
                    >
                        <RefreshCw className="w-4 h-4" />
                        Spin Again
                    </button>
                </div>
            </div>
        </div>
    );
}

function LoaderIcon() {
    return (
        <svg className="animate-spin h-10 w-10 text-white/50" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
    )
}
