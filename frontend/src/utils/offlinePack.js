import axiosClient, { resolveMediaUrl, resolveStorageUrl } from '../api/axiosClient';
import { VIDEO_CACHE_NAME } from './videoCache';

const PACK_STORAGE_KEY = 'juanquest_offline_pack_v1';
const IMAGE_CACHE_NAME = 'juanquest-offline-images-v1';

let activeSyncPromise = null;

/**
 * Pure-JS SHA-256 fallback so hashing works even on non-HTTPS LAN URLs where crypto.subtle is unavailable.
 */
function sha256Fallback(ascii) {
    const rightRotate = (value, amount) => (value >>> amount) | (value << (32 - amount));
    const mathPow = Math.pow;
    const maxWord = mathPow(2, 32);
    let result = '';

    const words = [];
    const utf8 = unescape(encodeURIComponent(ascii));
    const bitLength = utf8.length * 8;

    let hash = (sha256Fallback._h = sha256Fallback._h || []);
    let k = (sha256Fallback._k = sha256Fallback._k || []);
    let primeCounter = k.length;
    const isComposite = {};

    for (let candidate = 2; primeCounter < 64; candidate += 1) {
        if (!isComposite[candidate]) {
            for (let i = 0; i < 313; i += candidate) isComposite[i] = candidate;
            hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
            k[primeCounter] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
            primeCounter += 1;
        }
    }

    const padded = utf8 + '\x80';
    let msg = padded;
    while ((msg.length % 64) - 56) msg += '\x00';
    for (let i = 0; i < msg.length; i += 1) {
        const j = msg.charCodeAt(i);
        words[i >> 2] |= j << (((3 - i) % 4) * 8);
    }
    words[words.length] = (bitLength / maxWord) | 0;
    words[words.length] = bitLength;

    const h = hash.slice(0, 8);
    for (let j = 0; j < words.length; ) {
        const w = words.slice(j, (j += 16));
        const oldHash = h.slice(0);

        for (let i = 0; i < 64; i += 1) {
            const w15 = w[i - 15];
            const w2 = w[i - 2];
            const a = h[0];
            const e = h[4];
            const temp1 =
                h[7] +
                (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)) +
                ((e & h[5]) ^ (~e & h[6])) +
                k[i] +
                (w[i] =
                    i < 16
                        ? w[i]
                        : (w[i - 16] +
                              (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3)) +
                              w[i - 7] +
                              (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))) |
                          0);
            const temp2 =
                (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)) +
                ((a & h[1]) ^ (a & h[2]) ^ (h[1] & h[2]));
            h.unshift((temp1 + temp2) | 0);
            h[4] = (h[4] + temp1) | 0;
            h.pop();
        }
        for (let i = 0; i < 8; i += 1) h[i] = (h[i] + oldHash[i]) | 0;
    }

    for (let i = 0; i < 8; i += 1) {
        for (let j = 3; j >= 0; j -= 1) {
            const b = (h[i] >> (j * 8)) & 255;
            result += (b < 16 ? '0' : '') + b.toString(16);
        }
    }
    return result;
}

export async function sha256Hex(message) {
    const str = String(message ?? '');
    if (typeof window !== 'undefined' && window.crypto?.subtle) {
        try {
            const data = new TextEncoder().encode(str);
            const digest = await window.crypto.subtle.digest('SHA-256', data);
            return Array.from(new Uint8Array(digest))
                .map((b) => b.toString(16).padStart(2, '0'))
                .join('');
        } catch {
            // Fall through to pure JS implementation
        }
    }
    return sha256Fallback(str);
}

