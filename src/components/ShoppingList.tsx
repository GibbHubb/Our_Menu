
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Check, Copy, HelpCircle, Loader2, ShoppingCart, ArrowRight } from "lucide-react";
import Link from "next/link";
import { ParsedItem, parseIngredientLine, formatQuantity } from "@/lib/recipeUtils";
import { supabase } from "@/lib/supabaseClient";
import { apiFetch } from "@/lib/apiFetch";  // OM35(b)
import { copyLinesToList, toCopyLine } from "@/lib/shopping";  // OM49

interface Substitution { name: string; note: string; }

interface ShoppingListProps {
    initialList: string;
    scale: number;
    setScale: (s: number) => void;
    recipeId?: string;
    checkedMap?: Record<string, boolean>;
    recipeName?: string;
    recipeIngredients?: string;
    /** OM42 — the recipe's own yield, so the scale can be shown as servings. */
    baseServings?: number | null;
}

export default function ShoppingList({ initialList, scale, setScale, recipeId, checkedMap, recipeName, recipeIngredients, baseServings }: ShoppingListProps) {
    const [items, setItems] = useState<ParsedItem[]>([]);
    const [showCopied, setShowCopied] = useState(false);
    const [checked, setChecked] = useState<Record<string, boolean>>(checkedMap ?? {});
    // OM8 — substitution state per item id
    const [subs, setSubs] = useState<Record<string, Substitution[]>>({});
    const [subsLoading, setSubsLoading] = useState<string | null>(null);
    const [subsError, setSubsError] = useState<Record<string, string>>({});
    // OM49 — INCLUSION, not exclusion. Max + Bron, 2026-08-27: "we are no longer
    // treating this like a pantry tracker... we want the boxes to be blank to
    // start". This replaces OM42's `excluded` set, where everything was on the
    // list unless taken off and the app subtracted whatever it believed was in
    // the cupboard — which is why 8 of 13 lines arrived pre-ticked and 5 arrived
    // struck through as IN PANTRY. Nothing is on the list until someone puts it
    // there, and the app holds no opinion about what you already own.
    const [included, setIncluded] = useState<Set<string>>(new Set());
    const [adding, setAdding] = useState(false);
    const [added, setAdded] = useState(false);
    const [addError, setAddError] = useState<string | null>(null);

    const fetchSubstitutions = async (item: ParsedItem) => {
        if (subsLoading) return;
        setSubsLoading(item.id);
        setSubsError((prev) => ({ ...prev, [item.id]: '' }));
        try {
            const res = await apiFetch('/api/substitutions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ingredient: item.name, recipeName, recipeIngredients }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
            setSubs((prev) => ({ ...prev, [item.id]: data.substitutions ?? [] }));
        } catch (err) {
            setSubsError((prev) => ({ ...prev, [item.id]: err instanceof Error ? err.message : String(err) }));
        } finally {
            setSubsLoading(null);
        }
    };

    // Parse items from the ingredient list
    useEffect(() => {
        if (!initialList) {
            setItems([]);
            return;
        }
        const lines = initialList.split('\n').filter(line => line.trim().length > 0);
        const parsed: ParsedItem[] = lines.map((line, idx) => parseIngredientLine(line, idx));
        setItems(parsed);
    }, [initialList]);

    // Initialise checked state from prop
    useEffect(() => {
        if (checkedMap) setChecked(checkedMap);
    }, [checkedMap]);

    // OM6 — Supabase Realtime subscription for shared checked state
    useEffect(() => {
        if (!recipeId) return;

        const channel = supabase
            .channel(`shopping-${recipeId}`)
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'recipes',
                    filter: `id=eq.${recipeId}`,
                },
                (payload) => {
                    const newChecked = (payload.new as Record<string, unknown>).shopping_list_checked;
                    if (newChecked && typeof newChecked === 'object') {
                        setChecked(newChecked as Record<string, boolean>);
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [recipeId]);

    // Normalise key for the checked map (trim + lowercase)
    const checkedKey = (name: string) => name.trim().toLowerCase();

    const handleToggle = useCallback((item: ParsedItem) => {
        const key = checkedKey(item.name);
        const newVal = !checked[key];
        const updated = { ...checked, [key]: newVal };
        setChecked(updated);

        // Persist to Supabase (optimistic — local state already updated)
        if (recipeId) {
            supabase
                .from('recipes')
                .update({ shopping_list_checked: updated })
                .eq('id', recipeId)
                .then(({ error }) => {
                    if (error) console.error('Failed to sync checked state:', error);
                });
        }
    }, [checked, recipeId]);

    const handleScale = (newScale: number) => {
        if (newScale < 0.5) return;
        setScale(newScale);
    };

    // OM49 — "selected" means "put this on the shopping list", and nothing is
    // selected until you say so. Every ingredient is offered on equal terms:
    // no pantry subtraction, no staple gets a head start.
    //
    // Keyed by the LINE, not by the canonical ingredient (OM49 review finding
    // 7): "1 red onion" and "1 onion" canonicalise to the same thing, so a
    // shared key made two rows move one checkbox. That was latent while ticking
    // was a side note; it is the primary action now.
    const isSelected = useCallback((item: ParsedItem) => included.has(item.id), [included]);

    const toggleSelected = useCallback((item: ParsedItem) => {
        setIncluded((prev) => {
            const next = new Set(prev);
            if (next.has(item.id)) next.delete(item.id); else next.add(item.id);
            return next;
        });
    }, []);

    /** OM42 — servings the scale slider currently represents. */
    const scaledServings = baseServings && baseServings > 0
        ? Math.max(1, Math.round(baseServings * scale))
        : null;

    const selectedItems = items.filter(isSelected);

    /**
     * OM49 — copy the ticked lines onto the shopping list, at the servings on
     * screen.
     *
     * This replaces `addToBasket(recipeId, servings, excluded)`. That call sent
     * every UNticked line as the dish's `excluded` array, which the shopping
     * page then subtracted from a live projection — and since `included` starts
     * empty on every page load, a second Add for the same recipe sent the first
     * Add's ingredients as excluded and wiped it (it also clobbered the bought
     * keys `finishTrip` wrote into that same column). An exclusion wire format
     * cannot express an inclusion UI; the ticket's own plan said this "works
     * as-is" and it did not.
     *
     * The line is re-parsed from its ORIGINAL text rather than from the display
     * name, so the amount and its unit survive the trip and can be merged
     * against on the other side: 2 cans here plus 1 can from another recipe is
     * one line reading 3 cans.
     */
    const handleAddToList = async () => {
        setAdding(true);
        const lines = items
            .filter(isSelected)
            .map((i) => toCopyLine(i.original, scale, i.name));
        const { added: newRows, merged, failed } = await copyLinesToList(lines);
        setAdding(false);
        // Only clear the ticks that actually landed somewhere — a silent
        // failure that also empties the screen leaves nothing to retry from.
        if (failed === 0 && newRows + merged > 0) {
            setIncluded(new Set());
            setAdded(true);
            setTimeout(() => setAdded(false), 3000);
        } else if (failed > 0) {
            setAddError(`${failed} item${failed === 1 ? "" : "s"} didn't make it onto the list — try again.`);
            setTimeout(() => setAddError(null), 5000);
        }
    };

    // OM49 review finding 6 — this copied only the ticked lines, which in the
    // new "everything starts blank" default is nothing at all: it put an empty
    // string on the clipboard and still flashed "Copied!". Tick something and
    // it copies your selection; tick nothing and it copies the recipe, which is
    // what a button called "Copy List" on a recipe page means.
    const handleCopy = () => {
        const textLines: string[] = [];
        const htmlLines: string[] = [];
        const chosen = selectedItems.length ? selectedItems : items;

        chosen
            .forEach(item => {
            let text = item.name;
            if (item.quantity !== null) {
                text = `${formatQuantity(item.quantity * scale)} ${item.name}`;
            }
            textLines.push(`- [ ] ${text}`);
            htmlLines.push(`<li><input type="checkbox" /> ${text}</li>`);
        });

        const textStr = textLines.join('\n');
        const htmlStr = `<ul class="checklist" style="list-style-type: none; padding: 0;">\n${htmlLines.join('\n')}\n</ul>`;

        const clipboardItem = new ClipboardItem({
            'text/plain': new Blob([textStr], { type: 'text/plain' }),
            'text/html': new Blob([htmlStr], { type: 'text/html' })
        });

        navigator.clipboard.write([clipboardItem]).then(() => {
            setShowCopied(true);
            setTimeout(() => setShowCopied(false), 2000);
        }).catch(err => {
            console.error("Failed to copy richly:", err);
            navigator.clipboard.writeText(textStr).then(() => {
                setShowCopied(true);
                setTimeout(() => setShowCopied(false), 2000);
            });
        });
    };

    if (!items.length) return <div className="text-stone-400 italic">No items found.</div>;

    return (
        <div className="space-y-4">
            {/* Controls */}
            <div className="flex flex-wrap items-center justify-between gap-4 bg-stone-50 p-3 rounded-xl border border-stone-100">
                <div className="flex items-center gap-4 w-full sm:w-auto">
                    <div className="flex flex-col gap-1 w-full sm:w-48">
                        <div className="flex justify-between items-end">
                            <label htmlFor="servings-slider" className="text-xs font-bold uppercase tracking-wider text-stone-500">
                                Servings / Meals
                            </label>
                            <span className="font-bold text-stone-900 bg-white px-2 py-0.5 rounded border border-stone-200 text-sm">
                                {scale}x
                            </span>
                        </div>
                        <input
                            id="servings-slider"
                            type="range"
                            min="0.5"
                            max="10"
                            step="0.5"
                            value={scale}
                            onChange={(e) => handleScale(parseFloat(e.target.value))}
                            className="w-full h-2 bg-stone-200 rounded-lg appearance-none cursor-pointer accent-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-400"
                        />
                        <div className="flex justify-between text-[10px] text-stone-400 font-mono">
                            <span>0.5</span>
                            <span>5</span>
                            <span>10</span>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {scaledServings && (
                        <span className="text-xs text-stone-500 mr-1">
                            = {scaledServings} serving{scaledServings === 1 ? '' : 's'}
                        </span>
                    )}
                    <button
                        onClick={handleCopy}
                        className="flex items-center gap-2 bg-stone-900 text-white px-4 py-2 rounded-lg text-sm font-bold shadow hover:bg-stone-800 transition-all active:scale-95"
                    >
                        {showCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                        {showCopied ? "Copied!" : "Copy List"}
                    </button>
                </div>
            </div>

            {/* OM42 — one way to get these onto the shopping list. The recipe
                page used to carry this list AND a separate "Add to list" panel
                that ignored it; Max: "see how we have done it twice". */}
            {recipeId && (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                        onClick={() => void handleAddToList()}
                        disabled={adding || selectedItems.length === 0}
                        className={`flex-1 min-w-[220px] py-2.5 px-4 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50 ${
                            added ? 'bg-emerald-600 text-white' : 'bg-stone-900 text-white hover:bg-stone-800'
                        }`}
                    >
                        {adding ? <Loader2 className="w-4 h-4 animate-spin" />
                            : added ? <Check className="w-4 h-4" />
                            : <ShoppingCart className="w-4 h-4" />}
                        {added
                            ? 'Added to the shopping list'
                            : `Add ${selectedItems.length} item${selectedItems.length === 1 ? '' : 's'} to shopping list`}
                    </button>
                    <Link
                        href="/shopping"
                        className="px-4 py-2.5 rounded-lg text-sm font-semibold bg-stone-100 text-stone-700 hover:bg-stone-200 flex items-center gap-1.5"
                    >
                        Shopping list <ArrowRight className="w-4 h-4" />
                    </Link>
                </div>
            )}

            {addError && (
                <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    {addError}
                </p>
            )}

            {/* List */}
            <div className="space-y-2">
                {items.map((item) => {
                    const displayQty = item.quantity !== null
                        ? formatQuantity(item.quantity * scale)
                        : null;
                    const itemSubs = subs[item.id];
                    const itemSubError = subsError[item.id];
                    const isLoadingSubs = subsLoading === item.id;
                    const selected = isSelected(item);

                    return (
                        <div key={item.id}>
                            <div
                                onClick={() => toggleSelected(item)}
                                className={`
                                    cursor-pointer group flex items-start gap-3 p-3 rounded-lg transition-colors select-none border
                                    ${selected
                                        ? 'bg-emerald-50/60 border-emerald-200'
                                        : 'bg-white hover:bg-stone-50 border-stone-200'}
                                `}
                            >
                                <div className={`
                                    flex-shrink-0 mt-0.5 w-5 h-5 rounded border flex items-center justify-center transition-colors
                                    ${selected
                                        ? 'bg-emerald-600 border-emerald-600 text-white'
                                        : 'bg-white border-stone-300 group-hover:border-emerald-400'}
                                `}>
                                    {selected && <Check className="w-3.5 h-3.5" />}
                                </div>

                                {/* OM49 — an unticked line is a normal line, not a
                                    dismissed one. It used to render struck through
                                    and faded, which was survivable when only the
                                    pantry items started off; now that everything
                                    starts off, that styling would strike out the
                                    whole recipe. Ticking adds emphasis instead. */}
                                <div className="flex-1 text-sm leading-snug text-stone-900">
                                    {/* The space is a real character, not just `mr-1.5` —
                                        a margin is invisible to copy/paste and to a
                                        screen reader, which both read "2cans tomatoes". */}
                                    {displayQty && <><span className="font-bold">{displayQty}</span>{" "}</>}
                                    <span className={selected ? 'font-medium' : ''}>
                                        {item.name}
                                    </span>
                                </div>

                                {/* OM8 — "I don't have this" button */}
                                <button
                                    onClick={(e) => { e.stopPropagation(); fetchSubstitutions(item); }}
                                    disabled={isLoadingSubs}
                                    title="I don't have this — suggest substitutes"
                                    className="flex-shrink-0 p-1.5 text-stone-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors disabled:opacity-50"
                                >
                                    {isLoadingSubs ? <Loader2 className="w-4 h-4 animate-spin" /> : <HelpCircle className="w-4 h-4" />}
                                </button>
                            </div>

                            {/* Substitutions panel */}
                            {itemSubs && itemSubs.length > 0 && (
                                <div className="ml-8 mt-1 mb-2 p-3 bg-indigo-50/60 border border-indigo-100 rounded-lg text-xs space-y-1.5">
                                    <div className="font-bold text-indigo-900 text-[11px] uppercase tracking-wide">Try instead:</div>
                                    {itemSubs.map((s, i) => (
                                        <div key={i}>
                                            <span className="font-semibold text-indigo-900">{s.name}</span>
                                            <span className="text-indigo-700/80"> — {s.note}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                            {itemSubError && (
                                <div className="ml-8 mt-1 mb-2 text-xs text-red-600">{itemSubError}</div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
