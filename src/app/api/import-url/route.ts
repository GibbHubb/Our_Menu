// OM10 — server-side URL fetcher + recipe parser. Pure POST endpoint;
// the heavy lifting (JSON-LD / OG extraction) lives in `@/lib/recipeImport`.

import { NextResponse } from "next/server";
import { parseRecipeHtml } from "@/lib/recipeImport";

const FETCH_TIMEOUT_MS = 10_000;
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

// Block private / link-local / loopback hostnames to avoid SSRF against
// the local network. We resolve via a regex on the URL host string —
// good enough for explicit literal addresses; the underlying fetch still
// follows DNS, so this is best-effort defense in depth.
const PRIVATE_HOST_RE = new RegExp(
    [
        "^localhost$",
        "^127\\.",
        "^10\\.",
        "^192\\.168\\.",
        "^172\\.(1[6-9]|2[0-9]|3[0-1])\\.",
        "^169\\.254\\.",   // link-local
        "^0\\.",
        "^::1$",
        "^fe80:",
        "^fc00:",
    ].join("|"),
    "i",
);

function rejectUrl(raw: string): string | null {
    let parsed: URL;
    try {
        parsed = new URL(raw);
    } catch {
        return "Please paste a valid URL.";
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return "Only http:// and https:// links are supported.";
    }
    if (PRIVATE_HOST_RE.test(parsed.hostname)) {
        return "That URL points to a private or local address.";
    }
    return null;
}

export async function POST(req: Request) {
    let body: { url?: string } = {};
    try { body = await req.json(); } catch { /* fall through */ }
    const url = (body.url || "").trim();
    if (!url) {
        return NextResponse.json({ detail: "Missing url" }, { status: 400 });
    }
    const reject = rejectUrl(url);
    if (reject) {
        return NextResponse.json({ detail: reject }, { status: 400 });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let html: string;
    try {
        const res = await fetch(url, {
            method: "GET",
            redirect: "follow",
            signal: controller.signal,
            headers: {
                // Identify ourselves so blogs that block default Node UAs (a few do)
                // serve the page. Mimic a modest browser-like fingerprint.
                "User-Agent": "Mozilla/5.0 (compatible; OurMenuRecipeBot/1.0; +https://ourmenu.local)",
                "Accept": "text/html,application/xhtml+xml",
            },
        });
        if (!res.ok) {
            return NextResponse.json(
                { detail: `Source returned ${res.status} — link may be paywalled or moved.` },
                { status: 422 },
            );
        }
        const contentType = res.headers.get("content-type") || "";
        if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
            return NextResponse.json({ detail: "That URL didn't return an HTML page." }, { status: 422 });
        }
        // Stream-cap to MAX_BYTES so an absurd file doesn't exhaust memory.
        const reader = res.body?.getReader();
        if (!reader) {
            html = await res.text();
        } else {
            const chunks: Uint8Array[] = [];
            let total = 0;
            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                if (value) {
                    total += value.byteLength;
                    if (total > MAX_BYTES) {
                        return NextResponse.json({ detail: "Page is too large to import." }, { status: 422 });
                    }
                    chunks.push(value);
                }
            }
            const buf = new Uint8Array(total);
            let off = 0;
            for (const c of chunks) { buf.set(c, off); off += c.byteLength; }
            html = new TextDecoder().decode(buf);
        }
    } catch (err) {
        const aborted = (err as { name?: string }).name === "AbortError";
        return NextResponse.json(
            { detail: aborted ? "Fetching that URL timed out." : "Could not reach that URL." },
            { status: 502 },
        );
    } finally {
        clearTimeout(timer);
    }

    const parsed = parseRecipeHtml(html, url);
    return NextResponse.json(parsed);
}
