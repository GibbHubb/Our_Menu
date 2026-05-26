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
