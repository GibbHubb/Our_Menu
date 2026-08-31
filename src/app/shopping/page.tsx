"use client";

// OM49 — the Shopping List tab. ONE list.
//
// Max + Bron, 2026-08-27: "we decide what we need for the meal, then the house,
// then make sure we bought it at the shops, then reset."
//
// It used to be three sections off three sources — Dishes (meal_basket, with a
// servings stepper), Ingredients (derived from those dishes, minus a pantry
// subtraction), and Staples (pantry rows flagged `needed`, plus hand-typed
// extras). Nothing on screen was a row you could point at. Now everything you
// ticked anywhere is one row here, and Checked out empties it.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
    Check, Copy, Loader2, Plus, Trash2, X, AlertCircle, RotateCcw, CheckCircle2,
} from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import {
    addExtra, announceListChanged, clearTicks, extraTickKey, finishTrip, getList,
    getTicks, listAmount, listLineText, removeFromList, serverNow, setTick,
    syncServerClock, tripIsStale, AUTO_FINISH_MS,
    type ListRow, type TripResult,
} from "@/lib/shopping";
import AppShell from "@/components/AppShell";  // OM43
import { aisleFor, AISLE_ORDER, AISLE_LABEL, AISLE_EMOJI, type Aisle } from "@/lib/aisles";  // OM45

const AUTO_FINISH_MINUTES = Math.round(AUTO_FINISH_MS / 60_000);

