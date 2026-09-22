"use client";

// OM59 — replaces the browser's native alert box for background-action
// feedback ("Menu cleared!", "Embeddings synced!", the seed-data summary).
// NOT a toast library: three dependencies would have been more code than
// this file.
//
// Risk this was built to avoid (see plan §8): a toast that auto-dismisses in
// 3s on a phone in a pocket is quieter than the popup it replaced, which is
// a regression for anything destructive. So: `persistent: true` toasts stay
// until the user dismisses them; everything else times out. Destructive or
// data-losing failures should use a persistent inline error next to the
// control instead of a toast at all — see MenuContainer's add/update/reset
// handlers for that pattern.

import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from "lucide-react";
import {
    createContext,
    useCallback,
    useContext,
    useRef,
    useState,
    type ReactNode,
} from "react";

type ToastVariant = "success" | "error" | "warning" | "info";

interface ToastOptions {
    variant?: ToastVariant;
    /** Stays on screen until dismissed, instead of the default 4s timeout. */
    persistent?: boolean;
    /** ms before auto-dismiss; ignored when `persistent`. */
    duration?: number;
}

interface ToastItem extends Required<Pick<ToastOptions, "variant" | "persistent">> {
    id: number;
    message: string;
}

interface ToastContextValue {
    toast: (message: string, options?: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const VARIANT_STYLE: Record<ToastVariant, string> = {
    success: "bg-emerald-50 border-emerald-200 text-emerald-900",
    error: "bg-red-50 border-red-200 text-red-800",
    warning: "bg-amber-50 border-amber-200 text-amber-900",
    info: "bg-stone-100 border-stone-200 text-stone-800",
};

const VARIANT_ICON: Record<ToastVariant, ReactNode> = {
    success: <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />,
    error: <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />,
    warning: <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />,
    info: <Info className="w-5 h-5 text-stone-500 flex-shrink-0" />,
};

export function ToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<ToastItem[]>([]);
    const nextId = useRef(0);

    const dismiss = useCallback((id: number) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);

    const toast = useCallback((message: string, options?: ToastOptions) => {
        const id = nextId.current++;
        const variant = options?.variant ?? "info";
        const persistent = options?.persistent ?? false;
        setToasts((prev) => [...prev, { id, message, variant, persistent }]);
        if (!persistent) {
            const duration = options?.duration ?? 4000;
            setTimeout(() => dismiss(id), duration);
        }
    }, [dismiss]);

    return (
        <ToastContext.Provider value={{ toast }}>
            {children}
            {/* Above the floating action buttons (bottom-6 right-6), below any modal. */}
            <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 w-[calc(100%-2rem)] max-w-sm pointer-events-none">
                {toasts.map((t) => (
                    <div
                        key={t.id}
                        role={t.variant === "error" ? "alert" : "status"}
                        className={`pointer-events-auto flex items-start gap-3 rounded-2xl border px-4 py-3 shadow-lg ${VARIANT_STYLE[t.variant]}`}
                    >
                        {VARIANT_ICON[t.variant]}
                        <p className="flex-1 text-sm">{t.message}</p>
                        <button
                            onClick={() => dismiss(t.id)}
                            className="p-0.5 opacity-60 hover:opacity-100"
                            aria-label="Dismiss"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
}

export function useToast(): ToastContextValue {
    const ctx = useContext(ToastContext);
    if (!ctx) throw new Error("useToast() must be used inside <ToastProvider>");
    return ctx;
}
