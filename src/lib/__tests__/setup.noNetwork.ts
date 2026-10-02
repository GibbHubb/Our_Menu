// OM54 — the unit suite makes 0 network calls, enforced rather than intended.
// Any fetch from code under test throws, which fails the test that caused it.
globalThis.fetch = (async (input: unknown) => {
    throw new Error(`OM54: network call attempted in the unit suite: ${String(input)}`);
}) as typeof fetch;
