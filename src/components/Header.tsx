import { Search, ChefHat } from "lucide-react";
import { Category } from "@/lib/types";
import { motion } from "framer-motion";

interface HeaderProps {
    categories: Category[];
    selectedCategory: Category | "All";
    onSelectCategory: (cat: Category | "All") => void;
    searchTerm: string;
    onSearchChange: (val: string) => void;
}

export default function Header({
    categories,
    selectedCategory,
    onSelectCategory,
    searchTerm,
    onSearchChange,
}: HeaderProps) {
    return (
        <header className="sticky top-0 z-50 bg-stone-50/95 backdrop-blur-md border-b border-stone-200 shadow-sm transition-all">
            <div className="max-w-7xl mx-auto px-4 py-4 space-y-4">
                {/* Top Row: Logo & Search */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                        <div className="p-2 bg-stone-900 rounded-full">
                            <ChefHat className="w-6 h-6 text-stone-50" />
                        </div>
                        <h1 className="text-2xl font-serif text-stone-900 tracking-tight">
                            Max & Bron
                        </h1>
                    </div>

                    <div className="relative w-full md:max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                        <input
                            type="text"
                            placeholder="What are we craving?"
                            value={searchTerm}
                            onChange={(e) => onSearchChange(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-white border border-stone-200 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-stone-400 transition-shadow shadow-sm"
                        />
                    </div>
                </div>

                {/* Bottom Row: Category Chips */}
                <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar mask-gradient">
                    <button
                        onClick={() => onSelectCategory("All")}
                        className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${selectedCategory === "All"
                                ? "bg-stone-900 text-stone-50"
                                : "bg-white border border-stone-200 text-stone-600 hover:bg-stone-100"
                            }`}
                    >
                        All Dishes
                    </button>
                    {categories.map((cat) => (
                        <button
                            key={cat}
                            onClick={() => onSelectCategory(cat)}
                            className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${selectedCategory === cat
                                    ? "bg-stone-900 text-stone-50"
                                    : "bg-white border border-stone-200 text-stone-600 hover:bg-stone-100"
                                }`}
                        >
                            {cat}
                        </button>
                    ))}
                </div>
            </div>
        </header>
    );
}
