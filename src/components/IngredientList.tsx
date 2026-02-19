"use client";

import React, { useState, useEffect } from "react";
import { Copy, Check } from "lucide-react";
import { ParsedItem, parseIngredientLine, formatQuantity } from "@/lib/recipeUtils";

interface IngredientListProps {
    ingredients: string;
}

export default function IngredientList({ ingredients }: IngredientListProps) {
    const [scale, setScale] = useState(1);
    const [items, setItems] = useState<ParsedItem[]>([]);
    const [showCopied, setShowCopied] = useState(false);

    useEffect(() => {
        if (!ingredients) {
            setItems([]);
            return;
        }
        const lines = ingredients.split('\n').filter(line => line.trim().length > 0);
        setItems(lines.map((line, idx) => parseIngredientLine(line, idx)));
    }, [ingredients]);

    const handleScale = (newScale: number) => {
        if (newScale < 0.5) return;
        setScale(newScale);
    };

    const handleCopy = () => {
        const text = items.map(item => {
            let itemText = item.name;
            if (item.quantity !== null) {
                itemText = `${formatQuantity(item.quantity * scale)} ${item.name}`;
            }
            return itemText;
        }).join('\n');

        navigator.clipboard.writeText(text).then(() => {
            setShowCopied(true);
            setTimeout(() => setShowCopied(false), 2000);
        });
    };

    if (!items.length) return <div className="text-stone-400 italic">No ingredients listed.</div>;

    return (
        <div className="space-y-4">
            {/* Scale Controls */}
            <div className="flex items-center justify-between mb-4 border-b border-stone-100 pb-2">
                <h3 className="text-xl font-serif font-bold text-stone-900">Ingredients</h3>

                <div className="flex items-center gap-4">
                    {/* Slider (Small version) */}
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-stone-500 uppercase">Scale:</span>
                        <input
                            type="range"
                            min="0.5"
                            max="5"
                            step="0.5"
                            value={scale}
                            onChange={(e) => handleScale(parseFloat(e.target.value))}
                            className="w-20 h-1.5 bg-stone-200 rounded-lg appearance-none cursor-pointer accent-stone-900"
                            title={`Scale: ${scale}x`}
                        />
                        <span className="text-xs font-mono w-6">{scale}x</span>
                    </div>

                    <button
                        onClick={handleCopy}
                        className="text-sm text-stone-500 hover:text-stone-900 flex items-center gap-1 px-2 py-1 hover:bg-stone-100 rounded transition-colors"
                        title="Copy Ingredients"
                    >
                        {showCopied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                        <span className="hidden sm:inline">{showCopied ? "Copied" : "Copy"}</span>
                    </button>
                </div>
            </div>

            {/* List */}
            <div className="space-y-1">
                {items.map((item) => {
                    const displayQty = item.quantity !== null
                        ? formatQuantity(item.quantity * scale)
                        : null;

                    return (
                        <div key={item.id} className="text-stone-700 leading-relaxed flex items-start gap-2">
                            <span className="mt-2 w-1.5 h-1.5 rounded-full bg-stone-300 flex-shrink-0" />
                            <span>
                                {displayQty && <span className="font-bold mr-1">{displayQty}</span>}
                                {item.name}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
