"use client";

// OM40 — the Shopping List tab.
//
// Max, 2026-08-25: "you select a dish and how many servings and it will just
// go straight there and tell you how much of each you will need."
//
// Three sections: the dishes you're cooking (each with a servings stepper),
// the ingredients those dishes need aggregated into one list, and Staples —
// pantry items flagged "we need this" plus anything typed in by hand.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
    ArrowLeft, Check, Loader2, Minus, Plus, ShoppingCart, Trash2, X, AlertCircle, RotateCcw,
} from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import {
    addExtra, buildList, clearTicks, getBasket, getExtras, getTicks, lineKey,
    removeExtra, removeFromBasket, setBasketServings, setExtraChecked, setTick,
    type BasketRow, type ExtraRow,
} from "@/lib/shopping";
import { getPantryItems, setPantryNeeded, type PantryItem } from "@/lib/pantry";
import AppShell from "@/components/AppShell";  // OM43

export default function ShoppingPage() {
    const router = useRouter();
    const { user, loading: authLoading } = useAuth();

    const [basket, setBasket] = useState<BasketRow[]>([]);
    const [extras, setExtras] = useState<ExtraRow[]>([]);
    const [needed, setNeeded] = useState<PantryItem[]>([]);
    const [ticks, setTicks] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(true);
    const [draft, setDraft] = useState("");
    // OM42 — Max: "they should be on need to buy until they are ticked off and
    // then they should be removed". Ticked lines leave the list; this reveals
    // them again, because "removed" must not mean "unrecoverable".
    const [showDone, setShowDone] = useState(false);

    // Every setState happens after the await: touching state synchronously in
    // the effect below trips react-hooks/set-state-in-effect, and the page
    // starts in `loading` anyway.
    const load = useCallback(async () => {
        const [b, e, t, p] = await Promise.all([
            getBasket(), getExtras(), getTicks(), getPantryItems(),
        ]);
        setBasket(b);
        setExtras(e);
        setTicks(t);
        setNeeded(p.filter((i) => i.needed));
        setLoading(false);
    }, []);

    useEffect(() => {
        if (authLoading) return;
        if (!user) { router.replace("/login?next=/shopping"); return; }
        // `load` awaits before it touches state, so no render cascades here —
        // the compiler rule can't see through the async boundary.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void load();
    }, [authLoading, user, router, load]);

    const { lines, unscalable } = useMemo(() => buildList(basket), [basket]);

    const outstanding = lines.filter((l) => !ticks.has(lineKey(l))).length
        + extras.filter((e) => !e.checked).length
        + needed.length;

    const toggle = async (key: string) => {
        const next = new Set(ticks);
        if (next.has(key)) next.delete(key); else next.add(key);
        setTicks(next);                        // optimistic — the shop has bad wifi
        await setTick(key, next.has(key));
    };

    const changeServings = async (row: BasketRow, delta: number) => {
        const next = Math.min(50, Math.max(1, row.servings + delta));
        if (next === row.servings) return;
        setBasket((rows) => rows.map((r) => (r.id === row.id ? { ...r, servings: next } : r)));
        await setBasketServings(row.id, next);
    };

    if (authLoading || loading) {
        return (
            <div className="min-h-screen bg-stone-50 flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-stone-400" />
            </div>
        );
    }

    return (
        <AppShell
            width="narrow"
            subnav={
                /* OM43 — occupies the row Recipes uses for category chips and
                   Pantry for sections, so all three headers are one height. */
                <div className="flex items-center gap-2 flex-wrap text-sm">
                    <span className="px-4 py-1.5 rounded-full bg-white border border-stone-200 text-stone-600">
                        {basket.length} dish{basket.length === 1 ? "" : "es"}
                    </span>
                    <span className="px-4 py-1.5 rounded-full bg-white border border-stone-200 text-stone-600">
                        {lines.filter((l) => !ticks.has(lineKey(l))).length} ingredients to get
                    </span>
                    <span className="px-4 py-1.5 rounded-full bg-white border border-stone-200 text-stone-600">
                        {needed.length + extras.filter((e) => !e.checked).length} staples
                    </span>
                    {ticks.size > 0 && (
                        <button
                            onClick={() => setShowDone((v) => !v)}
                            className="px-4 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 font-medium hover:bg-emerald-100"
                        >
                            {ticks.size} in the basket
                        </button>
                    )}
                </div>
            }
            toolbar={
                <p className="text-sm text-stone-500">
                    <span className="font-serif text-lg text-stone-900 mr-2">Shopping list</span>
                    {outstanding === 0 ? "nothing left to buy" : `${outstanding} still to get`}
                </p>
            }
        >
            <div className="space-y-8">
                {/* ── Dishes ─────────────────────────────────────────────── */}
                <section>
                    <h2 className="text-xs font-bold uppercase tracking-wider text-stone-500 mb-3">
                        Dishes ({basket.length})
                    </h2>

                    {basket.length === 0 ? (
                        <div className="bg-white border border-stone-100 rounded-2xl p-8 text-center">
                            <p className="text-stone-600 text-sm mb-4">
                                No dishes picked yet. Open a recipe and hit <strong>Add to shopping list</strong>,
                                or use the <strong>+</strong> on any card.
                            </p>
                            <Link href="/" className="inline-block px-5 py-2 bg-stone-900 text-white rounded-full text-sm font-semibold hover:bg-stone-800">
                                Browse the menu
                            </Link>
                        </div>
                    ) : (
                        <ul className="space-y-2">
                            {basket.map((row) => (
                                <li key={row.id} className="bg-white border border-stone-100 rounded-xl p-3 flex items-center gap-3">
                                    {row.recipes?.image_url && (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={row.recipes.image_url} alt="" className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
                                    )}
                                    <div className="flex-1 min-w-0">
                                        <p className="font-medium text-stone-900 text-sm truncate">
                                            {row.recipes?.title ?? "Recipe"}
                                        </p>
                                        <p className="text-xs text-stone-400">
                                            {row.recipes?.servings
                                                ? `recipe serves ${row.recipes.servings}`
                                                : "base servings unknown — quantities shown as written"}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-1 bg-stone-50 border border-stone-200 rounded-full px-1">
                                        <button onClick={() => void changeServings(row, -1)} className="p-1.5 text-stone-500 hover:text-stone-900" aria-label="Fewer servings">
                                            <Minus className="w-3.5 h-3.5" />
                                        </button>
                                        <span className="text-sm font-semibold text-stone-900 w-6 text-center tabular-nums">{row.servings}</span>
                                        <button onClick={() => void changeServings(row, 1)} className="p-1.5 text-stone-500 hover:text-stone-900" aria-label="More servings">
                                            <Plus className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                    <button
                                        onClick={async () => { await removeFromBasket(row.id); void load(); }}
                                        className="p-2 text-stone-300 hover:text-red-600" aria-label="Remove dish"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>

                {/* ── Ingredients ────────────────────────────────────────── */}
                {lines.length > 0 && (
                    <section>
                        <div className="flex items-center justify-between mb-3">
                            <h2 className="text-xs font-bold uppercase tracking-wider text-stone-500">
                                Ingredients ({lines.filter((l) => !ticks.has(lineKey(l))).length} to get)
                            </h2>
                            <div className="flex items-center gap-3">
                                {ticks.size > 0 && (
                                    <button
                                        onClick={() => setShowDone((v) => !v)}
                                        className="text-xs text-stone-500 hover:text-stone-900 underline underline-offset-2"
                                    >
                                        {showDone ? "hide" : "show"} {ticks.size} in the basket
                                    </button>
                                )}
                                <button
                                    onClick={async () => { await clearTicks(); setTicks(new Set()); }}
                                    className="text-xs text-stone-400 hover:text-stone-900 flex items-center gap-1"
                                >
                                    <RotateCcw className="w-3 h-3" /> start over
                                </button>
                            </div>
                        </div>

                        {unscalable.length > 0 && (
                            <div className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
                                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                                <span>
                                    No quantities on file for <strong>{unscalable.join(", ")}</strong> — those
                                    ingredients are listed as written and won&apos;t scale with servings.
                                </span>
                            </div>
                        )}

                        <ul className="bg-white border border-stone-100 rounded-2xl divide-y divide-stone-100 overflow-hidden">
                            {lines
                                .filter((line) => showDone || !ticks.has(lineKey(line)))
                                .map((line) => {
                                const key = lineKey(line);
                                const done = ticks.has(key);
                                return (
                                    <li key={key}>
                                        <button
                                            onClick={() => void toggle(key)}
                                            className={`w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-stone-50 ${done ? "opacity-40" : ""}`}
                                        >
                                            <span className={`mt-0.5 w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 ${done ? "bg-emerald-600 border-emerald-600" : "border-stone-300"}`}>
                                                {done && <Check className="w-3.5 h-3.5 text-white" />}
                                            </span>
                                            <span className="flex-1 min-w-0">
                                                <span className={`block text-sm text-stone-900 ${done ? "line-through" : ""}`}>
                                                    <strong className="tabular-nums">
                                                        {line.amounts.map((a) => a.display).join(" + ") || ""}
                                                    </strong>{" "}
                                                    {line.item}
                                                </span>
                                                {line.unparsed.length > 0 && (
                                                    <span className="block text-xs text-stone-400 mt-0.5">
                                                        also: {line.unparsed.join("; ")}
                                                    </span>
                                                )}
                                                <span className="block text-[11px] text-stone-400 mt-0.5 truncate">
                                                    {line.sources.join(" · ")}
                                                </span>
                                            </span>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    </section>
                )}

                {/* ── Staples ────────────────────────────────────────────── */}
                <section>
                    <h2 className="text-xs font-bold uppercase tracking-wider text-stone-500 mb-3">
                        Staples &amp; extras
                    </h2>

                    <div className="bg-white border border-stone-100 rounded-2xl overflow-hidden">
                        {needed.length === 0 && extras.length === 0 && (
                            <p className="px-4 py-6 text-sm text-stone-500 text-center">
                                Nothing flagged. Mark things you&apos;re low on in the{" "}
                                <Link href="/pantry" className="underline underline-offset-2">pantry</Link>, or add one below.
                            </p>
                        )}

                        {needed.map((item) => (
                            <div key={item.id} className="flex items-center gap-3 px-4 py-3 border-b border-stone-100">
                                <button
                                    onClick={async () => { await setPantryNeeded(item.id, false); void load(); }}
                                    className="w-5 h-5 rounded-md border border-stone-300 hover:border-emerald-600 flex-shrink-0"
                                    aria-label={`Got ${item.display_name}`}
                                />
                                <span className="flex-1 text-sm text-stone-900">{item.display_name}</span>
                                <span className="text-[11px] text-stone-400">low in pantry</span>
                            </div>
                        ))}

                        {extras.map((extra) => (
                            <div key={extra.id} className="flex items-center gap-3 px-4 py-3 border-b border-stone-100">
                                <button
                                    onClick={async () => { await setExtraChecked(extra.id, !extra.checked); void load(); }}
                                    className={`w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 ${extra.checked ? "bg-emerald-600 border-emerald-600" : "border-stone-300"}`}
                                    aria-label={extra.checked ? "Untick" : "Tick"}
                                >
                                    {extra.checked && <Check className="w-3.5 h-3.5 text-white" />}
                                </button>
                                <span className={`flex-1 text-sm text-stone-900 ${extra.checked ? "line-through opacity-40" : ""}`}>
                                    {extra.label}
                                </span>
                                <button
                                    onClick={async () => { await removeExtra(extra.id); void load(); }}
                                    className="p-1 text-stone-300 hover:text-red-600" aria-label="Remove"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        ))}

                        <form
                            onSubmit={async (e) => {
                                e.preventDefault();
                                if (!draft.trim()) return;
                                await addExtra(draft);
                                setDraft("");
                                void load();
                            }}
                            className="flex items-center gap-2 px-4 py-3"
                        >
                            <Plus className="w-4 h-4 text-stone-400" />
                            <input
                                value={draft}
                                onChange={(e) => setDraft(e.target.value)}
                                placeholder="Add something else…"
                                className="flex-1 bg-transparent text-sm focus:outline-none placeholder:text-stone-400"
                            />
                            {draft.trim() && (
                                <button type="submit" className="text-xs font-semibold text-stone-900 hover:underline">
                                    Add
                                </button>
                            )}
                        </form>
                    </div>
                </section>
            </div>
        </AppShell>
    );
}
