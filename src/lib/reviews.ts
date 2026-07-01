// OM29 — Recipe reviews (anon guestbook).
//
// All calls go through the anon-key Supabase client; RLS in
// 012_recipe_reviews.sql gates BOTH read and insert on
// recipes.is_public = TRUE — so a private recipe can't be reviewed
// even if someone guesses the UUID.

import { supabase } from "./supabaseClient";


export interface Review {
    id: number;
    recipe_id: string;
    guest_name: string | null;
    comment: string;
    rating: number | null;
    created_at: string;
    // OM32 — owner moderation. Hidden reviews are filtered out of the public
    // page; owner_reply holds the single owner response.
    is_hidden?: boolean;
    owner_reply?: string | null;
    owner_replied_at?: string | null;
}


export interface ReviewInput {
    guest_name?: string;
    comment: string;
    rating?: number;
}


/** Newest first. Returns [] when the recipe isn't public (RLS hides it). */
export async function fetchReviews(recipeId: string): Promise<Review[]> {
    const { data, error } = await supabase
        .from("recipe_reviews")
        .select("*")
        .eq("recipe_id", recipeId)
        .order("created_at", { ascending: false });
    if (error) {
        console.warn("[OM29] fetchReviews:", error.message);
        return [];
    }
    return (data || []) as Review[];
}


/** Returns the inserted row, or null when the recipe isn't public
 *  (RLS rejects the insert). */
export async function postReview(
    recipeId: string,
    input: ReviewInput,
): Promise<Review | null> {
    const comment = (input.comment || "").trim();
    if (!comment) return null;
    const guest = (input.guest_name || "").trim() || null;
    const rating = input.rating && input.rating >= 1 && input.rating <= 5 ? input.rating : null;

    const { data, error } = await supabase
        .from("recipe_reviews")
        .insert({
            recipe_id: recipeId,
            guest_name: guest,
            comment,
            rating,
        })
        .select()
        .single();
    if (error) {
        console.warn("[OM29] postReview:", error.message);
        return null;
    }
    return data as Review;
}


// ── OM32 — owner moderation ────────────────────────────────────────────────
// Both go through the same (auth-carrying) Supabase client. RLS policy
// "reviews owner update" (014_review_moderation.sql) lets ONLY the recipe
// owner update these rows, so a wrong caller gets 0 rows back, not an error.

/** Hide or unhide a review. Returns the updated row, or null on failure. */
export async function hideReview(
    reviewId: number,
    hidden: boolean,
): Promise<Review | null> {
    const { data, error } = await supabase
        .from("recipe_reviews")
        .update({ is_hidden: hidden })
        .eq("id", reviewId)
        .select()
        .maybeSingle();
    if (error) {
        console.warn("[OM32] hideReview:", error.message);
        return null;
    }
    return (data as Review) ?? null;
}

/** Set (or replace) the single owner reply on a review. Pass "" to clear it.
 *  Returns the updated row, or null on failure. */
export async function replyToReview(
    reviewId: number,
    reply: string,
): Promise<Review | null> {
    const trimmed = (reply || "").trim();
    const { data, error } = await supabase
        .from("recipe_reviews")
        .update({
            owner_reply: trimmed || null,
            owner_replied_at: trimmed ? new Date().toISOString() : null,
        })
        .eq("id", reviewId)
        .select()
        .maybeSingle();
    if (error) {
        console.warn("[OM32] replyToReview:", error.message);
        return null;
    }
    return (data as Review) ?? null;
}
