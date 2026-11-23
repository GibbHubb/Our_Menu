// OM72 — per-feature AI flags: the AI_DISABLE parse, the ai-status body, the client resolver
// (including OM74's "signed out is always off") and the embed-sync summary line.
import { describe, expect, it } from 'vitest';
import {
    AI_FEATURES,
    aiFeatureEnabled,
    aiFeatureFlags,
    aiFeatureOffError,
    aiStatusBody,
    disabledAiFeatures,
    isAiAdmin,
    resolveAiFeature,
} from '@/lib/aiFeatures';
import { embedSyncSummary } from '@/lib/embedSync';
import { rejectWrong } from './control';

const KEY = { GEMINI_API_KEY: 'k' };
const allOn = Object.fromEntries(AI_FEATURES.map((f) => [f, true]));
const allOff = Object.fromEntries(AI_FEATURES.map((f) => [f, false]));

describe('aiFeatureFlags', () => {
    it('lists the six features the UI has entry points for', () => {
        expect([...AI_FEATURES]).toEqual(['chat', 'search', 'mealPlan', 'nutrition', 'receipts', 'substitutions']);
    });

    it('turns every feature on with a Gemini key and nothing disabled', () => {
        expect(aiFeatureFlags(KEY)).toEqual(allOn);
    });

    it('turns every feature off with no key, or a blank one, whatever AI_DISABLE says', () => {
        expect(aiFeatureFlags({})).toEqual(allOff);
        expect(aiFeatureFlags({ GEMINI_API_KEY: '  ' })).toEqual(allOff);
    });

    it('AI_DISABLE=search,nutrition turns exactly those two off', () => {
        const f = aiFeatureFlags({ ...KEY, AI_DISABLE: 'search,nutrition' });
        expect(f).toEqual({ ...allOn, search: false, nutrition: false });
    });

    it('ignores case, spaces, empty entries and unknown names', () => {
        expect([...disabledAiFeatures(' MealPlan , ,RECEIPTS,bogus ')].sort()).toEqual(['mealPlan', 'receipts']);
        expect(disabledAiFeatures(undefined).size).toBe(0);
        expect(disabledAiFeatures('').size).toBe(0);
    });

    it('AI_DISABLE=all turns everything off', () => {
        expect(aiFeatureFlags({ ...KEY, AI_DISABLE: 'All' })).toEqual(allOff);
    });

    it('aiFeatureEnabled reads one flag', () => {
        expect(aiFeatureEnabled('chat', { ...KEY, AI_DISABLE: 'chat' })).toBe(false);
        expect(aiFeatureEnabled('search', { ...KEY, AI_DISABLE: 'chat' })).toBe(true);
    });
});

describe('aiStatusBody', () => {
    it('keeps `enabled` for old clients: true while any feature is on', () => {
        expect(aiStatusBody(KEY)).toEqual({ enabled: true, features: allOn });
        expect(aiStatusBody({ ...KEY, AI_DISABLE: 'chat,search,mealPlan,nutrition,receipts' }).enabled).toBe(true);
        expect(aiStatusBody({ ...KEY, AI_DISABLE: 'all' })).toEqual({ enabled: false, features: allOff });
        expect(aiStatusBody({}).enabled).toBe(false);
    });
});

describe('aiFeatureOffError', () => {
    it('is null while on, names the missing key, or says switched off', () => {
        expect(aiFeatureOffError('chat', 'Chat is', KEY)).toBeNull();
        expect(aiFeatureOffError('chat', 'Chat is', {})).toBe('Chat is not configured (GEMINI_API_KEY missing)');
        expect(aiFeatureOffError('chat', 'Chat is', { ...KEY, AI_DISABLE: 'chat' })).toBe('Chat is switched off on this deployment.');
    });
});

describe('isAiAdmin', () => {
    it('matches an id in AI_ADMIN_USER_IDS, spaces ignored; unset or empty means nobody', () => {
        expect(isAiAdmin('u1', { AI_ADMIN_USER_IDS: ' u0 , u1 ' })).toBe(true);
        expect(isAiAdmin('u2', { AI_ADMIN_USER_IDS: 'u0,u1' })).toBe(false);
        expect(isAiAdmin('u1', {})).toBe(false);
        expect(isAiAdmin('u1', { AI_ADMIN_USER_IDS: '' })).toBe(false);
        expect(isAiAdmin(null, { AI_ADMIN_USER_IDS: 'u1' })).toBe(false);
        expect(isAiAdmin('', { AI_ADMIN_USER_IDS: ',' })).toBe(false);
    });
});

describe('resolveAiFeature (client)', () => {
    const status = { enabled: true, features: { ...allOn, search: false } };

    it('follows the feature\'s own flag when signed in', () => {
        expect(resolveAiFeature(status, 'chat', true)).toBe(true);
        expect(resolveAiFeature(status, 'search', true)).toBe(false);
    });

    it('is always false signed out (OM74), even with the feature on', () => {
        expect(resolveAiFeature(status, 'chat', false)).toBe(false);
        expect(resolveAiFeature(null, 'chat', false)).toBe(false);
    });

    it('is null (render nothing yet) while the status or the session is unknown', () => {
        expect(resolveAiFeature(null, 'chat', true)).toBeNull();
        expect(resolveAiFeature(status, 'chat', null)).toBeNull();
    });

    it('applies a pre-OM72 { enabled } answer to every feature', () => {
        expect(resolveAiFeature({ enabled: true }, 'receipts', true)).toBe(true);
        expect(resolveAiFeature({ enabled: false }, 'receipts', true)).toBe(false);
    });

    it('treats a missing or non-boolean feature as off', () => {
        expect(resolveAiFeature({ enabled: true, features: {} }, 'chat', true)).toBe(false);
        expect(resolveAiFeature({ enabled: true, features: { chat: 'yes' } }, 'chat', true)).toBe(false);
    });

    it('CONTROL: a signed-out visitor does not get the AI buttons', () => {
        // Goes red under OM54_INVERT_CONTROLS=1. The known-wrong answer is the OM74 bug: the
        // buttons showed signed out and could only answer "Sign in to use this."
        rejectWrong(resolveAiFeature(status, 'chat', false), true);
    });
});

describe('embedSyncSummary', () => {
    it('says to press again while recipes remain', () => {
        expect(embedSyncSummary({ embedded: 20, skipped: 5, failed: 0, remaining: 31 }))
            .toBe('20 embedded, 5 already done. 31 remaining: press again.');
    });

    it('says all done at remaining 0', () => {
        expect(embedSyncSummary({ embedded: 3, skipped: 50, failed: 0, remaining: 0 }))
            .toBe('3 embedded, 50 already done. All recipes embedded.');
    });

    it('names failures, a 429 stop, and a press that made no progress', () => {
        expect(embedSyncSummary({ embedded: 2, skipped: 0, failed: 1, remaining: 5, busy: true }))
            .toBe('2 embedded, 0 already done, 1 failed. Gemini is busy, wait a minute. 5 remaining: press again.');
        expect(embedSyncSummary({ embedded: 0, skipped: 9, failed: 1, remaining: 1 }))
            .toContain('No progress this time');
    });
});
