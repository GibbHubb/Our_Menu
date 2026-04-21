
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Check, Copy, HelpCircle, Loader2 } from "lucide-react";
import { ParsedItem, parseIngredientLine, formatQuantity } from "@/lib/recipeUtils";
import { supabase } from "@/lib/supabaseClient";

interface Substitution { name: string; note: string; }

interface ShoppingListProps {
    initialList: string;
    scale: number;
    setScale: (s: number) => void;
    recipeId?: string;
    checkedMap?: Record<string, boolean>;
    recipeName?: string;
    recipeIngredients?: string;
}

export default function ShoppingList({ initialList, scale, setScale, recipeId, checkedMap, recipeName, recipeIngredients }: ShoppingListProps) {
    const [items, setItems] = useState<ParsedItem[]>([]);
    const [showCopied, setShowCopied] = useState(false);
    const [checked, setChecked] = useState<Record<string, boolean>>(checkedMap ?? {});
    // OM8 — substitution state per item id
    const [subs, setSubs] = useState<Record<string, Substitution[]>>({});
    const [subsLoading, setSubsLoading] = useState<string | null>(null);
    const [subsError, setSubsError] = useState<Record<string, string>>({});

    const fetchSubstitutions = async (item: ParsedItem) => {
        if (subsLoading) return;
        setSubsLoading(item.id);
        setSubsError((prev) => ({ ...prev, [item.id]: '' }));
        try {
            const res = await fetch('/api/substitutions', {
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

    const handleCopy = () => {
        const textLines: string[] = [];
        const htmlLines: string[] = [];

        items.filter(item => checked[checkedKey(item.name)]).forEach(item => {
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
                    <button
                        onClick={handleCopy}
                        className="flex items-center gap-2 bg-stone-900 text-white px-4 py-2 rounded-lg text-sm font-bold shadow hover:bg-stone-800 transition-all active:scale-95"
                    >
                        {showCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                        {showCopied ? "Copied!" : "Copy List"}
                    </button>
                </div>
            </div>

            {/* List */}
            <div className="space-y-2">
                {items.map((item) => {
                    const displayQty = item.quantity !== null
                        ? formatQuantity(item.quantity * scale)
                        : null;
                    const isChecked = !!checked[checkedKey(item.name)];
                    const itemSubs = subs[item.id];
                    const itemSubError = subsError[item.id];
                    const isLoadingSubs = subsLoading === item.id;

                    return (
                        <div key={item.id}>
                            <div
                                onClick={() => handleToggle(item)}
                                className={`
                                    cursor-pointer group flex items-start gap-3 p-3 rounded-lg transition-colors select-none
                                    ${isChecked ? 'bg-emerald-50/50 border-emerald-100' : 'bg-white hover:bg-stone-50 border-transparent'}
                                    border
                                `}
                            >
                                <div className={`
                                    flex-shrink-0 mt-0.5 w-5 h-5 rounded border flex items-center justify-center transition-colors
                                    ${isChecked
                                        ? 'bg-emerald-500 border-emerald-500 text-white'
                                        : 'bg-white border-stone-300 group-hover:border-emerald-400'}
                                `}>
                                    {isChecked && <Check className="w-3.5 h-3.5" />}
                                </div>

                                <div className={`flex-1 text-sm leading-snug ${isChecked ? 'text-stone-900' : 'text-stone-500'}`}>
                                    {displayQty && <span className="font-bold mr-1.5">{displayQty}</span>}
                                    <span className={isChecked ? '' : 'line-through opacity-70'}>
                                        {item.name}
                                    </span>
                                    {item.isStandard && (
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
