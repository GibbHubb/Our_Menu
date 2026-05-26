// OM25 — Upload a recipe image to the `recipe-images` Supabase bucket
// and return its public URL (with an auto-resize transform applied so
// thumbnails are small and detail-page hero is right-sized).
//
// Per-USER v1 (plan §4): files land at `<auth.uid()>/<random>.<ext>`,
// matching the RLS in 011_recipe_images.sql. When OM14b (households)
// lands, swap the prefix to the household id.

import { supabase } from "./supabaseClient";

const BUCKET = "recipe-images";


export interface UploadedImage {
    /** Public URL — already URL-resized to a sensible recipe-card width. */
    url: string;
    /** Object path inside the bucket — store this if you want to delete later. */
    path: string;
}


/** Slug-safe extension from a File (falls back to "jpg"). */
function extensionOf(file: File): string {
    const m = /\.([a-zA-Z0-9]+)$/.exec(file.name);
    if (m) return m[1].toLowerCase();
    const mime = file.type;
    if (mime === "image/png") return "png";
    if (mime === "image/webp") return "webp";
    if (mime === "image/gif") return "gif";
    return "jpg";
}


/**
 * Upload a File picked from <input type="file">. Returns the public URL
 * (with Supabase image transform applied) or null on failure.
 *
 * Caller patches the recipe's image_url with `result.url`.
 */
export async function uploadRecipeImage(file: File): Promise<UploadedImage | null> {
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData?.user?.id;
    if (!uid) {
        console.warn("[OM25] uploadRecipeImage: not signed in — refusing upload");
        return null;
    }

    const path = `${uid}/${crypto.randomUUID()}.${extensionOf(file)}`;
    const { error: uploadErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, {
            cacheControl: "31536000",  // 1 year — content-hashed names so cache is safe
            upsert: false,
            contentType: file.type || undefined,
        });
    if (uploadErr) {
        console.error("[OM25] upload failed:", uploadErr.message);
        return null;
    }

    // Auto-resize via Supabase image transform — keeps payloads small on
    // card grids without us thumbnailing client-side.
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path, {
        transform: { width: 800, height: 600, resize: "cover" },
    });
    return { url: data.publicUrl, path };
}
