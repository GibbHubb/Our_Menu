// OM72 — what the admin Sync shows after each press of `/api/recipes/embed`.

export interface EmbedSyncResult {
    embedded: number;
    skipped: number;
    failed: number;
    remaining: number;
    /** Gemini answered 429 and the batch stopped early. */
    busy?: boolean;
    since?: string;
}

/** One line: what this press did and whether to press again. */
export function embedSyncSummary(r: EmbedSyncResult): string {
    const parts = [`${r.embedded} embedded`, `${r.skipped} already done`];
    if (r.failed) parts.push(`${r.failed} failed`);
    let line = parts.join(', ') + '.';
    if (r.busy) line += ' Gemini is busy, wait a minute.';
    if (r.remaining > 0) {
        line += ` ${r.remaining} remaining: press again.`;
        if (r.embedded === 0 && !r.busy) line += ' (No progress this time: check the server log.)';
    } else {
        line += ' All recipes embedded.';
    }
    return line;
}
