// Reliable Browser Cache API wrapper for per-map MP4 story videos & audio.
// Guarantees full 200 OK binary caching (never truncated partial 206 streams) for 100% offline playback.

export const VIDEO_CACHE_NAME = 'juanquest-story-videos-v6';

// Automatically purge outdated video cache buckets when upgraded videos ship
if (typeof window !== 'undefined' && 'caches' in window) {
    caches
        .keys()
        .then((keys) => {
            keys.forEach((k) => {
                if (k.startsWith('juanquest-story-videos-') && k !== VIDEO_CACHE_NAME) {
                    caches.delete(k).catch(() => {});
                }
            });
        })
        .catch(() => {});
}

export async function hasCachedVideo(rawUrl) {
    if (!rawUrl || typeof window === 'undefined' || !('caches' in window)) return false;
    try {
        const cache = await caches.open(VIDEO_CACHE_NAME);
        const match = await cache.match(rawUrl);
        if (!match) return false;
        const cl = Number(match.headers.get('content-length') || 0);
        if (cl > 0) return true;
        const blob = await match.clone().blob();
        return blob.size > 0;
    } catch {
        return false;
    }
}

export async function areAllVideosCached(videoUrls = []) {
    if (!Array.isArray(videoUrls) || videoUrls.length === 0) return true;
    if (typeof window === 'undefined' || !('caches' in window)) return false;
    try {
        const results = await Promise.all(videoUrls.map((u) => hasCachedVideo(u)));
        return results.every(Boolean);
    } catch {
        return false;
    }
}

/**
 * Download a full media binary (MP4 / audio) with automatic retries and verify the entire Blob
 * is persisted as a clean 200 OK Response in CacheStorage so offline playback NEVER falls back.
 */
export async function cacheMediaWithRetry(rawUrl, { cacheName = VIDEO_CACHE_NAME, retries = 3, minBytes = 1024 } = {}) {
    if (!rawUrl || typeof window === 'undefined' || !('caches' in window)) return false;

    const cache = await caches.open(cacheName);
    const existing = await cache.match(rawUrl);
    if (existing) {
        const cl = Number(existing.headers.get('content-length') || 0);
        if (cl >= minBytes) return true;
        try {
            const existingBlob = await existing.clone().blob();
            if (existingBlob.size >= minBytes) return true;
        } catch {
            // corrupted entry; re-download below
        }
        await cache.delete(rawUrl).catch(() => {});
    }

    for (let attempt = 1; attempt <= retries; attempt += 1) {
        try {
            const res = await fetch(rawUrl, {
                mode: 'cors',
                cache: attempt > 1 ? 'reload' : 'no-store',
            });
            if (!res.ok || res.status !== 200) {
                throw new Error(`HTTP ${res.status}`);
            }

            // Read the full binary body so truncated streams or partial 206 caches never get stored
            const blob = await res.blob();
            if (!blob || blob.size < minBytes) {
                throw new Error(`Incomplete media (${blob?.size || 0} bytes)`);
            }

            const contentType = res.headers.get('content-type') || blob.type || 'application/octet-stream';
            const cleanResponse = new Response(blob, {
                status: 200,
                statusText: 'OK',
                headers: {
                    'Content-Type': contentType,
                    'Content-Length': String(blob.size),
                },
            });
            await cache.put(rawUrl, cleanResponse);
            return true;
        } catch {
            if (attempt < retries) {
                await new Promise((resolve) => setTimeout(resolve, 650 * attempt));
            }
        }
    }

    return false;
}

export async function resolveCachedVideoUrl(rawUrl) {
    if (!rawUrl || typeof window === 'undefined' || !('caches' in window)) {
        return { url: rawUrl, isObjectUrl: false, fromCache: false };
    }

    try {
        const cache = await caches.open(VIDEO_CACHE_NAME);
        const cached = await cache.match(rawUrl);
        if (cached) {
            const blob = await cached.blob();
            if (blob.size > 0) {
                return { url: URL.createObjectURL(blob), isObjectUrl: true, fromCache: true };
            }
        }

        // Only attempt background caching when online
        if (typeof navigator === 'undefined' || navigator.onLine !== false) {
            cacheMediaWithRetry(rawUrl, { cacheName: VIDEO_CACHE_NAME, retries: 2, minBytes: 50000 }).catch(() => {});
        }
    } catch {
        // Fallback smoothly to direct streaming URL when online
    }

    return { url: rawUrl, isObjectUrl: false, fromCache: false };
}
