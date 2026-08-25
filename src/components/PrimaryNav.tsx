"use client";

// OM42 — the three places this app actually is.
//
// Max, 2026-08-25: "lets try to clean up all of the little tabs we have built
// up — mainly I want the pantry and the shopping list to be a bit more
// prevalent... Bronte and I really want to start using this as the place we
// use our shopping list."
//
// Recipes / Pantry / Shopping list were a cart icon, a fridge icon and a
// people icon crammed beside the unit toggle. They are the app's three modes,
// so they get to look like it. The shopping list carries a live count, because
// the number of things left to buy is the single most useful thing to know
// without opening it.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Refrigerator, ShoppingCart } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { buildList, getBasket, getExtras, getTicks, lineKey } from "@/lib/shopping";
import { getPantryItems } from "@/lib/pantry";

const TABS = [
    { href: "/", label: "Recipes", icon: BookOpen },
    { href: "/pantry", label: "Pantry", icon: Refrigerator },
    { href: "/shopping", label: "Shopping list", icon: ShoppingCart },
];

export default function PrimaryNav() {
    const pathname = usePathname();
    const { user } = useAuth();
    const [toBuy, setToBuy] = useState<number | null>(null);

    useEffect(() => {
        let alive = true;
        void (async () => {
            // Every setState lives inside the async body: touching state
            // synchronously here trips react-hooks/set-state-in-effect.
            if (!user) { if (alive) setToBuy(null); return; }
            const [basket, extras, ticks, pantry] = await Promise.all([
                getBasket(), getExtras(), getTicks(), getPantryItems(),
            ]);
            if (!alive) return;
            const { lines } = buildList(basket);
            setToBuy(
                lines.filter((l) => !ticks.has(lineKey(l))).length
                + extras.filter((e) => !e.checked).length
                + pantry.filter((p) => p.needed).length,
            );
        })();
        return () => { alive = false; };
    }, [user, pathname]);

    const isActive = (href: string) =>
        href === "/" ? pathname === "/" : pathname.startsWith(href);

    return (
        <nav className="flex items-center gap-1 bg-stone-100/80 p-1 rounded-full">
            {TABS.map(({ href, label, icon: Icon }) => {
                const active = isActive(href);
                return (
                    <Link
                        key={href}
                        href={href}
                        className={`relative flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
                            active
                                ? "bg-stone-900 text-white shadow-sm"
                                : "text-stone-600 hover:bg-white hover:text-stone-900"
                        }`}
                    >
                        <Icon className="w-4 h-4" />
                        <span className="hidden sm:inline">{label}</span>
                        {href === "/shopping" && toBuy !== null && toBuy > 0 && (
                            <span
                                className={`ml-0.5 min-w-[1.25rem] px-1.5 py-0.5 rounded-full text-[11px] font-bold leading-none flex items-center justify-center ${
                                    active ? "bg-white text-stone-900" : "bg-amber-500 text-white"
                                }`}
                                title={`${toBuy} still to buy`}
                            >
                                {toBuy}
                            </span>
                        )}
                    </Link>
                );
            })}
        </nav>
    );
}
