"use client";

// OM45 — tell people it can be an app, once.
//
// Adding a site to an iPhone home screen is buried in the Share sheet and
// nobody finds it by accident. This says so on a phone, in Safari, only when
// it is NOT already installed — and once dismissed it stays dismissed.

import { useEffect, useState } from "react";
import { Share, Plus, X } from "lucide-react";

const DISMISSED = "om45-install-hint-dismissed";

export default function InstallHint() {
    const [show, setShow] = useState(false);

    useEffect(() => {
        // localStorage throws in some privacy modes; a missing hint is fine,
        // a crashed page is not.
        let dismissed = false;
        try { dismissed = localStorage.getItem(DISMISSED) === "1"; } catch { /* ignore */ }
        if (dismissed) return;

        const nav = window.navigator as Navigator & { standalone?: boolean };
        const installed =
            nav.standalone === true ||
            window.matchMedia("(display-mode: standalone)").matches;
        if (installed) return;

        const ua = navigator.userAgent;
        const isIOS = /iPad|iPhone|iPod/.test(ua);
        const isSafari = isIOS && !/CriOS|FxiOS|EdgiOS/.test(ua);
        const isPhone = window.innerWidth < 640;
        if (!isPhone) return;

        // Chrome on iOS can't install; say nothing rather than give a recipe
        // for a button that isn't there.
        if (isIOS && !isSafari) return;

        // A beat of delay: don't interrupt someone the instant the page paints,
        // and it keeps the setState off the effect's synchronous path.
        const t = setTimeout(() => setShow(true), 2500);
        return () => clearTimeout(t);
    }, []);

    if (!show) return null;

    const dismiss = () => {
        setShow(false);
        try { localStorage.setItem(DISMISSED, "1"); } catch { /* ignore */ }
    };

    return (
        <div className="sm:hidden fixed inset-x-3 bottom-[4.75rem] z-40 bg-stone-900 text-stone-50 rounded-2xl shadow-xl px-4 py-3 flex items-start gap-3">
            <div className="flex-1 text-sm leading-snug">
                <p className="font-semibold mb-0.5">Put this on your home screen</p>
                <p className="text-stone-300 text-xs">
                    Tap <Share className="w-3.5 h-3.5 inline -mt-0.5" /> then{" "}
                    <span className="whitespace-nowrap">
                        <Plus className="w-3.5 h-3.5 inline -mt-0.5" /> Add to Home Screen
                    </span>{" "}
                    — it opens like an app, no App Store.
                </p>
            </div>
            <button
                onClick={dismiss}
                className="p-1 text-stone-400 hover:text-stone-50 flex-shrink-0"
                aria-label="Dismiss"
            >
                <X className="w-4 h-4" />
            </button>
        </div>
    );
}
