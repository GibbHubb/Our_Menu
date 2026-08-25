"use client";

// OM40 — "select a dish and how many servings" from anywhere in the app.
//
// Two shapes, one behaviour: the card gets a quick + (adds at the recipe's own
// yield), the recipe page gets a stepper so you can say "actually, six of us".
// Either way it upserts, so pressing it twice adjusts rather than duplicating.

import { useState } from "react";
import { Check, Loader2, Minus, Plus, ShoppingCart } from "lucide-react";
import { addToBasket } from "@/lib/shopping";

interface Props {
    recipeId: string;
    /** The recipe's own yield; the starting point for the stepper. */
    baseServings?: number | null;
    variant?: "button" | "icon";
    className?: string;
}

export default function AddToListButton({ recipeId, baseServings, variant = "button", className = "" }: Props) {
    const [servings, setServings] = useState(baseServings && baseServings > 0 ? baseServings : 4);
    const [saving, setSaving] = useState(false);
    const [done, setDone] = useState(false);

    const add = async () => {
        setSaving(true);
        const ok = await addToBasket(recipeId, servings);
        setSaving(false);
        if (ok) {
            setDone(true);
            setTimeout(() => setDone(false), 2200);
        }
    };

    if (variant === "icon") {
        return (
            <button
                onClick={(e) => { e.stopPropagation(); void add(); }}
                className={`p-1.5 rounded-full backdrop-blur-sm transition-colors ${
                    done ? "bg-emerald-600 text-white" : "bg-white/90 text-stone-700 hover:bg-white"
                } ${className}`}
                title={done ? "On the shopping list" : "Add to shopping list"}
                aria-label="Add to shopping list"
            >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : done ? <Check className="w-3.5 h-3.5" />
                    : <ShoppingCart className="w-3.5 h-3.5" />}
            </button>
        );
    }

    return (
        <div className={`flex items-center gap-2 ${className}`}>
            <div className="flex items-center gap-1 bg-stone-50 border border-stone-200 rounded-full px-1">
                <button onClick={() => setServings((s) => Math.max(1, s - 1))} className="p-1.5 text-stone-500 hover:text-stone-900" aria-label="Fewer servings">
                    <Minus className="w-3.5 h-3.5" />
                </button>
                <span className="text-sm font-semibold text-stone-900 w-6 text-center tabular-nums">{servings}</span>
                <button onClick={() => setServings((s) => Math.min(50, s + 1))} className="p-1.5 text-stone-500 hover:text-stone-900" aria-label="More servings">
                    <Plus className="w-3.5 h-3.5" />
                </button>
            </div>
            <button
                onClick={() => void add()}
                disabled={saving}
                className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-colors ${
                    done ? "bg-emerald-600 text-white" : "bg-stone-900 text-white hover:bg-stone-800"
                }`}
            >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : done ? <Check className="w-4 h-4" /> : <ShoppingCart className="w-4 h-4" />}
                {done ? "On the list" : `Add ${servings} servings to list`}
            </button>
        </div>
    );
}
