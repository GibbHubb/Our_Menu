"use client";

// OM59 — the App Router convention file for a segment-level render or data
// error. Before this ticket there were 0 of these in the app (11 route
// segments, `find src/app -name 'error.tsx' ...` → nothing), so any such
// error fell through to `ErrorBoundary.tsx`'s single mount in the root
// layout and printed `error.message` on an unstyled white page. This one
// stays inside the app's own chrome and offers `reset()`, which re-renders
// the segment instead of a full reload.

import { useEffect } from "react";
import Link from "next/link";
import { AlertCircle, RefreshCw } from "lucide-react";

export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        // The user sees a generic message below; the real error still goes
        // to the console for anyone debugging this.
        console.error("Segment error:", error);
    }, [error]);

    return (
        <div className="min-h-screen bg-stone-50 flex flex-col items-center justify-center px-4 text-center">
            <div className="bg-red-50 text-red-600 p-4 rounded-full mb-4">
                <AlertCircle className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-serif text-stone-900 mb-2">Something went wrong</h2>
            <p className="text-stone-500 max-w-md mb-6">
                This page hit a problem loading. Your data is fine — try again.
            </p>
            <div className="flex items-center gap-3">
                <button
                    onClick={reset}
                    className="px-6 py-2.5 bg-stone-900 text-white rounded-full font-medium hover:bg-stone-800 transition-transform active:scale-95 flex items-center gap-2 shadow-lg"
                >
                    <RefreshCw className="w-4 h-4" />
                    Try again
                </button>
                <Link
                    href="/"
                    className="px-6 py-2.5 bg-white border border-stone-200 text-stone-700 rounded-full font-medium hover:bg-stone-100 transition-colors"
                >
                    Back to menu
                </Link>
            </div>
        </div>
    );
}
