"use client";

// OM43 — one chrome for all three tabs.
//
// Max, 2026-08-25: "when clicking between recipes, pantry and shopping list it
// feels like a massive change — the layout changes quite significantly for all
// 3, can we make that smoother."
//
// He was right, and it was three separate headers: Recipes had a stone-50
// sticky bar at max-w-7xl, Pantry a WHITE bar at max-w-2xl with a back arrow,
// Shopping a third one at max-w-3xl. Same app, three chromes, so every tab
// click repainted the whole screen.
//
// Now every page renders this: identical bar, identical width, identical
// position for the brand, the tabs and the account. Only the row beneath
// changes, and it changes in place.

import Link from "next/link";
import { ChefHat, LogIn, LogOut, User as UserIcon, Users } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { useUnitSystem } from "@/lib/useUnitSystem";
import PrimaryNav from "./PrimaryNav";

interface AppShellProps {
    /** Sits to the right of the tabs — the search box on Recipes, a count elsewhere. */
    toolbar?: React.ReactNode;
    /** A full-width row under the tabs: category chips, pantry sections. */
    subnav?: React.ReactNode;
    children: React.ReactNode;
    /** Lists read better narrow; the grid needs the room. Chrome stays identical. */
    width?: "wide" | "narrow";
}

export default function AppShell({ toolbar, subnav, children, width = "wide" }: AppShellProps) {
    const { user, loading, signOut } = useAuth();
    const [unitSystem, setUnitSystemPref] = useUnitSystem();  // OM27
    const inner = width === "narrow" ? "max-w-3xl" : "max-w-6xl";

    return (
        <div className="min-h-screen bg-stone-50 font-sans pb-20">
            <header className="sticky top-0 z-50 bg-stone-50/95 backdrop-blur-md border-b border-stone-200 shadow-sm">
                <div className="max-w-6xl mx-auto px-4 py-3 space-y-3">

                    {/* Row 1 — who we are, who you are. Identical on every tab. */}
                    <div className="flex items-center gap-3">
                        <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                            <div className="p-2 bg-stone-900 rounded-full">
                                <ChefHat className="w-5 h-5 text-stone-50" />
                            </div>
                            <h1 className="text-xl sm:text-2xl font-serif text-stone-900 tracking-tight whitespace-nowrap">
                                Max &amp; Bron
                            </h1>
                        </Link>

                        <div className="flex-1" />

                        <button
                            onClick={() => setUnitSystemPref(unitSystem === "metric" ? "us" : "metric")}
                            className="px-2.5 py-1.5 text-xs font-semibold rounded-full bg-stone-100 text-stone-700 hover:bg-stone-200 border border-stone-200"
                            title="Toggle metric / US display units"
                            aria-label="Toggle unit system"
                        >
                            {unitSystem === "metric" ? "g / ml" : "oz / cup"}
                        </button>

                        {loading ? (
                            <div className="w-9 h-9 rounded-full bg-stone-100 animate-pulse" aria-hidden />
                        ) : user ? (
                            <div className="flex items-center gap-1">
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

                    {/* Row 2 — the three tabs, always in the same place. */}
                    <div className="flex items-center gap-3 flex-wrap">
                        <PrimaryNav />
                        {toolbar && <div className="flex-1 min-w-[200px]">{toolbar}</div>}
                    </div>

                    {/* Row 3 — whatever this tab needs. Fixed height so the
                        page beneath starts at the same y on every tab: without
                        it Recipes stood 50px taller than Pantry and the content
                        jumped under the cursor on every switch. */}
                    {subnav && <div className="min-h-[34px] flex items-center">{subnav}</div>}
                </div>
            </header>

            <main className={`${inner} mx-auto px-4 py-6`}>{children}</main>
        </div>
    );
}
