'use client';
import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
}

// OM59 — this is the class-component fallback for render errors that happen
// OUTSIDE the App Router tree Next itself can catch with `app/error.tsx`
// (this boundary is mounted once, in `app/layout.tsx`, around everything —
// see the App Router docs: a segment's own error.tsx can't catch an error
// thrown by the root layout itself, which is what `app/global-error.tsx` and
// this class boundary both exist to cover). It used to print
// `this.state.error?.message` straight to the page — the exact thing this
// ticket's AC bans, and the app's only unstyled screen (inline styles, no
// app chrome). It no longer keeps the error in state or renders it; the
// error still goes to `console.error` for anyone looking.
export class ErrorBoundary extends Component<Props, State> {
    state: State = { hasError: false };

    static getDerivedStateFromError(): State {
        return { hasError: true };
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        console.error('ErrorBoundary:', error, info.componentStack);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen bg-stone-50 flex flex-col items-center justify-center px-4 text-center">
                    <div className="bg-red-50 text-red-600 p-4 rounded-full mb-4">
                        <AlertCircle className="w-8 h-8" />
                    </div>
                    <h2 className="text-xl font-serif text-stone-900 mb-2">Something went wrong</h2>
                    <p className="text-stone-500 max-w-md mb-6">
                        The page hit a problem it couldn&apos;t recover from. Reloading usually fixes it.
                    </p>
                    <button
                        onClick={() => window.location.reload()}
                        className="px-6 py-2.5 bg-stone-900 text-white rounded-full font-medium hover:bg-stone-800 transition-transform active:scale-95 flex items-center gap-2 shadow-lg"
                    >
                        <RefreshCw className="w-4 h-4" />
                        Reload page
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}
