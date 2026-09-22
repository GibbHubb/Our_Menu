"use client";

// OM59 — three shared shapes for "what's on screen while we don't have the
// real content yet": loading, empty and failed. Visual language borrowed
// straight from the states MasonryGrid already had (icon circle, font-serif
// heading, stone-500 body, pill button) so a new failure doesn't introduce a
// fourth look — see MasonryGrid.tsx for the pattern this copies.
//
// The rule this exists to enforce (see 018_require_auth_on_insert.sql and
// LESSONS): a zero-length list is only "empty" when the fetch succeeded.
// ErrorState is a distinct shape from EmptyState on purpose — callers must
// track a real status instead of inferring "failed" from "nothing showed up".

import { AlertCircle, Loader2, RefreshCw, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function LoadingState({ label = "Loading…" }: { label?: string }) {
    return (
        <div className="flex flex-col items-center justify-center py-20 px-4 text-center gap-3">
            <Loader2 className="w-8 h-8 text-stone-400 animate-spin" />
            <p className="text-sm text-stone-400">{label}</p>
        </div>
    );
}

export function EmptyState({
    icon: Icon,
    emoji,
    title,
    body,
    action,
}: {
    icon?: LucideIcon;
    emoji?: string;
    title: string;
    body?: ReactNode;
    action?: ReactNode;
}) {
    return (
        <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
            <div className="bg-stone-100 p-6 rounded-full mb-6">
                {Icon ? <Icon className="w-8 h-8 text-stone-400" /> : <span className="text-4xl">{emoji}</span>}
            </div>
            <h3 className="text-2xl font-serif text-stone-900 mb-2">{title}</h3>
            {body && <p className="text-stone-500 max-w-md mb-8">{body}</p>}
            {action}
        </div>
    );
}

/**
 * A failed load, with a retry. Never pass a raw `error.message`/Postgres
 * code/SQL filename as `detail` — the underlying error still belongs in
 * `console.error` at the call site, not in this JSX. `detail` is a short,
 * human line ("Couldn't reach the kitchen" style), not the exception text.
 */
export function ErrorState({
    title = "Something went wrong",
    detail = "That didn't load. Check your connection and try again.",
    onRetry,
}: {
    title?: string;
    detail?: string;
    onRetry?: () => void;
}) {
    return (
        <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
            <div className="bg-red-50 text-red-600 p-4 rounded-full mb-4">
                <AlertCircle className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-serif text-stone-900 mb-2">{title}</h3>
            <p className="text-stone-500 max-w-md mb-6">{detail}</p>
            {onRetry && (
                <button
                    onClick={onRetry}
                    className="px-6 py-2.5 bg-stone-900 text-white rounded-full font-medium hover:bg-stone-800 transition-transform active:scale-95 flex items-center gap-2 shadow-lg"
                >
                    <RefreshCw className="w-4 h-4" />
                    Try again
                </button>
            )}
        </div>
    );
}
