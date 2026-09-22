"use client";

// OM59 — the one App Router convention file that fires when the ROOT LAYOUT
// itself throws (app/error.tsx can't catch that — Next requires
// global-error.tsx for it, and it must render its own <html>/<body> since it
// replaces the whole tree, layout included). This is the last line of
// defence below `ErrorBoundary.tsx`'s class-component boundary for anything
// that happens outside React's render (Next's own routing/layout machinery).
// Deliberately plain inline styles, not Tailwind classes: globals.css is
// itself part of the layout module graph this file stands in for, so it
// cannot be assumed to be loaded when this renders.

import { useEffect } from "react";

export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error("Root layout error:", error);
    }, [error]);

    return (
        <html lang="en">
            <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#fafaf9" }}>
                <div
                    style={{
                        minHeight: "100vh",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: "24px",
                        textAlign: "center",
                        gap: "16px",
                    }}
                >
                    <h1 style={{ fontSize: "20px", color: "#1c1917", margin: 0 }}>
                        Something went wrong
                    </h1>
                    <p style={{ color: "#78716c", maxWidth: "400px", margin: 0 }}>
                        The app hit a problem it couldn&apos;t recover from. Reloading usually fixes it.
                    </p>
                    <button
                        onClick={reset}
                        style={{
                            padding: "10px 24px",
                            cursor: "pointer",
                            borderRadius: "999px",
                            border: "none",
                            background: "#1c1917",
                            color: "#fafaf9",
                            fontWeight: 600,
                        }}
                    >
                        Try again
                    </button>
                </div>
            </body>
        </html>
    );
}
