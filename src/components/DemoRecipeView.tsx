"use client";

// OM70 — the read-only recipe page a signed-out visitor sees for a demo
// recipe. It deliberately shares nothing with the real recipe page's data
// layer: no Supabase, no cook log, no notes, no shopping list, no edit. The
// only interactive part is the servings scaler, which is local state.
import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import IngredientList from "@/components/IngredientList";
import { useAuth } from "@/lib/AuthContext";
import type { Recipe } from "@/lib/types";

const PLACEHOLDER_METHOD = ["Click card to view recipe.", "See full recipe at RecipeTin Eats."];

export default function DemoRecipeView({ recipe }: { recipe: Recipe }) {
    const router = useRouter();
    const [scale, setScale] = useState(1);
    // A signed-in member can still land here from an old link: tell them it's
    // a sample, and send them to their own menu rather than to "Log in".
    const { user } = useAuth();
    const goBack = () => {
        // A visitor who arrived straight from a shared link has no in-app history.
        if (typeof window !== "undefined" && window.history.length > 1) router.back();
        else router.push("/");
    };

    const hasLink = !!recipe.link;
    const ingredients = recipe.ingredients?.trim() ?? "";
    const isPlaceholderIngredients = ingredients.includes("See full recipe at");
    const method = recipe.instructions?.trim() ?? "";
    const hasRealMethod = !!method && !PLACEHOLDER_METHOD.includes(method);

    return (
        <div className="min-h-screen bg-stone-50 font-sans pb-20">
            <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:px-3 focus:py-2 focus:rounded-lg focus:bg-stone-900 focus:text-white focus:text-sm">Skip to content</a>
            <div className="bg-white sticky top-0 z-40 border-b border-stone-100 px-4 py-3 flex items-center justify-between shadow-sm">
                <button onClick={goBack} aria-label="Back" className="p-2 -ml-2 text-stone-600 hover:bg-stone-100 rounded-full transition-colors">
                    <ArrowLeft className="w-6 h-6" />
                </button>
                <span className="font-serif font-bold text-stone-900 truncate max-w-[60%]">{recipe.title}</span>
                <Link href={user ? "/" : "/login"} className="px-4 py-1.5 bg-stone-900 text-white rounded-full text-sm font-medium hover:bg-stone-800">
                    {user ? "Your menu" : "Log in"}
                </Link>
            </div>

            <main id="main" tabIndex={-1} className="outline-none">
                <div className="max-w-4xl mx-auto">
                    <div className="px-4 pt-4">
                        <p role="status" className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-stone-700">
                            <span className="font-semibold text-stone-900">Demo recipe.</span>{" "}
                            {user
                                ? "This is a sample from the demo kitchen, not one of your household's recipes."
                                : "You can read and scale it. Log in to save recipes, plan meals and build a shopping list."}
                        </p>
                    </div>

                    <div className="aspect-video w-full bg-stone-200 relative mt-4">
                        {recipe.image_url ? (
                            // OM57 — raw <img> by decision (third-party image hosts), same as the real recipe page.
                            // eslint-disable-next-line @next/next/no-img-element -- OM57: raw <img> by decision
                            <img
                                src={recipe.image_url}
                                alt={recipe.title}
                                className="w-full h-full object-cover"
                                decoding="async"
                                fetchPriority="high"
                                width={1280}
                                height={720}
                            />
                        ) : (
                            // Same plate placeholder as RecipeCard, so the page matches the card.
                            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-stone-100 to-stone-200">
                                <span className="text-6xl opacity-25 filter grayscale select-none" aria-hidden="true">🍽️</span>
                            </div>
                        )}
                        <div className="absolute bottom-4 left-4 flex flex-wrap gap-2">
                            {recipe.category.map((cat) => (
                                <span key={cat} className="bg-white/90 backdrop-blur-md px-3 py-1 rounded-lg text-sm font-bold text-stone-900 shadow-sm border border-stone-200">
                                    {cat}
                                </span>
                            ))}
                        </div>
                    </div>

                    <div className="p-6 space-y-8">
                        <h1 className="text-3xl font-serif font-bold text-stone-900">{recipe.title}</h1>

                        {hasLink && (
                            <a
                                href={recipe.link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center justify-center gap-2 w-full p-4 bg-stone-900 text-white rounded-xl font-bold shadow-lg hover:bg-stone-800"
                            >
                                <ExternalLink className="w-5 h-5" />
                                View the original recipe
                            </a>
                        )}

                        {ingredients && !isPlaceholderIngredients && (
                            <div className="bg-white rounded-2xl p-6 shadow-sm border border-stone-100">
                                <IngredientList ingredients={ingredients} scale={scale} setScale={setScale} />
                            </div>
                        )}

                        {hasRealMethod && (
                            <div className="bg-white rounded-2xl p-6 shadow-sm border border-stone-100">
                                <h2 className="text-xl font-serif font-bold text-stone-900 mb-4 border-b border-stone-100 pb-2">Method</h2>
                                <div className="whitespace-pre-wrap text-stone-700 leading-relaxed">{method}</div>
                            </div>
                        )}

                        {!hasLink && (!ingredients || isPlaceholderIngredients) && !hasRealMethod && (
                            <p className="text-stone-500">This demo recipe only has a title and photo.</p>
                        )}

                        <Link href="/" className="inline-block text-sm text-stone-600 underline underline-offset-2 hover:text-stone-900">
                            Back to the demo kitchen
                        </Link>
                    </div>
                </div>
            </main>
        </div>
    );
}
