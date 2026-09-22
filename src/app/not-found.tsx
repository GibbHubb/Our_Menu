// OM59 — the App Router convention file for an unmatched route. Renders in
// the app's own chrome instead of Next's default blank 404. This is separate
// from the "Recipe Not Found" state inside `recipe/[id]/page.tsx` (that one
// covers a valid route whose id doesn't exist in the table — out of scope
// per the plan) and from the public `/r/[id]` page's own not-found handling.

import Link from "next/link";
import { Compass } from "lucide-react";

export default function NotFound() {
    return (
        <div className="min-h-screen bg-stone-50 flex flex-col items-center justify-center px-4 text-center">
            <div className="bg-stone-100 p-6 rounded-full mb-6">
                <Compass className="w-8 h-8 text-stone-400" />
            </div>
            <h1 className="text-2xl font-serif text-stone-900 mb-2">Page not found</h1>
            <p className="text-stone-500 max-w-md mb-8">
                There&apos;s nothing at this address.
            </p>
            <Link
                href="/"
                className="px-8 py-3 bg-stone-900 text-white rounded-full font-medium hover:bg-stone-800 transition-transform active:scale-95 shadow-lg"
            >
                Back to the menu
            </Link>
        </div>
    );
}
