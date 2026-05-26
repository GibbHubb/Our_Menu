// OM29 — Public, read-only recipe page with anon guestbook.
// Only loads when the recipe has is_public = TRUE (enforced by RLS).

"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import type { Recipe } from "@/lib/types";
import { fetchReviews, postReview, type Review } from "@/lib/reviews";

export default function PublicRecipePage() {
    const { id } = useParams<{ id: string }>();
    const [recipe, setRecipe] = useState<Recipe | null>(null);
    const [notFound, setNotFound] = useState(false);
    const [reviews, setReviews] = useState<Review[]>([]);
    const [name, setName] = useState("");
    const [comment, setComment] = useState("");
    const [rating, setRating] = useState<number | "">("");
    const [submitting, setSubmitting] = useState(false);
    const [submitMsg, setSubmitMsg] = useState<string | null>(null);

    useEffect(() => {
        if (!id) return;
        let cancelled = false;
        (async () => {
            // RLS returns 0 rows for a non-public recipe.
            const { data, error } = await supabase
                .from("recipes")
                .select("*")
                .eq("id", id)
                .maybeSingle();
            if (cancelled) return;
            if (error || !data) {
                setNotFound(true);
                return;
            }
            setRecipe(data as Recipe);
            setReviews(await fetchReviews(id));
        })();
        return () => { cancelled = true; };
    }, [id]);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!id || !comment.trim() || submitting) return;
        setSubmitting(true);
        setSubmitMsg(null);
        try {
            const row = await postReview(id, {
                guest_name: name || undefined,
                comment,
                rating: typeof rating === "number" ? rating : undefined,
            });
            if (row) {
                setReviews((prev) => [row, ...prev]);
                setComment("");
                setRating("");
                setSubmitMsg("Thanks for the review!");
            } else {
                setSubmitMsg("Could not post — the owner may have made this recipe private.");
            }
        } finally {
            setSubmitting(false);
        }
    };

    if (notFound) {
        return (
            <main className="max-w-2xl mx-auto p-8">
                <h1 className="font-serif text-3xl text-stone-900 mb-2">Recipe not found</h1>
                <p className="text-stone-600">This recipe is private or doesn&apos;t exist.</p>
            </main>
        );
    }

    if (!recipe) {
        return <main className="max-w-2xl mx-auto p-8 text-stone-400">Loading…</main>;
    }

    return (
        <main className="max-w-2xl mx-auto p-4 sm:p-8">
            {recipe.image_url && (
                <img
                    src={recipe.image_url}
                    alt={recipe.title}
                    className="w-full h-72 object-cover rounded-2xl mb-6"
                />
            )}
            <h1 className="font-serif text-4xl text-stone-900 mb-2">{recipe.title}</h1>
            {recipe.category?.length > 0 && (
                <div className="text-xs uppercase tracking-wider text-stone-500 mb-6">
                    {recipe.category.join(" · ")}
                </div>
            )}

            {recipe.ingredients && (
                <section className="mb-6">
                    <h2 className="font-serif text-2xl text-stone-900 mb-2">Ingredients</h2>
                    <pre className="whitespace-pre-wrap font-sans text-stone-700">{recipe.ingredients}</pre>
                </section>
            )}
            {recipe.instructions && (
                <section className="mb-8">
                    <h2 className="font-serif text-2xl text-stone-900 mb-2">Instructions</h2>
                    <pre className="whitespace-pre-wrap font-sans text-stone-700">{recipe.instructions}</pre>
                </section>
            )}

            <section className="border-t border-stone-200 pt-6">
                <h2 className="font-serif text-2xl text-stone-900 mb-4">Reviews</h2>
                <form onSubmit={submit} className="space-y-2 mb-6 bg-stone-50 p-4 rounded-xl">
                    <div className="flex gap-2">
                        <input
                            type="text"
                            placeholder="Your name (optional)"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="flex-1 px-3 py-2 border border-stone-200 rounded bg-white"
                        />
                        <select
                            value={rating}
                            onChange={(e) => setRating(e.target.value ? Number(e.target.value) : "")}
                            className="px-2 py-2 border border-stone-200 rounded bg-white"
                            aria-label="Rating"
                        >
                            <option value="">★ rate</option>
                            {[1, 2, 3, 4, 5].map((n) => (
                                <option key={n} value={n}>{"★".repeat(n)}</option>
                            ))}
                        </select>
                    </div>
                    <textarea
                        rows={3}
                        placeholder="Leave a comment…"
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        className="w-full px-3 py-2 border border-stone-200 rounded bg-white"
                        maxLength={2000}
                        required
                    />
                    <button
                        type="submit"
                        disabled={!comment.trim() || submitting}
                        className="px-4 py-2 rounded-full bg-stone-900 text-white text-sm font-semibold disabled:opacity-50"
                    >
                        {submitting ? "Posting…" : "Post review"}
                    </button>
                    {submitMsg && <p className="text-xs text-stone-500">{submitMsg}</p>}
                </form>

                {reviews.length === 0 ? (
                    <p className="text-stone-500 italic">No reviews yet — be the first.</p>
                ) : (
                    <ul className="space-y-3">
                        {reviews.map((r) => (
                            <li key={r.id} className="p-3 bg-white rounded-xl border border-stone-100">
                                <div className="flex items-center justify-between text-sm text-stone-500 mb-1">
                                    <span className="font-semibold text-stone-700">
                                        {r.guest_name || "Anonymous"}
                                    </span>
                                    <span>
                                        {r.rating ? "★".repeat(r.rating) + "☆".repeat(5 - r.rating) : ""}
                                        {"  · "}
                                        {new Date(r.created_at).toLocaleDateString()}
                                    </span>
                                </div>
                                <p className="text-stone-700 whitespace-pre-wrap">{r.comment}</p>
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </main>
    );
}
