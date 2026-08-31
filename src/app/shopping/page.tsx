"use client";

// OM40 — the Shopping List tab.
//
// Max, 2026-08-25: "you select a dish and how many servings and it will just
// go straight there and tell you how much of each you will need."
//
// Three sections: the dishes you're cooking (each with a servings stepper),
// the ingredients those dishes need aggregated into one list, and Staples —
// pantry items flagged "we need this" plus anything typed in by hand.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
    Check, Loader2, Minus, Plus, Trash2, X, AlertCircle, RotateCcw, CheckCircle2,
} from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import {
    addExtra, announceListChanged, buildList, clearTicks, dishLineKeys, extraTickKey,
    finishTrip, getBasket, getExtras, getTicks, lineKey, pantryTickKey, removeExtra,
    removeFromBasket, serverNow, setBasketServings, setExtraChecked, setTick,
    syncServerClock, tripIsStale,
    type BasketRow, type ExtraRow, type TripResult,
} from "@/lib/shopping";
import { getPantryItems, type PantryItem } from "@/lib/pantry";
import AppShell from "@/components/AppShell";  // OM43
import { aisleFor, AISLE_ORDER, AISLE_LABEL, AISLE_EMOJI, type Aisle } from "@/lib/aisles";  // OM45

export default function ShoppingPage() {
    const router = useRouter();
    const { user, loading: authLoading } = useAuth();

    const [basket, setBasket] = useState<BasketRow[]>([]);
    const [extras, setExtras] = useState<ExtraRow[]>([]);
    const [needed, setNeeded] = useState<PantryItem[]>([]);
    const [ticks, setTicks] = useState<Set<string>>(new Set());
    // OM46 — the clock the hour-long auto-finish runs off.
    const [lastTickAt, setLastTickAt] = useState<Date | null>(null);
    const [loading, setLoading] = useState(true);
    const [draft, setDraft] = useState("");
    // OM46 — the outcome of the last finished trip, manual or automatic. An
    // auto-finish that happens silently is indistinguishable from the list
    // losing your shopping, so it always leaves something on screen.
    const [trip, setTrip] = useState<(TripResult & { auto: boolean }) | null>(null);
    const [finishing, setFinishing] = useState(false);
    const [finishError, setFinishError] = useState<string | null>(null);
    // Guards the auto-finish against firing twice — the 60s interval and a
    // re-render can both reach it before the first `load()` has come back.
    const autoFiring = useRef(false);

    // Every setState happens after the await: touching state synchronously in
    // the effect below trips react-hooks/set-state-in-effect, and the page
    // starts in `loading` anyway.
    const load = useCallback(async () => {
        // The auto-finish measures an hour, so it measures it against the
        // server's clock rather than this device's. Cheap and cached.
        const [b, e, t, p] = await Promise.all([
            getBasket(), getExtras(), getTicks(), getPantryItems(), syncServerClock(),
        ]);
        setBasket(b);
        setExtras(e);
        setTicks(t.keys);
        setLastTickAt(t.lastAt);
        setNeeded(p.filter((i) => i.needed));
        setLoading(false);
    }, []);

    useEffect(() => {
        if (authLoading) return;
        if (!user) { router.replace("/login?next=/shopping"); return; }
        // `load` awaits before it touches state, so no render cascades here.
        void load();
    }, [authLoading, user, router, load]);

    const { lines, unscalable } = useMemo(() => buildList(basket), [basket]);

    // OM45 — one lap of the shop instead of an alphabetical zig-zag between
    // the fruit and the freezer.
    const grouped = useMemo(() => {
        const byAisle = new Map<Aisle, typeof lines>();
        for (const line of lines) {
            const a = aisleFor(line.item);
            const list = byAisle.get(a) ?? [];
            list.push(line);
            byAisle.set(a, list);
        }
        return AISLE_ORDER
            .map((a) => ({ aisle: a, items: byAisle.get(a) ?? [] }))
            .filter((g) => g.items.length > 0);
    }, [lines]);

    const outstanding = lines.filter((l) => !ticks.has(lineKey(l))).length
        + extras.filter((e) => !ticks.has(extraTickKey(e.id))).length
        + needed.filter((i) => !ticks.has(pantryTickKey(i.id))).length;

    const toggle = async (key: string) => {
        const next = new Set(ticks);
        if (next.has(key)) next.delete(key); else next.add(key);
        setTicks(next);                        // optimistic — the shop has bad wifi
        setLastTickAt(new Date(serverNow()));  // ticking is activity: restart the hour
        setTrip(null);                         // a new tick means a new trip
        await setTick(key, next.has(key));
        announceListChanged();                 // keep the nav badge honest
    };

    // OM46 — "either a finished shopping button, or if it is left more than an
    // hour". Both routes run the same thing; the timeout is just the button
    // nobody remembered to press on the walk home.
    const finish = useCallback(async (auto: boolean) => {
        setFinishing(true);
        setFinishError(null);
        try {
            const result = await finishTrip(
                basket, needed.map((i) => i.id), extras.map((e) => e.id), ticks,
            );
            if (result.failed) {
                // Nothing was cleared, so pressing the button again is safe and
                // is the right advice. Silently showing "finished" here would be
                // the worst outcome: the ticks would look spent and not be.
                setFinishError("Couldn't save all of that — your ticks are still here. Try again in a moment.");
            } else {
                setTrip({ ...result, auto });
            }
            await load();
            announceListChanged();
        } catch (e) {
            console.error('finishTrip:', e);
            setFinishError("Couldn't save all of that — your ticks are still here. Try again in a moment.");
        } finally {
            setFinishing(false);
        }
    }, [basket, needed, extras, ticks, load]);

    // The stale check runs on load and then every minute the tab stays open, so
    // an hour spent with the list open ends the same way an hour spent away
    // from it does.
    useEffect(() => {
        if (loading || finishing) return;
        const check = () => {
            if (autoFiring.current) return;
            if (!tripIsStale(lastTickAt, ticks)) return;
            autoFiring.current = true;
            void finish(true).finally(() => { autoFiring.current = false; });
        };
        check();
        const timer = setInterval(check, 60_000);
        return () => clearInterval(timer);
    }, [loading, finishing, lastTickAt, ticks, finish]);

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
                <div className="flex items-center gap-2 flex-nowrap text-sm whitespace-nowrap">
                    <span className="px-4 py-1.5 rounded-full bg-white border border-stone-200 text-stone-600">
                        {basket.length} dish{basket.length === 1 ? "" : "es"}
                    </span>
                    <span className="px-4 py-1.5 rounded-full bg-white border border-stone-200 text-stone-600">
                        {lines.filter((l) => !ticks.has(lineKey(l))).length} ingredients to get
                    </span>
                    <span className="px-4 py-1.5 rounded-full bg-white border border-stone-200 text-stone-600">
                        {needed.filter((i) => !ticks.has(pantryTickKey(i.id))).length
                            + extras.filter((e) => !ticks.has(extraTickKey(e.id))).length} staples
                    </span>
                    {ticks.size > 0 && (
                        <span className="px-4 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 font-medium flex items-center gap-1.5">
                            <Check className="w-3.5 h-3.5" />
                            {ticks.size} in the basket
                        </span>
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
                {finishError && (
                    <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
                        <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                        <p className="flex-1 text-sm text-amber-900">{finishError}</p>
                        <button
                            onClick={() => setFinishError(null)}
                            className="p-1 text-amber-600/60 hover:text-amber-900" aria-label="Dismiss"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                )}

                {/* ── The trip that just closed ──────────────────────────── */}
                {trip && (
                    <div className="flex items-start gap-3 bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3">
                        <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-0.5 flex-shrink-0" />
                        <div className="flex-1 text-sm text-emerald-900">
                            <p className="font-semibold">
                                {trip.auto
                                    ? "Shopping finished automatically"
                                    : "Shopping finished"}
                                {" — "}{trip.bought} item{trip.bought === 1 ? "" : "s"} bought
                            </p>
                            <p className="text-xs text-emerald-800/80 mt-0.5">
                                {trip.auto && "The list sat untouched for over an hour, so what you'd ticked is marked bought. "}
                                {trip.dishesDone.length > 0 && `Nothing left to buy for ${trip.dishesDone.join(", ")}. `}
                                {trip.staplesRestocked > 0 && `${trip.staplesRestocked} staple${trip.staplesRestocked === 1 ? "" : "s"} back in the pantry. `}
                                {outstanding > 0
                                    ? `${outstanding} thing${outstanding === 1 ? "" : "s"} you didn't tick are still on the list.`
                                    : "Nothing left on the list."}
                            </p>
                        </div>
                        <button
                            onClick={() => setTrip(null)}
                            className="p-1 text-emerald-600/60 hover:text-emerald-900" aria-label="Dismiss"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                )}

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
                                        {/* OM46 — a dish whose ingredients are all bought stays
                                            here and says so, rather than being deleted for you.
                                            Ingredients aggregate across dishes, so "all bought"
                                            can be true because of a DIFFERENT dish's shopping. */}
                                        {dishLineKeys(row).length === 0 ? (
                                            <p className="text-xs text-emerald-700 flex items-center gap-1">
                                                <Check className="w-3 h-3" /> nothing left to buy
                                            </p>
                                        ) : (
                                            <p className="text-xs text-stone-400">
                                                {row.recipes?.servings
                                                    ? `recipe serves ${row.recipes.servings}`
                                                    : "base servings unknown — quantities shown as written"}
                                            </p>
                                        )}
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
                                <button
                                    onClick={async () => {
                                        await clearTicks();
                                        setTicks(new Set());
                                        setLastTickAt(null);
                                        setTrip(null);
                                    }}
                                    className="text-xs text-stone-400 hover:text-stone-900 flex items-center gap-1"
                                >
                                    <RotateCcw className="w-3 h-3" /> untick everything
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

                        {grouped.map(({ aisle, items }) => {
                            // OM46 — a ticked line STAYS on the list, in place, green
                            // and struck through. Max asked to see the tick; a line
                            // that vanishes the moment you tick it also leaves you no
                            // way to spot the one you mis-tapped.
                            //
                            // Deliberately NOT re-sorted to sink ticked lines: the
                            // first cut did that and the list shuffled under your
                            // thumb between taps, so the next one landed on the wrong
                            // item. A stable order is the whole point of the aisle
                            // grouping — you are walking past these shelves in order.
                            const visible = items;
                            const togo = items.filter((line) => !ticks.has(lineKey(line))).length;
                            if (!visible.length) return null;
                            return (
                              <div key={aisle} className="mb-4">
                                <h3 className="text-[11px] font-bold uppercase tracking-wider text-stone-400 mb-1.5 px-1">
                                    <span className="mr-1.5">{AISLE_EMOJI[aisle]}</span>{AISLE_LABEL[aisle]}
                                    <span className="ml-1.5 font-medium normal-case tracking-normal text-stone-300">
                                        {togo === 0 ? "all in the basket" : togo}
                                    </span>
                                </h3>
                        <ul className="bg-white border border-stone-100 rounded-2xl divide-y divide-stone-100 overflow-hidden">
                            {visible
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
                              </div>
                            );
                        })}
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

                        {/* OM46 — a staple now TICKS like everything else. It used
                            to un-flag the pantry item on click, so the row simply
                            vanished: no tick, no green, and no way back if you
                            tapped the wrong one. The pantry is only updated when
                            the trip is finished. */}
                        {needed.map((item) => {
                            const key = pantryTickKey(item.id);
                            const done = ticks.has(key);
                            return (
                                <div key={item.id} className="flex items-center gap-3 px-4 py-3 border-b border-stone-100">
                                    <button
                                        onClick={() => void toggle(key)}
                                        className={`w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 ${done ? "bg-emerald-600 border-emerald-600" : "border-stone-300 hover:border-emerald-600"}`}
                                        aria-label={done ? `Untick ${item.display_name}` : `Got ${item.display_name}`}
                                        aria-pressed={done}
                                    >
                                        {done && <Check className="w-3.5 h-3.5 text-white" />}
                                    </button>
                                    <span className={`flex-1 text-sm text-stone-900 ${done ? "line-through opacity-40" : ""}`}>
                                        {item.display_name}
                                    </span>
                                    <span className={`text-[11px] ${done ? "text-emerald-700" : "text-stone-400"}`}>
                                        {done ? "in the basket" : "low in pantry"}
                                    </span>
                                </div>
                            );
                        })}

                        {extras.map((extra) => {
                            const key = extraTickKey(extra.id);
                            const done = ticks.has(key);
                            return (
                                <div key={extra.id} className="flex items-center gap-3 px-4 py-3 border-b border-stone-100">
                                    <button
                                        onClick={async () => {
                                            await toggle(key);
                                            // Keep the legacy `checked` column honest —
                                            // shopping_ticks is the source of truth now.
                                            await setExtraChecked(extra.id, !done);
                                        }}
                                        className={`w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 ${done ? "bg-emerald-600 border-emerald-600" : "border-stone-300 hover:border-emerald-600"}`}
                                        aria-label={done ? `Untick ${extra.label}` : `Got ${extra.label}`}
                                        aria-pressed={done}
                                    >
                                        {done && <Check className="w-3.5 h-3.5 text-white" />}
                                    </button>
                                    <span className={`flex-1 text-sm text-stone-900 ${done ? "line-through opacity-40" : ""}`}>
                                        {extra.label}
                                    </span>
                                    <button
                                        onClick={async () => { await removeExtra(extra.id); void load(); }}
                                        className="p-1 text-stone-300 hover:text-red-600" aria-label="Remove"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            );
                        })}

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

                {/* ── End of the shop ────────────────────────────────────── */}
                {ticks.size > 0 && (
                    <section className="pb-4">
                        <button
                            onClick={() => void finish(false)}
                            disabled={finishing}
                            className="w-full flex items-center justify-center gap-2 px-5 py-3.5 rounded-2xl bg-emerald-600 text-white font-semibold hover:bg-emerald-700 disabled:opacity-60"
                        >
                            {finishing
                                ? <Loader2 className="w-4 h-4 animate-spin" />
                                : <CheckCircle2 className="w-4 h-4" />}
                            Finished shopping — {ticks.size} item{ticks.size === 1 ? "" : "s"}
                        </button>
                        <p className="text-[11px] text-stone-400 text-center mt-2">
                            Everything ticked comes off the list.
                            {outstanding > 0 && ` The ${outstanding} you haven't ticked stay${outstanding === 1 ? "s" : ""} on it.`}
                            {" "}Leave the list an hour and this happens on its own.
                        </p>
                    </section>
                )}
            </div>
        </AppShell>
    );
}
