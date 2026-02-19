
"use client";

import React, { useState, useEffect } from "react";
import { Check, Copy } from "lucide-react";
import { ParsedItem, parseIngredientLine, formatQuantity } from "@/lib/recipeUtils";

interface ShoppingListProps {
    initialList: string;
}

export default function ShoppingList({ initialList }: ShoppingListProps) {
    const [scale, setScale] = useState(1);
    const [items, setItems] = useState<ParsedItem[]>([]);
    const [showCopied, setShowCopied] = useState(false);

    // Initial parsing
    useEffect(() => {
        if (!initialList) {
            setItems([]);
            return;
        }

        const lines = initialList.split('\n').filter(line => line.trim().length > 0);
        const parsed: ParsedItem[] = lines.map((line, idx) => parseIngredientLine(line, idx));

        setItems(parsed);
    }, [initialList]);

    const handleToggle = (id: string) => {
        setItems(prev => prev.map(item =>
            item.id === id ? { ...item, isChecked: !item.isChecked } : item
        ));
    };

    const handleScale = (newScale: number) => {
        if (newScale < 0.5) return;
        setScale(newScale);
    };

    const handleCopy = () => {
        const linesToCopy = items
            .filter(item => item.isChecked)
            .map(item => {
                let text = item.name;
                if (item.quantity !== null) {
                    text = `${formatQuantity(item.quantity * scale)} ${item.name}`;
                }
                // Apple Notes checklist format
                return `- [ ] ${text}`;
            });

        navigator.clipboard.writeText(linesToCopy.join('\n'))
            .then(() => {
                setShowCopied(true);
                setTimeout(() => setShowCopied(false), 2000);
            })
            .catch(err => console.error("Failed to copy:", err));
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
                    // Calculate display quantity
                    const displayQty = item.quantity !== null
                        ? formatQuantity(item.quantity * scale)
                        : null;

                    return (
                        <div
                            key={item.id}
                            onClick={() => handleToggle(item.id)}
                            className={`
                                cursor-pointer group flex items-start gap-3 p-3 rounded-lg transition-colors select-none
                                ${item.isChecked ? 'bg-emerald-50/50 border-emerald-100' : 'bg-white hover:bg-stone-50 border-transparent'}
                                border
                            `}
                        >
                            <div className={`
                                flex-shrink-0 mt-0.5 w-5 h-5 rounded border flex items-center justify-center transition-colors
                                ${item.isChecked
                                    ? 'bg-emerald-500 border-emerald-500 text-white'
                                    : 'bg-white border-stone-300 group-hover:border-emerald-400'}
                            `}>
                                {item.isChecked && <Check className="w-3.5 h-3.5" />}
                            </div>

                            <div className={`flex-1 text-sm leading-snug ${item.isChecked ? 'text-stone-900' : 'text-stone-500'}`}>
                                {displayQty && <span className="font-bold mr-1.5">{displayQty}</span>}
                                <span className={item.isChecked ? '' : 'line-through opacity-70'}>
                                    {item.name}
                                </span>
                                {item.isStandard && (
                                    <span className="ml-2 text-[10px] uppercase font-bold tracking-widest text-stone-400 bg-stone-100 px-1.5 py-0.5 rounded">
                                        Pantry
                                    </span>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
