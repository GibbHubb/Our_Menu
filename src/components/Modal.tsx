"use client";

// OM58 — the one place dialog behaviour lives.
//
// The three overlays (Add Recipe, Edit Recipe, Decision Maker) were each a
// `fixed inset-0` div: focus stayed behind them, Tab walked the page
// underneath, Escape did nothing and a screen reader was never told a dialog
// had opened. This wrapper gives all three the same contract:
//
//   - role="dialog" + aria-modal + aria-labelledby (the heading's id)
//   - focus moves in on open (first focusable control, else the dialog)
//   - Tab / Shift+Tab wrap inside the dialog while it is open
//   - Escape calls onClose
//   - focus returns to whatever had it before, on close
//
// It renders the caller's overlay classes verbatim, so the look and the
// entry animation are unchanged. Backdrop click is deliberately NOT a close:
// two of these hold a half-filled form, and losing it to a stray tap is worse
// than having to press Close.

import { useEffect, useRef, type ReactNode } from "react";

const FOCUSABLE = [
    "a[href]", "button:not([disabled])", "input:not([disabled]):not([type=hidden])",
    "select:not([disabled])", "textarea:not([disabled])", "[tabindex]:not([tabindex='-1'])",
].join(",");

interface ModalProps {
    /** id of the element that names the dialog (its heading). */
    labelledBy: string;
    onClose: () => void;
    /** The overlay's existing classes, unchanged. */
    className: string;
    children: ReactNode;
}

export default function Modal({ labelledBy, onClose, className, children }: ModalProps) {
    const ref = useRef<HTMLDivElement>(null);
    // Read through a ref so a parent re-render (new onClose identity) does not
    // re-run the open/close effect and bounce focus.
    const onCloseRef = useRef(onClose);
    useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

    useEffect(() => {
        const previous = document.activeElement as HTMLElement | null;
        const root = ref.current;
        if (!root) return;

        const focusables = () =>
            Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE))
                .filter((el) => el.offsetParent !== null || el === document.activeElement);

        (focusables()[0] ?? root).focus();

        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.stopPropagation();
                onCloseRef.current();
                return;
            }
            if (e.key !== "Tab") return;
            const els = focusables();
            if (!els.length) { e.preventDefault(); root.focus(); return; }
            const first = els[0];
            const last = els[els.length - 1];
            const active = document.activeElement;
            if (e.shiftKey && (active === first || !root.contains(active))) {
                e.preventDefault(); last.focus();
            } else if (!e.shiftKey && (active === last || !root.contains(active))) {
                e.preventDefault(); first.focus();
            }
        };
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("keydown", onKey);
            // The trigger may have unmounted (e.g. a re-rendered grid); only
            // restore to something still in the document.
            if (previous && document.contains(previous)) previous.focus();
        };
    }, []);

    return (
        <div
            ref={ref}
            role="dialog"
            aria-modal="true"
            aria-labelledby={labelledBy}
            tabIndex={-1}
            className={`${className} outline-none`}
        >
            {children}
        </div>
    );
}
