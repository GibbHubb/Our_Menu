"use client";

// OM61 — catches what ErrorBoundary structurally cannot: an error thrown
// outside a React render (an event handler, a setTimeout, a raw promise
// rejection) never reaches componentDidCatch at all. `window.onerror` /
// `unhandledrejection` are the only hook for those. Mounted once in the root
// layout, renders nothing.

import { useEffect } from 'react';
import { reportClientError } from '@/lib/clientErrorReporter';

export function ClientErrorReporterMount() {
    useEffect(() => {
        const onError = (event: ErrorEvent) => {
            reportClientError('window.onerror', event.error ?? event.message);
        };
        const onRejection = (event: PromiseRejectionEvent) => {
            reportClientError('unhandledrejection', event.reason);
        };
        window.addEventListener('error', onError);
        window.addEventListener('unhandledrejection', onRejection);
        return () => {
            window.removeEventListener('error', onError);
            window.removeEventListener('unhandledrejection', onRejection);
        };
    }, []);

    return null;
}
