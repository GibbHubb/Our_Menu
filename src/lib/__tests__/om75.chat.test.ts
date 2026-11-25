// OM75 — exactly one chat button: ChatAgent, mounted once from the root layout, still gated by the
// per-feature `chat` flag (which is false signed out). Rendered to static markup in the node env.
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, type ComponentType, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { rejectWrong } from './control';

// Hoisted with the vi.mock factories below, which run before this file's own top-level code.
const { pass } = vi.hoisted(() => ({
    pass: ({ children }: { children?: ReactNode }) => children ?? null,
}));

vi.mock('next/font/google', () => ({
    Playfair_Display: () => ({ variable: 'font-playfair' }),
    Inter: () => ({ variable: 'font-inter' }),
}));
vi.mock('@/app/globals.css', () => ({}));
vi.mock('@/components/ChatAgent', () => ({ default: () => createElement('i', { 'data-chat': 'agent' }) }));
vi.mock('@/components/ErrorBoundary', () => ({ ErrorBoundary: pass }));
vi.mock('@/components/ClientErrorReporterMount', () => ({ ClientErrorReporterMount: () => null }));
vi.mock('@/components/Toast', () => ({ ToastProvider: pass }));
vi.mock('@/lib/AuthContext', () => ({ AuthProvider: pass }));

let chatFlag: boolean | null = true;
vi.mock('@/lib/useAiFeature', () => ({ useAiFeature: (f: string) => (f === 'chat' ? chatFlag : false) }));

import RootLayout from '@/app/layout';

const chatMounts = (html: string) => (html.match(/data-chat="agent"/g) ?? []).length;
const layoutHtml = () => renderToStaticMarkup(RootLayout({ children: createElement('main', null, 'page') }));

// The real component (the layout gets the stub above). Its first import pulls in framer-motion and
// lucide, which can take several seconds cold on Windows, so it loads once with a long timeout.
let Chat: ComponentType;
beforeAll(async () => {
    Chat = (await vi.importActual<{ default: ComponentType }>('@/components/ChatAgent')).default;
}, 60_000);

beforeEach(() => {
    chatFlag = true;
});

describe('OM75 (1) one chat', () => {
    it('the root layout renders the chat exactly once, around every page', () => {
        const html = layoutHtml();
        expect(chatMounts(html)).toBe(1);
        expect(html).toContain('<main>page</main>');
    });

    it('AIChat is gone and MenuContainer no longer mounts a second chat', () => {
        expect(existsSync(path.resolve(__dirname, '../../components/AIChat.tsx'))).toBe(false);
        const menu = readFileSync(path.resolve(__dirname, '../../components/MenuContainer.tsx'), 'utf8');
        expect(menu).not.toMatch(/<ChatAgent|import ChatAgent/);
    });

    it('with the chat flag on, the kept chat renders one "Ask Chef" button', () => {
        const html = renderToStaticMarkup(createElement(Chat));
        expect((html.match(/<button/g) ?? []).length).toBe(1);
        expect(html).toContain('Ask Chef');
        expect(html).toContain('aria-label="AI kitchen assistant"');
    });

    it('with the flag off, signed out (false) or not yet known (null), it renders nothing', () => {
        for (const v of [false, null]) {
            chatFlag = v;
            expect(renderToStaticMarkup(createElement(Chat))).toBe('');
        }
    });

    it('CONTROL: the layout does not mount the chat twice', () => {
        // Goes red under OM54_INVERT_CONTROLS=1. The known-wrong answer is the OM75 bug: two chat
        // buttons in one corner (1 from the layout + 1 from MenuContainer = 2).
        rejectWrong(chatMounts(layoutHtml()), 2);
    });
});
