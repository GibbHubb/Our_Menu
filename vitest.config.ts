// OM54 — the unit suite. Pure modules only, so it runs offline: no Supabase
// URL or key is needed (supabaseClient falls back to a placeholder host and
// constructing a client makes no request).
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
    resolve: {
        alias: { '@': path.resolve(__dirname, 'src') },
    },
    test: {
        environment: 'node',
        setupFiles: ['src/lib/__tests__/setup.noNetwork.ts'],
        include: ['src/**/__tests__/**/*.test.ts'],
        coverage: {
            provider: 'v8',
            include: ['src/lib/quantity.ts', 'src/lib/unitConversion.ts'],
            reporter: ['text', 'text-summary'],
            thresholds: { lines: 80 },
        },
    },
});
