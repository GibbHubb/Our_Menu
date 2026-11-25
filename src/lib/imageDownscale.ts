// OM74 — shrink a receipt photo in the browser before it is uploaded.
//
// A phone photo is often 5-8 MB. Vercel refuses request bodies over 4.5 MB before the route runs, so
// those never reached `receipts/scan` at all. Re-encoding to JPEG with the long edge at most 1600 px
// (quality 0.8) gives a few hundred KB, still plenty for Gemini to read a receipt. It also converts an
// iPhone HEIC to JPEG whenever the browser can decode HEIC (Safari can; most others cannot, and get a
// clear message rather than a 415).

export const MAX_LONG_EDGE = 1600;
export const JPEG_QUALITY = 0.8;
/** An accepted type already this small (and within MAX_LONG_EDGE) is sent untouched. */
export const PASS_THROUGH_BYTES = 1.5 * 1024 * 1024;
// OM75 — JPEG is no longer passed through. A phone JPEG stores its pixels sideways plus an EXIF
// Orientation tag, and the small-file pass-through sent that file on as-is, so the receipt reached
// Gemini rotated unless it honoured the tag. A JPEG is now always re-encoded: decode() draws it with
// `imageOrientation: 'from-image'`, so the pixels come out upright and the new file has no tag. That
// is cheaper and sturdier than parsing EXIF here (a few ms of canvas work on an already-small photo).
// PNG and WebP from a screenshot carry no orientation tag in practice, so they still pass through.
const PASS_THROUGH_TYPES = ['image/png', 'image/webp'];

export const UNREADABLE_PHOTO_MESSAGE =
    "Couldn't read that photo in this browser (HEIC from an iPhone often does this). " +
    'Take a screenshot of it, or set the camera to "Most Compatible", and try again.';

/** Thrown when the browser cannot decode the chosen file. Its message is safe to show. */
export class UnreadablePhotoError extends Error {
    constructor() {
        super(UNREADABLE_PHOTO_MESSAGE);
        this.name = 'UnreadablePhotoError';
    }
}

/** Width and height scaled so the long edge is at most `max`, never upscaled, at least 1 px. */
export function fitWithin(width: number, height: number, max = MAX_LONG_EDGE): { width: number; height: number } {
    const long = Math.max(width, height);
    if (!(long > max)) return { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) };
    const k = max / long;
    return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) };
}

/**
 * May the original file be uploaded untouched? Only a PNG or WebP that is already small and whose
 * decoded size needs no downscale. Never a JPEG (see PASS_THROUGH_TYPES).
 */
export function canPassThrough(
    type: string,
    size: number,
    decoded: { width: number; height: number },
    fitted: { width: number; height: number },
): boolean {
    return (
        PASS_THROUGH_TYPES.includes(type.toLowerCase()) &&
        size <= PASS_THROUGH_BYTES &&
        fitted.width === decoded.width &&
        fitted.height === decoded.height
    );
}

type Decoded = { source: CanvasImageSource; width: number; height: number; close: () => void };

async function decode(file: Blob): Promise<Decoded> {
    if (typeof createImageBitmap === 'function') {
        try {
            const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
            return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
        } catch {
            /* fall back to <img>, which some browsers decode more formats with */
        }
    }
    const url = URL.createObjectURL(file);
    try {
        const img = new Image();
        img.src = url;
        await img.decode();
        return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
    } catch {
        URL.revokeObjectURL(url);
        throw new UnreadablePhotoError();
    }
}

/**
 * The photo to upload: the original when it is a small, in-bounds PNG or WebP, else (always for a JPEG) a JPEG
 * re-encode with the long edge at most MAX_LONG_EDGE. Throws UnreadablePhotoError when it cannot decode.
 */
export async function downscaleImage(file: File): Promise<File> {
    const decoded = await decode(file);
    try {
        const { width, height } = fitWithin(decoded.width, decoded.height);
        if (canPassThrough(file.type, file.size, decoded, { width, height })) return file;
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new UnreadablePhotoError();
        // JPEG has no alpha: paint white first so a transparent PNG does not come out black.
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(decoded.source, 0, 0, width, height);
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
        if (!blob) throw new UnreadablePhotoError();
        const name = (file.name || 'receipt').replace(/\.[^.]+$/, '') + '.jpg';
        return new File([blob], name, { type: 'image/jpeg' });
    } finally {
        decoded.close();
    }
}
