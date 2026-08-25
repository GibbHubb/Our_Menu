
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Check, Copy, HelpCircle, Loader2, ShoppingCart, ArrowRight } from "lucide-react";
import Link from "next/link";
import { ParsedItem, parseIngredientLine, formatQuantity } from "@/lib/recipeUtils";
import { supabase } from "@/lib/supabaseClient";
import { apiFetch } from "@/lib/apiFetch";  // OM35(b)
import { canonicaliseIngredient } from "@/lib/ingredients";
import { usePantry } from "@/lib/usePantry";
import { addToBasket } from "@/lib/shopping";  // OM42

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
    // OM12 — pantry-aware subtraction. Items whose canonical key is in the
    // pantry are flagged "in-pantry" and hidden from the printable Copy List.
    const { keys: pantryKeys, loaded: pantryLoaded } = usePantry();
    // OM8 — substitution state per item id
    const [subs, setSubs] = useState<Record<string, Substitution[]>>({});
    const [subsLoading, setSubsLoading] = useState<string | null>(null);
    const [subsError, setSubsError] = useState<Record<string, string>>({});
    // OM42 — which lines go on the shopping list. Everything you don't already
    // have starts selected; pantry staples start off. Max, 2026-08-25:
    // "everything but the pantry to be selected".
    const [excluded, setExcluded] = useState<Set<string>>(new Set());
    const [adding, setAdding] = useState(false);
    const [added, setAdded] = useState(false);

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

    const isInPantry = useCallback((item: ParsedItem) => {
        if (!pantryLoaded) return false;
        return pantryKeys.has(canonicaliseIngredient(item.name));
    }, [pantryKeys, pantryLoaded]);

    // OM42 — "selected" means "put this on the shopping list". The default is
    // everything you do NOT already have; pantry staples start off. Before this,
    // an item that was neither in the pantry nor ticked rendered struck-through
    // and faded — i.e. the things you actually needed to buy looked like the
    // ones you could ignore.
    const isSelected = useCallback((item: ParsedItem) => {
        const key = canonicaliseIngredient(item.name) || checkedKey(item.name);
        if (excluded.has(key)) return false;
        if (isInPantry(item)) return false;
        // `isStandard` is the "PANTRY" badge — salt, oil, the cup of pasta
        // cooking water. Nobody buys those for a specific recipe, so they start
        // off too; tick one if you actually are out of it.
        if (item.isStandard) return false;
        return true;
    }, [excluded, isInPantry]);

    const toggleSelected = useCallback((item: ParsedItem) => {
        const key = canonicaliseIngredient(item.name) || checkedKey(item.name);
        setExcluded((prev) => {
            const next = new Set(prev);
            // Unticking a normal item excludes it; ticking a pantry item means
            // "actually, buy this too", which is the same switch inverted.
            if (isSelected(item)) next.add(key); else next.delete(key);
            return next;
        });
    }, [isSelected]);

    /** OM42 — servings the scale slider currently represents. */
    const scaledServings = baseServings && baseServings > 0
        ? Math.max(1, Math.round(baseServings * scale))
        : null;

    const selectedItems = items.filter(isSelected);

    const handleAddToList = async () => {
        if (!recipeId) return;
        setAdding(true);
        const keys = items
            .filter((i) => !isSelected(i))
            .map((i) => canonicaliseIngredient(i.name) || checkedKey(i.name))
            .filter(Boolean);
        const ok = await addToBasket(recipeId, scaledServings ?? Math.max(1, Math.round(4 * scale)), keys);
        setAdding(false);
        if (ok) { setAdded(true); setTimeout(() => setAdded(false), 3000); }
    };

    const handleCopy = () => {
        const textLines: string[] = [];
        const htmlLines: string[] = [];

        items
            .filter(isSelected)
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

            {/* List */}
            <div className="space-y-2">
                {items.map((item) => {
                    const displayQty = item.quantity !== null
                        ? formatQuantity(item.quantity * scale)
                        : null;
                    const itemSubs = subs[item.id];
                    const itemSubError = subsError[item.id];
                    const isLoadingSubs = subsLoading === item.id;
                    const inPantry = isInPantry(item);
                    const selected = isSelected(item);

                    return (
                        <div key={item.id}>
                            <div
                                onClick={() => toggleSelected(item)}
                                className={`
                                    cursor-pointer group flex items-start gap-3 p-3 rounded-lg transition-colors select-none border
                                    ${selected
                                        ? 'bg-white hover:bg-stone-50 border-stone-200'
                                        : 'bg-stone-50/60 border-transparent'}
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

                                <div className={`flex-1 text-sm leading-snug ${selected ? 'text-stone-900' : 'text-stone-400'}`}>
                                    {displayQty && <span className="font-bold mr-1.5">{displayQty}</span>}
                                    <span className={selected ? '' : 'line-through decoration-stone-300'}>
                                        {item.name}
                                    </span>
                                    {inPantry && (
                                        <span className="ml-2 text-[10px] uppercase font-bold tracking-widest text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">
                                            In pantry
                                        </span>
                                    )}
                                {!inPantry && item.isStandard && (
                                        <span className="ml-2 text-[10px] uppercase font-bold tracking-widest text-stone-400 bg-stone-100 px-1.5 py-0.5 rounded">
                                            Pantry
                                        </span>
                                    )}
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
