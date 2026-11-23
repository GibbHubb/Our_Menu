// OM74 — read a fetch Response as JSON without throwing on a body that is not JSON.
//
// Vercel answers some failures itself, before a route runs: a request body over 4.5 MB gets a plain-text
// 413, a function timeout an HTML 504. `await res.json()` on those threw "Unexpected token ... is not
// valid JSON", which is what the receipt scanner showed. This returns the parsed body, or an
// `{ error }` naming the HTTP status when the body is not JSON, so every AI call site can show
// "Upload failed (HTTP 413)" instead.

export type JsonBody = Record<string, unknown> & { error?: unknown };

/** The response body as an object; `{ error: "<what> failed (HTTP n)" }` when it is not JSON. */
export async function readJsonSafe(res: Response, what = 'Request'): Promise<JsonBody> {
    let text = '';
    try {
        text = await res.text();
    } catch {
        /* body unreadable: fall through to the status message */
    }
    try {
        const parsed: unknown = JSON.parse(text);
        if (parsed && typeof parsed === 'object') return parsed as JsonBody;
    } catch {
        /* not JSON */
    }
    return { error: `${what} failed (HTTP ${res.status})` };
}

/** The error to show for a failed response: the route's own `error` string, else the HTTP status. */
export function errorText(res: Response, body: JsonBody, what = 'Request'): string {
    return typeof body.error === 'string' && body.error ? body.error : `${what} failed (HTTP ${res.status})`;
}
