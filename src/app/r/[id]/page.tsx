// OM29 — Public, read-only recipe page with anon guestbook.
// Only loads when the recipe has is_public = TRUE (enforced by RLS).

"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import type { Recipe } from "@/lib/types";
import { fetchReviews, postReview, hideReview, replyToReview, type Review } from "@/lib/reviews";
import { useAuth } from "@/lib/AuthContext";  // OM32

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
    // OM32 — owner moderation. The owner is the signed-in user who owns the recipe.
    const { user } = useAuth();
    const isOwner = !!user && !!recipe && recipe.user_id === user.id;
    const [replyDrafts, setReplyDrafts] = useState<Record<number, string>>({});
    const [busyReviewId, setBusyReviewId] = useState<number | null>(null);

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

    // OM32 — owner: hide/unhide a review.
    const toggleHide = async (r: Review) => {
        setBusyReviewId(r.id);
        try {
            const updated = await hideReview(r.id, !r.is_hidden);
            if (updated) setReviews((prev) => prev.map((x) => x.id === r.id ? updated : x));
        } finally {
            setBusyReviewId(null);
        }
    };

    // OM32 — owner: post / replace the single reply on a review.
    const submitReply = async (r: Review) => {
        const draft = replyDrafts[r.id] ?? r.owner_reply ?? "";
        setBusyReviewId(r.id);
        try {
            const updated = await replyToReview(r.id, draft);
            if (updated) {
                setReviews((prev) => prev.map((x) => x.id === r.id ? updated : x));
                setReplyDrafts((prev) => { const n = { ...prev }; delete n[r.id]; return n; });
            }
        } finally {
            setBusyReviewId(null);
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

    // OM32 — guests never see hidden reviews; the owner sees them (marked) so
    // they can unhide.
    const visibleReviews = isOwner ? reviews : reviews.filter((r) => !r.is_hidden);

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

                {visibleReviews.length === 0 ? (
                    <p className="text-stone-500 italic">No reviews yet — be the first.</p>
                ) : (
                    <ul className="space-y-3">
                        {visibleReviews.map((r) => (
                            <li
                                key={r.id}
                                className={`p-3 rounded-xl border ${
                                    r.is_hidden
                                        ? "bg-stone-50 border-dashed border-stone-300 opacity-70"
                                        : "bg-white border-stone-100"
                                }`}
                            >
                                <div className="flex items-center justify-between text-sm text-stone-500 mb-1">
                                    <span className="font-semibold text-stone-700">
                                        {r.guest_name || "Anonymous"}
                                        {isOwner && r.is_hidden && (
                                            <span className="ml-2 text-xs font-normal text-stone-400 uppercase tracking-wide">Hidden</span>
                                        )}
                                    </span>
                                    <span>
                                        {r.rating ? "★".repeat(r.rating) + "☆".repeat(5 - r.rating) : ""}
                                        {"  · "}
                                        {new Date(r.created_at).toLocaleDateString()}
                                    </span>
                                </div>
                                <p className="text-stone-700 whitespace-pre-wrap">{r.comment}</p>

                                {/* OM32 — owner reply (shown to everyone) */}
                                {r.owner_reply && (
                                    <div className="mt-2 ml-3 pl-3 border-l-2 border-stone-300 bg-stone-50 rounded-r-lg py-2 pr-2">
                                        <div className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-0.5">
                                            Owner reply
                                            {r.owner_replied_at && (
                                                <span className="ml-1 font-normal normal-case text-stone-400">
                                                    · {new Date(r.owner_replied_at).toLocaleDateString()}
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-stone-700 whitespace-pre-wrap text-sm">{r.owner_reply}</p>
                                    </div>
                                )}

                                {/* OM32 — owner moderation controls */}
                                {isOwner && (
                                    <div className="mt-3 space-y-2 border-t border-stone-100 pt-2">
                                        <div className="flex gap-2">
                                            <textarea
                                                rows={2}
                                                placeholder={r.owner_reply ? "Edit your reply…" : "Reply to this review…"}
                                                value={replyDrafts[r.id] ?? r.owner_reply ?? ""}
                                                onChange={(e) => setReplyDrafts((prev) => ({ ...prev, [r.id]: e.target.value }))}
                                                className="flex-1 px-2 py-1.5 border border-stone-200 rounded text-sm bg-white"
                                                maxLength={2000}
                                            />
                                        </div>
                                        <div className="flex gap-2">
                                            <button
                                                type="button"
                                                onClick={() => submitReply(r)}
                                                disabled={busyReviewId === r.id}
                                                className="px-3 py-1 rounded-full bg-stone-900 text-white text-xs font-semibold disabled:opacity-50"
                                            >
                                                {r.owner_reply ? "Update reply" : "Post reply"}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => toggleHide(r)}
                                                disabled={busyReviewId === r.id}
                                                className="px-3 py-1 rounded-full border border-stone-300 text-stone-700 text-xs font-semibold hover:bg-stone-100 disabled:opacity-50"
                                            >
                                                {r.is_hidden ? "Unhide" : "Hide"}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </main>
    );
}