export function loadOfflinePack() {
    try {
        const raw = localStorage.getItem(PACK_STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

export function hasOfflinePack() {
    const pack = loadOfflinePack();
    return Boolean(pack && Array.isArray(pack.maps) && pack.maps.length > 0);
}

async function cacheUrlIfMissing(cacheName, url) {
    if (!url || typeof window === 'undefined' || !('caches' in window)) return false;
    try {
        const cache = await caches.open(cacheName);
        const existing = await cache.match(url);
        if (existing) return true;
        const res = await fetch(url, { mode: 'cors' });
        if (res.ok && res.status === 200) {
            await cache.put(url, res.clone());
            return true;
        }
    } catch {
        // Ignore single-asset failure so remaining assets still cache cleanly
    }
    return false;
}

/**
 * Download & cache 100% of JuanQuest offline assets (hashed quiz pack, all 25 challenge images,
 * all audio voice-overs, and all 5 Cloudinary 3D story MP4 videos) with live progress callback.
 */
export async function syncAllOfflineResources({ onProgress, includeVideos = true } = {}) {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        const existing = loadOfflinePack();
        if (existing) {
            onProgress?.({ percent: 100, label: 'Handa na', completed: 1, total: 1 });
            return existing;
        }
        throw new Error('Walang koneksyon sa internet.');
    }

    onProgress?.({ percent: 5, label: 'Kinukuha ang datos ng aralin...', completed: 0, total: 1 });

    const { data: pack } = await axiosClient.get('/offline/pack');
    if (!pack || !Array.isArray(pack.maps)) {
        throw new Error('Hindi nakuha ang datos ng aralin.');
    }

    try {
        localStorage.setItem(PACK_STORAGE_KEY, JSON.stringify(pack));
    } catch {
        // Ignore localStorage quota error
    }

    const imageUrls = (pack.media_manifest?.images || [])
        .map((p) => resolveStorageUrl(p))
        .filter(Boolean);
    const audioUrls = (pack.media_manifest?.audio || [])
        .map((p) => resolveMediaUrl(p))
        .filter(Boolean);
    const videoUrls = includeVideos
        ? (pack.media_manifest?.videos || []).map((p) => resolveMediaUrl(p)).filter(Boolean)
        : [];

    const tasks = [
        ...imageUrls.map((url) => ({ cache: IMAGE_CACHE_NAME, url, label: 'Inihahanda ang mga larawan...' })),
        ...audioUrls.map((url) => ({ cache: VIDEO_CACHE_NAME, url, label: 'Inihahanda ang mga tunog...' })),
        ...videoUrls.map((url, idx) => ({
            cache: VIDEO_CACHE_NAME,
            url,
            label: `Inihahanda ang Story Video ${idx + 1}/${videoUrls.length}...`,
        })),
    ];

    const total = Math.max(1, tasks.length);
    let completed = 0;

    // Fetch lightweight images/audio in small batches of 4, then sequential MP4 videos for stability on phones
    const lightTasks = tasks.filter((t) => !t.label.includes('Story Video'));
    const heavyTasks = tasks.filter((t) => t.label.includes('Story Video'));

    for (let i = 0; i < lightTasks.length; i += 4) {
        const batch = lightTasks.slice(i, i + 4);
        await Promise.all(
            batch.map(async (item) => {
                await cacheUrlIfMissing(item.cache, item.url);
                completed += 1;
                const percent = Math.min(98, 8 + Math.round((completed / total) * 90));
                onProgress?.({ percent, label: item.label, completed, total });
            })
        );
    }

    for (const item of heavyTasks) {
        onProgress?.({
            percent: Math.min(98, 8 + Math.round((completed / total) * 90)),
            label: item.label,
            completed,
            total,
        });
        await cacheUrlIfMissing(item.cache, item.url);
        completed += 1;
        const percent = Math.min(99, 8 + Math.round((completed / total) * 91));
        onProgress?.({ percent, label: item.label, completed, total });
    }

    onProgress?.({ percent: 100, label: 'Kumpleto na!', completed: total, total });
    return pack;
}

/**
 * Silent background precache (zero UI noise while online) so even users who install directly
 * via the browser menu automatically have all 3D models, images, audio, and 5 videos ready offline.
 */
export function ensureSilentOfflineCache() {
    if (typeof window === 'undefined' || navigator.onLine === false) return;
    if (activeSyncPromise) return;

    activeSyncPromise = syncAllOfflineResources({ includeVideos: true })
        .catch(() => {})
        .finally(() => {
            activeSyncPromise = null;
        });
}
