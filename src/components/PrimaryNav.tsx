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
import { extraTickKey, getList, getTicks, LIST_CHANGED_EVENT } from "@/lib/shopping";

const TABS = [
    { href: "/", label: "Recipes", icon: BookOpen },
    { href: "/pantry", label: "Pantry", icon: Refrigerator },
    { href: "/shopping", label: "Shopping list", icon: ShoppingCart },
];

export function BottomNav() {
    const pathname = usePathname();
    const { user } = useAuth();
    const toBuy = useToBuyCount(user, pathname);
    const isActive = (href: string) =>
        href === "/" ? pathname === "/" : pathname.startsWith(href);

    return (
        <nav
            className="sm:hidden fixed bottom-0 inset-x-0 z-50 bg-stone-50/95 backdrop-blur-md border-t border-stone-200"
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
            <div className="flex">
                {TABS.map(({ href, label, icon: Icon }) => {
                    const active = isActive(href);
                    return (
                        <Link
                            key={href}
                            href={href}
                            className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold transition-colors ${
                                active ? "text-stone-900" : "text-stone-400"
                            }`}
                        >
                            <span className="relative">
                                <Icon className={`w-6 h-6 ${active ? "" : "opacity-70"}`} />
                                {href === "/shopping" && toBuy !== null && toBuy > 0 && (
                                    <span className="absolute -top-1.5 -right-2.5 min-w-[1.1rem] px-1 py-0.5 rounded-full bg-amber-500 text-white text-[10px] font-bold leading-none text-center">
                                        {toBuy}
                                    </span>
                                )}
                            </span>
                            {label}
                        </Link>
                    );
                })}
            </div>
        </nav>
    );
}

/** Shared so the header tabs and the bottom bar can never show different counts. */
function useToBuyCount(user: ReturnType<typeof useAuth>["user"], pathname: string) {
    const [toBuy, setToBuy] = useState<number | null>(null);
    // OM46 — bumped by the list-changed event below. Route changes were the only
    // trigger, so while you stood on /shopping ticking things off the badge kept
    // showing the count you started with.
    const [nonce, setNonce] = useState(0);

    useEffect(() => {
        const bump = () => setNonce((n) => n + 1);
        window.addEventListener(LIST_CHANGED_EVENT, bump);
        return () => window.removeEventListener(LIST_CHANGED_EVENT, bump);
    }, []);

    useEffect(() => {
        let alive = true;
        void (async () => {
            if (!user) { if (alive) setToBuy(null); return; }
            const [rows, ticks] = await Promise.all([getList(), getTicks()]);
            if (!alive) return;
            // OM49 — one list, so one count. It used to add up three sources
            // and could disagree with the page it was counting.
            //
            // OM46 — something already ticked is in the basket, so it is not
            // "still to buy": the badge counted them until the trip was
            // finished, which is exactly when the number stopped mattering.
            setToBuy(rows.filter((r) => !ticks.keys.has(extraTickKey(r.id))).length);
        })();
        return () => { alive = false; };
    }, [user, pathname, nonce]);
    return toBuy;
}

export default function PrimaryNav() {
    const pathname = usePathname();
    const { user } = useAuth();
    // Uses the same hook the bottom bar does — this component carried its own
    // copy of the count, which is the drift the hook's comment warns about.
    const toBuy = useToBuyCount(user, pathname);

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