export default function ShoppingPage() {
    const router = useRouter();
    const { user, loading: authLoading } = useAuth();

    const [rows, setRows] = useState<ListRow[]>([]);
    const [ticks, setTicks] = useState<Set<string>>(new Set());
    // OM46 — the clock the inactivity auto-finish runs off.
    const [lastTickAt, setLastTickAt] = useState<Date | null>(null);
    const [loading, setLoading] = useState(true);
    const [draft, setDraft] = useState("");
    const [copied, setCopied] = useState(false);
    // "that was already on the list" — a merge with no amount changes nothing
    // visible, and silence reads as a dropped write.
    const [already, setAlready] = useState<string | null>(null);
    // OM46 — the outcome of the last finished trip, manual or automatic. An
    // auto-finish that happens silently is indistinguishable from the list
    // losing your shopping, so it always leaves something on screen.
    const [trip, setTrip] = useState<(TripResult & { auto: boolean }) | null>(null);
    const [finishing, setFinishing] = useState(false);
    const [finishError, setFinishError] = useState<string | null>(null);
    // Guards the auto-finish against firing twice — the interval and a
    // re-render can both reach it before the first `load()` has come back.
    const autoFiring = useRef(false);
    // Set when an automatic finish fails: without it the interval retries the
    // same failing delete every 60 seconds, forever, with nothing on screen
    // changing. A manual press is still allowed and clears it.
    const autoGaveUp = useRef(false);

    // Every setState happens after the await: touching state synchronously in
    // the effect below trips react-hooks/set-state-in-effect, and the page
    // starts in `loading` anyway.
    const load = useCallback(async () => {
        // The auto-finish measures minutes, so it measures them against the
        // server's clock rather than this device's. Cheap and cached.
        const [l, t] = await Promise.all([getList(), getTicks(), syncServerClock()]);
        setRows(l);
        setTicks(t.keys);
        setLastTickAt(t.lastAt);
        setLoading(false);
    }, []);

    useEffect(() => {
        if (authLoading) return;
        if (!user) { router.replace("/login?next=/shopping"); return; }
        // `load` awaits before it touches state, so no render cascades here.
        void load();
    }, [authLoading, user, router, load]);

    // OM45 — one lap of the shop instead of an alphabetical zig-zag between
    // the fruit and the freezer.
    const grouped = useMemo(() => {
        const byAisle = new Map<Aisle, ListRow[]>();
        for (const row of rows) {
            const a = aisleFor(row.label);
            const list = byAisle.get(a) ?? [];
            list.push(row);
            byAisle.set(a, list);
        }
        return AISLE_ORDER
            .map((a) => ({ aisle: a, items: byAisle.get(a) ?? [] }))
            .filter((g) => g.items.length > 0);
    }, [rows]);

    const ticked = rows.filter((r) => ticks.has(extraTickKey(r.id))).length;
    const outstanding = rows.length - ticked;

    const toggle = async (row: ListRow) => {
        const key = extraTickKey(row.id);
        const next = new Set(ticks);
        if (next.has(key)) next.delete(key); else next.add(key);
        setTicks(next);                        // optimistic — the shop has bad wifi
        setLastTickAt(new Date(serverNow()));  // ticking is activity: restart the clock
        setTrip(null);                         // a new tick means a new trip
        await setTick(key, next.has(key));
        announceListChanged();                 // keep the nav badge honest
    };

    // OM49 — "then we say checked out and it all resets". The timeout is the
    // same operation; it is just the button nobody remembered to press on the
    // walk home.
    const finish = useCallback(async (auto: boolean) => {
        setFinishing(true);
        setFinishError(null);
        try {
            // Reads the list and the ticks fresh — see finishTrip. An automatic
            // finish also re-checks idleness there, so this tab sitting open
            // cannot end a shop the other handset is still doing.
            const result = await finishTrip(auto);
            if (result.failed) {
                // Nothing was cleared, so pressing the button again is safe and
                // is the right advice. Silently showing "finished" here would be
                // the worst outcome: the ticks would look spent and not be.
                setFinishError("Couldn't save all of that — your ticks are still here. Try again in a moment.");
                // …and stop the timer retrying it every minute for the rest of
                // the day. The button is still there when the network is back.
                if (auto) autoGaveUp.current = true;
            } else if (result.bought > 0) {
                setTrip({ ...result, auto });
            }
            await load();
            announceListChanged();
        } catch (e) {
            console.error('finishTrip:', e);
            setFinishError("Couldn't save all of that — your ticks are still here. Try again in a moment.");
            if (auto) autoGaveUp.current = true;
        } finally {
            setFinishing(false);
        }
    }, [load]);

    // The stale check runs on load and then every minute the tab stays open, so
    // 15 minutes spent with the list open ends the same way 15 minutes spent
    // away from it does.
    useEffect(() => {
        if (loading || finishing) return;
        const check = () => {
            if (autoFiring.current || autoGaveUp.current) return;
            if (!tripIsStale(lastTickAt, ticks)) return;
            autoFiring.current = true;
            void finish(true).finally(() => { autoFiring.current = false; });
        };
        check();
        const timer = setInterval(check, 60_000);
        return () => clearInterval(timer);
    }, [loading, finishing, lastTickAt, ticks, finish]);

    // OM49 review finding 6 — Copy List used to copy whatever was ticked, which
    // in the new default state is nothing, and still flashed "Copied!" over an
    // empty clipboard. It copies the LIST, which is the thing it is named after.
    const handleCopy = async () => {
        if (!rows.length) return;
        const text = rows.map((r) => `- [ ] ${listLineText(r)}`).join("\n");
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (e) {
            console.error('copy:', e);
        }
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
                        {outstanding} to get
                    </span>
                    {ticked > 0 && (
                        <span className="px-4 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 font-medium flex items-center gap-1.5">
                            <Check className="w-3.5 h-3.5" />
                            {ticked} in the basket
                        </span>
                    )}
                    {rows.length > 0 && (
                        <button
                            onClick={() => void handleCopy()}
                            className="px-4 py-1.5 rounded-full bg-white border border-stone-200 text-stone-600 hover:bg-stone-50 flex items-center gap-1.5"
                        >
                            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                            {copied ? "Copied" : "Copy list"}
                        </button>
                    )}
                </div>
            }
            toolbar={
                <p className="text-sm text-stone-500">
                    <span className="font-serif text-lg text-stone-900 mr-2">Shopping list</span>
                    {rows.length === 0 ? "nothing on it" : outstanding === 0 ? "everything's in the basket" : `${outstanding} still to get`}
                </p>
            }
        >
            <div className="space-y-6">
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
                                {trip.auto ? "Checked out automatically" : "Checked out"}
                                {" — "}{trip.bought} item{trip.bought === 1 ? "" : "s"} bought
                            </p>
                            <p className="text-xs text-emerald-800/80 mt-0.5">
                                {trip.auto && `The list sat untouched for ${AUTO_FINISH_MINUTES} minutes, so what you'd ticked is off it. `}
                                {trip.remaining > 0
                                    ? `${trip.remaining} thing${trip.remaining === 1 ? "" : "s"} you didn't tick ${trip.remaining === 1 ? "is" : "are"} still on the list.`
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

                {/* ── The list ───────────────────────────────────────────── */}
                {rows.length === 0 ? (
                    <div className="bg-white border border-stone-100 rounded-2xl p-8 text-center">
                        <p className="text-stone-600 text-sm mb-4">
                            Nothing on the list yet. Open a recipe, set the servings and tick what you
                            need — then walk the <Link href="/pantry" className="underline underline-offset-2">pantry</Link> for
                            the rest of the house.
                        </p>
                        <Link href="/" className="inline-block px-5 py-2 bg-stone-900 text-white rounded-full text-sm font-semibold hover:bg-stone-800">
                            Browse the menu
                        </Link>
                    </div>
                ) : (
                    <section>
                        <div className="flex items-center justify-end mb-2">
                            {ticked > 0 && (
                                <button
                                    onClick={async () => {
                                        await clearTicks();
                                        setTicks(new Set());
                                        setLastTickAt(null);
                                        setTrip(null);
                                        announceListChanged();
                                    }}
                                    className="text-xs text-stone-400 hover:text-stone-900 flex items-center gap-1"
                                >
                                    <RotateCcw className="w-3 h-3" /> untick everything
                                </button>
                            )}
                        </div>

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
                            const togo = items.filter((r) => !ticks.has(extraTickKey(r.id))).length;
                            return (
                              <div key={aisle} className="mb-4">
                                <h3 className="text-[11px] font-bold uppercase tracking-wider text-stone-400 mb-1.5 px-1">
                                    <span className="mr-1.5">{AISLE_EMOJI[aisle]}</span>{AISLE_LABEL[aisle]}
                                    <span className="ml-1.5 font-medium normal-case tracking-normal text-stone-300">
                                        {togo === 0 ? "all in the basket" : togo}
                                    </span>
                                </h3>
                                <ul className="bg-white border border-stone-100 rounded-2xl divide-y divide-stone-100 overflow-hidden">
                                    {items.map((row) => {
                                        const done = ticks.has(extraTickKey(row.id));
                                        const amount = listAmount(row);
                                        return (
                                            <li key={row.id} className="flex items-center">
                                                <button
                                                    onClick={() => void toggle(row)}
                                                    className={`flex-1 flex items-start gap-3 px-4 py-3 text-left hover:bg-stone-50 ${done ? "opacity-40" : ""}`}
                                                    aria-pressed={done}
                                                    aria-label={done ? `Untick ${row.label}` : `Got ${row.label}`}
                                                >
                                                    <span className={`mt-0.5 w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 ${done ? "bg-emerald-600 border-emerald-600" : "border-stone-300"}`}>
                                                        {done && <Check className="w-3.5 h-3.5 text-white" />}
                                                    </span>
                                                    <span className={`flex-1 min-w-0 text-sm text-stone-900 ${done ? "line-through" : ""}`}>
                                                        {/* A real space, not just `mr-1`: a CSS margin is
                                                            invisible to anything that reads the text —
                                                            copy/paste and a screen reader both got
                                                            "3 canstinned tomatoes". */}
                                                        {amount && <><strong className="tabular-nums">{amount}</strong>{" "}</>}
                                                        {row.label}
                                                    </span>
                                                </button>
                                                <button
                                                    onClick={async () => {
                                                        await removeFromList(row.id);
                                                        announceListChanged();
                                                        void load();
                                                    }}
                                                    className="p-3 text-stone-300 hover:text-red-600" aria-label={`Remove ${row.label}`}
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
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

                {/* ── Type something on ──────────────────────────────────── */}
                <form
                    onSubmit={async (e) => {
                        e.preventDefault();
                        if (!draft.trim()) return;
                        // Keep what was typed unless it actually landed: the
                        // input used to be cleared regardless, so a failed write
                        // silently ate it with nothing on screen to say so.
                        const { added, merged, failed } = await addExtra(draft);
                        if (failed > 0) {
                            setFinishError("Couldn't add that — it's still in the box, try again.");
                        } else {
                            setDraft("");
                            if (added === 0 && merged > 0) {
                                setFinishError(null);
                                setAlready(draft.trim());
                                setTimeout(() => setAlready(null), 3000);
                            }
                        }
                        void load();
                    }}
                    className="flex items-center gap-2 px-4 py-3 bg-white border border-stone-100 rounded-2xl"
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
                {already && (
                    <p className="text-xs text-stone-500 -mt-4 px-4">
                        “{already}” was already on the list.
                    </p>
                )}

                {/* ── End of the shop ────────────────────────────────────── */}
                {ticked > 0 && (
                    <section className="pb-4">
                        <button
                            onClick={() => { autoGaveUp.current = false; void finish(false); }}
                            disabled={finishing}
                            className="w-full flex items-center justify-center gap-2 px-5 py-3.5 rounded-2xl bg-emerald-600 text-white font-semibold hover:bg-emerald-700 disabled:opacity-60"
                        >
                            {finishing
                                ? <Loader2 className="w-4 h-4 animate-spin" />
                                : <CheckCircle2 className="w-4 h-4" />}
                            Checked out — {ticked} item{ticked === 1 ? "" : "s"}
                        </button>
                        <p className="text-[11px] text-stone-400 text-center mt-2">
                            Everything ticked comes off the list.
                            {outstanding > 0 && ` The ${outstanding} you haven't ticked stay${outstanding === 1 ? "s" : ""} on it.`}
                            {" "}Leave the list {AUTO_FINISH_MINUTES} minutes and this happens on its own.
                        </p>
                    </section>
                )}
            </div>
        </AppShell>
    );
}
