"use client";

import { Search, ChefHat, LogIn, LogOut, User as UserIcon, Users } from "lucide-react";
import { Category } from "@/lib/types";
import Link from "next/link";
import { useAuth } from "@/lib/AuthContext";
import { useUnitSystem } from "@/lib/useUnitSystem";  // OM27
import PrimaryNav from "./PrimaryNav";  // OM42

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
    const { user, loading, signOut } = useAuth();
    const [unitSystem, setUnitSystemPref] = useUnitSystem();  // OM27
    return (
        <header className="sticky top-0 z-50 bg-stone-50/95 backdrop-blur-md border-b border-stone-200 shadow-sm transition-all">
            <div className="max-w-7xl mx-auto px-4 py-4 space-y-4">
                {/* OM42 — Recipes / Pantry / Shopping list, the app's three modes */}
                {/* Top Row: Logo & Search */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                        <div className="p-2 bg-stone-900 rounded-full">
                            <ChefHat className="w-6 h-6 text-stone-50" />
                        </div>
                        <h1 className="text-2xl font-serif text-stone-900 tracking-tight">
                            Max & Bron
                        </h1>
                    </Link>

                    <div className="flex items-center gap-2 w-full md:w-auto md:flex-1 md:max-w-md md:ml-auto">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                            <input
                                type="text"
                                placeholder="What are we craving?"
                                value={searchTerm}
                                onChange={(e) => onSearchChange(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 bg-white border border-stone-200 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-stone-400 transition-shadow shadow-sm"
                            />
                        </div>

                        {/* OM27 — metric/US display toggle */}
                        <button
                            onClick={() => setUnitSystemPref(unitSystem === 'metric' ? 'us' : 'metric')}
                            className="px-2.5 py-1.5 text-xs font-semibold rounded-full bg-stone-100 text-stone-700 hover:bg-stone-200 border border-stone-200"
                            title="Toggle metric / US display units"
                            aria-label="Toggle unit system"
                        >
                            {unitSystem === 'metric' ? 'g / ml' : 'oz / cup'}
                        </button>

                        {/* OM14 Phase A — auth pill */}
                        {loading ? (
                            <div className="w-9 h-9 rounded-full bg-stone-100 animate-pulse" aria-hidden />
                        ) : user ? (
                            <div className="flex items-center gap-1">
                                {/* OM14 Phase B — household management */}
                                <Link
                                    href="/households"
                                    className="p-2 text-stone-500 hover:text-stone-900 hover:bg-stone-100 rounded-full"
                                    title="Household"
                                    aria-label="Household"
                                >
                                    <Users className="w-4 h-4" />
                                </Link>
                                <span
                                    className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-800 border border-emerald-100 rounded-full text-xs font-medium"
                                    title={user.email ?? ""}
                                >
                                    <UserIcon className="w-3.5 h-3.5" />
                                    <span className="max-w-[140px] truncate">{user.email?.split("@")[0]}</span>
                                </span>
                                <button
                                    onClick={() => { void signOut(); }}
                                    className="p-2 text-stone-500 hover:text-stone-900 hover:bg-stone-100 rounded-full"
                                    title="Sign out"
                                    aria-label="Sign out"
                                >
                                    <LogOut className="w-4 h-4" />
                                </button>
                            </div>
                        ) : (
                            <Link
                                href="/login"
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-stone-900 text-white rounded-full text-xs font-semibold hover:bg-stone-800 whitespace-nowrap"
                            >
                                <LogIn className="w-3.5 h-3.5" />
                                Sign in
                            </Link>
                        )}
                    </div>
                </div>

                {/* OM42 — the three modes, above the recipe-only chips so it is
                    obvious the chips belong to Recipes and nothing else. */}
                <PrimaryNav />

                {/* Bottom Row: Category Chips (Recipes only) */}
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
