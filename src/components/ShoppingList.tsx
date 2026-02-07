
"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Check, Copy, Minus, Plus, RefreshCw } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface ShoppingListProps {
    initialList: string;
}

interface ParsedItem {
    original: string;
    name: string;
    quantity: number | null;
    unit: string | null;
    isStandard: boolean;
    isChecked: boolean;
    id: string; // unique derived id
}

const STANDARD_ITEMS = [
    "salt", "pepper", "black pepper", "white pepper",
    "oil", "olive oil", "vegetable oil", "sunflower oil", "canola oil",
    "water",
    "sugar",
    "flour",
    "spices", "spice"
];

// Regex to find quantity at start: "1.5 cups...", "1/2 tsp...", "2 onions"
// Captures: 1: quantity (whole/float/fraction), 2: rest
const QUANTITY_REGEX = /^(\d+(?:\.\d+)?|\d+\/\d+)\s*(.*)$/;

const parseQuantity = (str: string): number => {
    if (str.includes('/')) {
        const [num, den] = str.split('/').map(Number);
        return den !== 0 ? num / den : 0;
    }
    return parseFloat(str);
};

// Simple decimal to fraction converter for display could be nice, but decimals are safer for now.
const formatQuantity = (num: number): string => {
    // 0.25 -> 1/4, 0.5 -> 1/2, 0.33 -> 1/3, 0.66 -> 2/3
    // For now, let's just do cleaner decimals
    if (Math.abs(num % 1) < 0.01) return num.toFixed(0);

    // Check common fractions
    const decimal = num % 1;
    const whole = Math.floor(num);

    const closeTo = (n: number, target: number) => Math.abs(n - target) < 0.05;

    let fraction = "";
    if (closeTo(decimal, 0.25)) fraction = "1/4";
    else if (closeTo(decimal, 0.33)) fraction = "1/3";
    else if (closeTo(decimal, 0.5)) fraction = "1/2";
    else if (closeTo(decimal, 0.66)) fraction = "2/3";
    else if (closeTo(decimal, 0.75)) fraction = "3/4";

    if (fraction) {
        return whole > 0 ? `${whole} ${fraction}` : fraction;
    }

    // Default to 1 decimal place if small, 2 if needed
    return num.toFixed(1).replace(/\.0$/, '');
};

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

        const parsed: ParsedItem[] = lines.map((line, idx) => {
            const cleanLine = line.trim().replace(/^[-*•]\s*/, ''); // Remove bullet points
            const match = cleanLine.match(QUANTITY_REGEX);

            let quantity: number | null = null;
            let rest = cleanLine;

            if (match) {
                quantity = parseQuantity(match[1]);
                rest = match[2];
            }

            // Check if standard
            // We check if the name part contains any of the standard keywords as a whole word
            const lowerRest = rest.toLowerCase();
            const isStandard = STANDARD_ITEMS.some(si =>
                lowerRest === si ||
                lowerRest.startsWith(si + ' ') ||
                lowerRest.endsWith(' ' + si) ||
                lowerRest.includes(' ' + si + ' ')
            );

            return {
                original: cleanLine,
                name: rest,
                quantity,
                unit: null, // Basic unit extraction implies more complexity, skipping for now
                isStandard,
                isChecked: !isStandard, // Standard items UNCHECKED by default, others CHECKED
                id: `item-${idx}`
            };
        });

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
                if (item.quantity !== null) {
                    return `${formatQuantity(item.quantity * scale)} ${item.name}`;
                }
                return item.name;
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
                <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-stone-600">Scale:</span>
                    <div className="flex items-center bg-white rounded-lg border border-stone-200 shadow-sm">
                        <button
                            onClick={() => handleScale(scale - 0.5)}
                            className="p-2 hover:bg-stone-50 text-stone-600 disabled:opacity-30"
                            disabled={scale <= 0.5}
                        >
                            <Minus className="w-4 h-4" />
                        </button>
                        <span className="w-12 text-center font-bold text-stone-800">{scale}x</span>
                        <button
                            onClick={() => handleScale(scale + 0.5)}
                            className="p-2 hover:bg-stone-50 text-stone-600"
                        >
                            <Plus className="w-4 h-4" />
                        </button>
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
