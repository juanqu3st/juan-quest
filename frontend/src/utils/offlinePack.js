import axiosClient, { resolveMediaUrl, resolveStorageUrl } from '../api/axiosClient';
import { areAllVideosCached, cacheMediaWithRetry, VIDEO_CACHE_NAME } from './videoCache';

const PACK_STORAGE_KEY = 'juanquest_offline_pack_v1';
const IMAGE_CACHE_NAME = 'juanquest-offline-images-v1';

let activeSyncPromise = null;
const progressListeners = new Set();
let latestProgress = { percent: 0, label: '', completed: 0, total: 1 };

function emitProgress(next) {
    latestProgress = next;
    progressListeners.forEach((cb) => {
        try {
            cb(next);
        } catch {
            // ignore listener error
        }
    });
}

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

/**
 * Fast check (~5ms) to verify whether the quiz pack AND all media assets are already saved locally.
 */
export async function isFullOfflineBundleReady() {
    const pack = loadOfflinePack();
    if (!pack || !Array.isArray(pack.maps) || pack.maps.length === 0) return false;
    const videoUrls = (pack.media_manifest?.videos || []).map((p) => resolveMediaUrl(p)).filter(Boolean);
    return areAllVideosCached(videoUrls);
}

/**
 * Lightweight version & completeness check used when an installed app opens online
 * to detect CMS edits or missing assets and prompt a clean Force Update.
 */
export async function checkRemoteContentUpdate() {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        return { hasUpdate: false };
    }
    try {
        const { data: remotePack } = await axiosClient.get('/offline/pack', {
            params: { _t: Date.now() },
        });
        if (!remotePack || !Array.isArray(remotePack.maps)) {
            return { hasUpdate: false };
        }
        const localPack = loadOfflinePack();
        const versionChanged = !localPack || localPack.version !== remotePack.version;
        const remoteVideoUrls = (remotePack.media_manifest?.videos || [])
            .map((p) => resolveMediaUrl(p))
            .filter(Boolean);
        const allMediaPresent = await areAllVideosCached(remoteVideoUrls);

        return {
            hasUpdate: versionChanged || !allMediaPresent,
            remoteVersion: remotePack.version || null,
        };
    } catch {
        return { hasUpdate: false };
    }
}

async function runSharedSync({ includeVideos = true } = {}) {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        const existing = loadOfflinePack();
        if (existing) {
            emitProgress({ percent: 100, label: 'Handa na', completed: 1, total: 1 });
            return { pack: existing, videosOk: 0, videosTotal: 0, allVideosSaved: true };
        }
        throw new Error('Walang koneksyon sa internet.');
    }

    emitProgress({ percent: 6, label: 'Inihahanda ang JuanQuest...', completed: 0, total: 1 });

    const { data: pack } = await axiosClient.get('/offline/pack', {
        params: { _t: Date.now() },
    });
    if (!pack || !Array.isArray(pack.maps)) {
        throw new Error('Hindi nakuha ang datos ng app.');
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

    const lightTasks = [
        ...imageUrls.map((url) => ({ cache: IMAGE_CACHE_NAME, url, minBytes: 512 })),
        ...audioUrls.map((url) => ({ cache: VIDEO_CACHE_NAME, url, minBytes: 1024 })),
    ];
    const videoTasks = videoUrls.map((url) => ({
        cache: VIDEO_CACHE_NAME,
        url,
        minBytes: 50000,
    }));

    const totalWeight = lightTasks.length + videoTasks.length * 4;
    let doneWeight = 0;

    // 1. Download lightweight assets in batches of 4
    for (let i = 0; i < lightTasks.length; i += 4) {
        const batch = lightTasks.slice(i, i + 4);
        await Promise.all(
            batch.map(async (item) => {
                await cacheMediaWithRetry(item.url, {
                    cacheName: item.cache,
                    retries: 2,
                    minBytes: item.minBytes,
                });
                doneWeight += 1;
                const percent = Math.min(35, 8 + Math.round((doneWeight / Math.max(1, totalWeight)) * 88));
                emitProgress({
                    percent,
                    label: 'Nagda-download ng app...',
                    completed: doneWeight,
                    total: totalWeight,
                });
            })
        );
    }

    // 2. Download media sequentially with 3x retry & strict verification
    let videosOk = 0;
    for (let i = 0; i < videoTasks.length; i += 1) {
        const item = videoTasks[i];
        emitProgress({
            percent: Math.min(95, 10 + Math.round((doneWeight / Math.max(1, totalWeight)) * 85)),
            label: 'Nagda-download ng app...',
            completed: doneWeight,
            total: totalWeight,
        });
        const ok = await cacheMediaWithRetry(item.url, {
            cacheName: item.cache,
            retries: 3,
            minBytes: item.minBytes,
        });
        if (ok) videosOk += 1;
        doneWeight += 4;
        emitProgress({
            percent: Math.min(98, 10 + Math.round((doneWeight / Math.max(1, totalWeight)) * 88)),
            label: 'Tinatapos ang paghahanda...',
            completed: doneWeight,
            total: totalWeight,
        });
    }

    try {
        localStorage.setItem(PACK_STORAGE_KEY, JSON.stringify(pack));
    } catch {
        // Ignore localStorage quota error
    }

    const allSaved = videoUrls.length === 0 || (await areAllVideosCached(videoUrls));
    if (allSaved) {
        emitProgress({
            percent: 100,
            label: 'Handa na!',
            completed: totalWeight,
            total: totalWeight,
        });
    }

    return { pack, videosOk, videosTotal: videoUrls.length, allVideosSaved: allSaved };
}

/**
 * Download & verify 100% of JuanQuest offline assets with shared deduplication.
 */
export async function syncAllOfflineResources({ onProgress, includeVideos = true, strictVideos = false } = {}) {
    if (onProgress) {
        progressListeners.add(onProgress);
        if (activeSyncPromise && latestProgress.percent > 0) {
            onProgress(latestProgress);
        }
    }

    try {
        if (!activeSyncPromise) {
            activeSyncPromise = runSharedSync({ includeVideos }).finally(() => {
                activeSyncPromise = null;
            });
        }
        const result = await activeSyncPromise;

        if (strictVideos && includeVideos && result.videosTotal > 0 && !result.allVideosSaved) {
            throw new Error(
                'Hindi natapos ang pag-download ng app. Pakisuri ang iyong internet at subukan muli.'
            );
        }

        return result.pack;
    } finally {
        if (onProgress) {
            progressListeners.delete(onProgress);
        }
    }
}

/**
 * Silent background sync while online (used on web browser; installed PWA shows explicit Force Update UI).
 */
export function ensureSilentOfflineCache() {
    if (typeof window === 'undefined' || navigator.onLine === false) return;
    if (activeSyncPromise) return;

    syncAllOfflineResources({ includeVideos: true, strictVideos: false }).catch(() => {});
}
