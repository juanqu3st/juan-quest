import { resolveCachedAudioUrl } from './videoCache';

// Feedback & lesson audio controller: teacher-uploaded voice recordings + crisp Web Audio chimes (zero robotic AI TTS).

const MUTE_KEY = 'juanquest_audio_muted';
const VOLUME_KEY = 'juanquest_audio_volume';
export const DEFAULT_WORLD_BGM_URL = '/audio/world-bgm.mp3';
const BGM_VOLUME_SCALE = 0.28;

let audioCtx = null;
let activeFeedbackEl = null;
let activeFeedbackBlobUrl = null;
let activeFeedbackResolve = null;
let activePromptEl = null;
let activePromptBlobUrl = null;

// Zero-latency Web Audio World Map BGM state (decoded AudioBuffer cached in RAM -> < 1ms resume!)
const bgmBufferCache = new Map();
const bgmLoadingMap = new Map();
let bgmDesiredPlaying = false;
let bgmDesiredUrl = DEFAULT_WORLD_BGM_URL;
let bgmActiveSource = null;
let bgmActiveGain = null;
let bgmActiveUrl = null;
let bgmStartedCtxTime = 0;
let bgmOffsetSec = 0;
let bgmGestureHooked = false;
let bgmVisibilityHooked = false;

// Pre-built warm pink-noise buffer for organic dirt-road walking footsteps (0ms latency, zero GC)
let footstepNoiseBuffer = null;
let footstepSide = 0;

// In-memory preloaded Blob URL cache for instant 0ms praise/wrong audio playback (especially over production Cloudinary!)
const preloadedFeedbackMap = new Map();
const preloadingFeedbackPromises = new Map();

function settleActiveFeedback() {
    if (activeFeedbackResolve) {
        const resolve = activeFeedbackResolve;
        activeFeedbackResolve = null;
        try {
            resolve();
        } catch {
            // ignore
        }
    }
}

/**
 * Preload teacher-uploaded praise/wrong audio into memory Blob URLs as soon as a map opens
 * so answering a question plays feedback at 0ms lag even on production mobile networks.
 */
export function preloadFeedbackAudio(urls = []) {
    if (typeof window === 'undefined' || !Array.isArray(urls)) return;
    urls.forEach((rawUrl) => {
        if (!rawUrl || typeof rawUrl !== 'string') return;
        if (preloadedFeedbackMap.has(rawUrl) || preloadingFeedbackPromises.has(rawUrl)) return;

        const job = resolveCachedAudioUrl(rawUrl)
            .then(async ({ url, isObjectUrl }) => {
                if (isObjectUrl && url) {
                    preloadedFeedbackMap.set(rawUrl, url);
                    return url;
                }
                // Warm fetch into an in-memory Blob URL so first playback never waits for Cloudinary TLS/buffering
                const targetUrl = url || rawUrl;
                try {
                    const res = await fetch(targetUrl, { mode: 'cors' });
                    if (res.ok) {
                        const blob = await res.blob();
                        if (blob && blob.size > 0) {
                            const objUrl = URL.createObjectURL(blob);
                            preloadedFeedbackMap.set(rawUrl, objUrl);
                            return objUrl;
                        }
                    }
                } catch {
                    // Fallback: warm browser HTTP cache via lightweight Audio preload
                }
                return targetUrl;
            })
            .catch(() => null)
            .finally(() => {
                preloadingFeedbackPromises.delete(rawUrl);
            });

        preloadingFeedbackPromises.set(rawUrl, job);
    });
}

function revokeFeedbackBlob() {
    if (activeFeedbackBlobUrl) {
        try {
            URL.revokeObjectURL(activeFeedbackBlobUrl);
        } catch {
            // ignore
        }
        activeFeedbackBlobUrl = null;
    }
}

function revokePromptBlob() {
    if (activePromptBlobUrl) {
        try {
            URL.revokeObjectURL(activePromptBlobUrl);
        } catch {
            // ignore
        }
        activePromptBlobUrl = null;
    }
}

function getAudioContext() {
    if (typeof window === 'undefined') return null;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    if (!audioCtx) audioCtx = new Ctx();
    if (audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
    }
    return audioCtx;
}

/** Call inside any user tap/click to unlock browser Web Audio cleanly. */
export function unlockAudio() {
    getAudioContext();
}

export function getAudioVolume() {
    try {
        const raw = localStorage.getItem(VOLUME_KEY);
        if (raw !== null && raw !== '') {
            const parsed = Number(raw);
            if (Number.isFinite(parsed)) {
                return Math.max(0, Math.min(1, parsed));
            }
        }
        return localStorage.getItem(MUTE_KEY) === '1' ? 0 : 0.85;
    } catch {
        return 0.85;
    }
}

export function setAudioVolume(nextVolume) {
    const clamped = Math.max(0, Math.min(1, Number(nextVolume) || 0));
    try {
        localStorage.setItem(VOLUME_KEY, String(Number(clamped.toFixed(2))));
        localStorage.setItem(MUTE_KEY, clamped <= 0 ? '1' : '0');
    } catch {
        // ignore storage restrictions
    }
    if (clamped <= 0) {
        stopAllFeedbackAudio();
        stopBgmNodeImmediate(0.08);
    } else {
        if (activeFeedbackEl) activeFeedbackEl.volume = clamped * 0.95;
        if (activePromptEl) activePromptEl.volume = clamped * 0.95;
        if (bgmActiveGain && audioCtx) {
            const now = audioCtx.currentTime;
            bgmActiveGain.gain.cancelScheduledValues(now);
            bgmActiveGain.gain.setValueAtTime(Math.max(0.0001, bgmActiveGain.gain.value), now);
            bgmActiveGain.gain.linearRampToValueAtTime(Math.max(0.0001, clamped * BGM_VOLUME_SCALE), now + 0.08);
        } else if (bgmDesiredPlaying && !(typeof document !== 'undefined' && document.hidden)) {
            startBgmPlaybackNow();
        }
    }
    if (typeof window !== 'undefined') {
        try {
            window.dispatchEvent(new CustomEvent('juanquest:volume-change', { detail: clamped }));
        } catch {
            // ignore
        }
    }
    return clamped;
}

export function isAudioMuted() {
    return getAudioVolume() <= 0;
}

export function setAudioMuted(muted) {
    setAudioVolume(muted ? 0 : Math.max(0.8, getAudioVolume() || 0.85));
}

export function stopAllFeedbackAudio() {
    if (activeFeedbackEl) {
        activeFeedbackEl.onended = null;
        activeFeedbackEl.onerror = null;
        try {
            activeFeedbackEl.pause();
            activeFeedbackEl.currentTime = 0;
        } catch {
            // ignore
        }
        activeFeedbackEl = null;
    }
    revokeFeedbackBlob();
    settleActiveFeedback();
    if (activePromptEl) {
        try {
            activePromptEl.pause();
            activePromptEl.currentTime = 0;
        } catch {
            // ignore
        }
        activePromptEl = null;
    }
    revokePromptBlob();
}

function playFallbackTone(type) {
    const vol = getAudioVolume();
    if (vol <= 0) return;
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const playNote = (freq, startOffset, duration, peakGain, wave = 'sine') => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = wave;
        osc.frequency.setValueAtTime(freq, now + startOffset);
        gain.gain.setValueAtTime(0.0001, now + startOffset);
        gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peakGain * vol), now + startOffset + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + startOffset + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + startOffset);
        osc.stop(now + startOffset + duration + 0.02);
    };

    if (type === 'correct') {
        playNote(523.25, 0, 0.14, 0.24, 'sine');
        playNote(659.25, 0.06, 0.16, 0.26, 'sine');
        playNote(783.99, 0.12, 0.24, 0.22, 'triangle');
    } else if (type === 'complete') {
        playNote(523.25, 0, 0.14, 0.24, 'sine');
        playNote(659.25, 0.07, 0.16, 0.25, 'sine');
        playNote(783.99, 0.14, 0.18, 0.25, 'sine');
        playNote(1046.5, 0.21, 0.36, 0.26, 'triangle');
    } else {
        playNote(293.66, 0, 0.12, 0.2, 'triangle');
        playNote(220.0, 0.09, 0.2, 0.2, 'sine');
    }
}

/**
 * Play teacher-uploaded praise/wrong audio if configured; otherwise play clear chime + Filipino voice fallback.
 */
const HAPTIC_PATTERNS = {
    tap: [8],
    pair: [12],
    correct: [18],
    wrong: [35, 30, 35],
    tick: [6],
    unlock: [20, 40, 30],
    victory: [20, 40, 30],
};

/** Gentle Android haptic pulse (respects prefers-reduced-motion & fails silently on iOS/desktop). */
export function triggerHaptic(kind = 'tap') {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return;
    if (typeof navigator.vibrate !== 'function') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return;
    const pattern = HAPTIC_PATTERNS[kind];
    if (!pattern) return;
    try {
        navigator.vibrate(pattern);
    } catch {
        // ignore unsupported browser/gesture error
    }
}

export function playUiTap(freq = 520) {
    triggerHaptic('tap');
    const vol = getAudioVolume();
    if (vol <= 0) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.26, now + 0.045);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, 0.055 * vol), now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.06);
}

export function playPairSnap() {
    triggerHaptic('pair');
    const vol = getAudioVolume();
    if (vol <= 0) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(460, now);
    osc.frequency.exponentialRampToValueAtTime(720, now + 0.06);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, 0.06 * vol), now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.065);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.08);
}

export function playTimerTick() {
    triggerHaptic('tick');
    const vol = getAudioVolume();
    if (vol <= 0) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, 0.042 * vol), now + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.036);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.05);
}

export function playVictoryFanfare() {
    triggerHaptic('victory');
    const vol = getAudioVolume();
    if (vol <= 0) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + i * 0.075);
        gain.gain.setValueAtTime(0.0001, now + i * 0.075);
        gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, 0.085 * vol), now + i * 0.075 + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.075 + 0.28);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + i * 0.075);
        osc.stop(now + i * 0.075 + 0.31);
    });
}

export function playFeedbackAudio(type, customUrl, spokenText, options = {}) {
    const minWaitMs = Math.max(0, Number(options.minWaitMs ?? 0));
    const maxWaitMs = Math.max(minWaitMs + 200, Number(options.maxWaitMs ?? 3600));

    if (type === 'correct') triggerHaptic('correct');
    else if (type === 'complete') triggerHaptic('victory');
    else if (type === 'wrong') triggerHaptic('wrong');

    if (activeFeedbackEl) {
        activeFeedbackEl.onended = null;
        activeFeedbackEl.onerror = null;
        try {
            activeFeedbackEl.pause();
            activeFeedbackEl.currentTime = 0;
        } catch {
            // ignore
        }
        activeFeedbackEl = null;
    }
    revokeFeedbackBlob();
    settleActiveFeedback();

    if (isAudioMuted()) {
        if (minWaitMs <= 0) return Promise.resolve();
        return new Promise((resolve) => setTimeout(resolve, minWaitMs));
    }

    const startedAt = Date.now();

    return new Promise((resolve) => {
        let settled = false;
        let maxTimer = null;
        let minTimer = null;

        const finishNow = () => {
            if (settled) return;
            settled = true;
            clearTimeout(maxTimer);
            clearTimeout(minTimer);
            if (activeFeedbackResolve === finishImmediate) {
                activeFeedbackResolve = null;
            }
            resolve();
        };

        const finishImmediate = () => finishNow();

        const finishRespectingMin = () => {
            if (settled) return;
            const elapsed = Date.now() - startedAt;
            const remaining = minWaitMs - elapsed;
            if (remaining > 16) {
                clearTimeout(minTimer);
                minTimer = setTimeout(finishNow, remaining);
            } else {
                finishNow();
            }
        };

        activeFeedbackResolve = finishImmediate;
        maxTimer = setTimeout(finishNow, maxWaitMs);

        const playFallbackAndWait = () => {
            // Clean Web Audio chime only — never use robotic browser AI speechSynthesis!
            playFallbackTone(type);
            const chimeMs = type === 'complete' ? 620 : 420;
            minTimer = setTimeout(finishRespectingMin, chimeMs);
        };

        const startCustomPlayback = (srcUrl, ownsBlobUrl) => {
            if (settled || !srcUrl || isAudioMuted()) {
                if (ownsBlobUrl && srcUrl) URL.revokeObjectURL(srcUrl);
                finishRespectingMin();
                return;
            }
            const audio = new Audio(srcUrl);
            audio.volume = Math.max(0, Math.min(1, getAudioVolume() * 0.95));
            activeFeedbackEl = audio;
            if (ownsBlobUrl) activeFeedbackBlobUrl = srcUrl;

            const cleanupAndFinish = (fallback = false) => {
                audio.onended = null;
                audio.onerror = null;
                if (activeFeedbackEl === audio) {
                    activeFeedbackEl = null;
                    if (ownsBlobUrl) revokeFeedbackBlob();
                } else if (ownsBlobUrl) {
                    URL.revokeObjectURL(srcUrl);
                }
                if (fallback && !settled) {
                    playFallbackAndWait();
                } else {
                    finishRespectingMin();
                }
            };

            audio.onended = () => cleanupAndFinish(false);
            audio.onerror = () => cleanupAndFinish(true);

            const playPromise = audio.play();
            if (playPromise && typeof playPromise.catch === 'function') {
                playPromise.catch(() => cleanupAndFinish(true));
            }
        };

        if (customUrl) {
            // Instant 0ms synchronous playback when preloaded!
            const preloadedUrl = preloadedFeedbackMap.get(customUrl);
            if (preloadedUrl) {
                startCustomPlayback(preloadedUrl, false);
                return;
            }

            // Otherwise resolve from CacheStorage or network (still guarded cleanly by maxTimer)
            resolveCachedAudioUrl(customUrl)
                .then(({ url, isObjectUrl }) => {
                    if (settled) {
                        if (isObjectUrl && url) URL.revokeObjectURL(url);
                        return;
                    }
                    if (isObjectUrl && url) {
                        preloadedFeedbackMap.set(customUrl, url);
                        startCustomPlayback(url, false);
                    } else {
                        startCustomPlayback(url || customUrl, false);
                    }
                })
                .catch(() => {
                    if (!settled) playFallbackAndWait();
                });
            return;
        }

        playFallbackAndWait();
    });
}

/**
 * Crisp mechanical unlock click + ascending golden sparkle arpeggio for PadlockUnlockOverlay.
 */
export function playUnlockChime() {
    triggerHaptic('unlock');
    const vol = getAudioVolume();
    if (vol <= 0) return;
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const playSparkle = (freq, offset, dur, peak, wave = 'triangle') => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = wave;
        osc.frequency.setValueAtTime(freq, now + offset);
        gain.gain.setValueAtTime(0.0001, now + offset);
        gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak * vol), now + offset + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + dur);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + offset);
        osc.stop(now + offset + dur + 0.03);
    };

    // Tiny crisp latch pop
    playSparkle(420, 0, 0.055, 0.14, 'sine');
    // Ascending shimmering golden chord (D5 -> A5 -> D6 -> F#6)
    playSparkle(587.33, 0.03, 0.22, 0.2, 'triangle');
    playSparkle(880.0, 0.085, 0.24, 0.19, 'sine');
    playSparkle(1174.66, 0.145, 0.3, 0.18, 'triangle');
    playSparkle(1479.98, 0.21, 0.42, 0.15, 'sine');
}

/**
 * Play or stop an optional map prompt / panuto narration audio clip.
 */
export function togglePromptAudio(url, onEnd) {
    if (activePromptEl) {
        try {
            activePromptEl.pause();
            activePromptEl.currentTime = 0;
        } catch {
            // ignore
        }
        activePromptEl = null;
        revokePromptBlob();
        onEnd?.();
        return false;
    }
    if (!url || isAudioMuted()) return false;
    try {
        const audio = new Audio();
        audio.volume = Math.max(0, Math.min(1, getAudioVolume() * 0.95));
        activePromptEl = audio;
        const finish = () => {
            if (activePromptEl === audio) {
                activePromptEl = null;
                revokePromptBlob();
            }
            onEnd?.();
        };
        audio.onended = finish;
        audio.onerror = finish;

        resolveCachedAudioUrl(url)
            .then(({ url: resolvedUrl, isObjectUrl }) => {
                if (activePromptEl !== audio) {
                    if (isObjectUrl && resolvedUrl) URL.revokeObjectURL(resolvedUrl);
                    return;
                }
                if (isObjectUrl) activePromptBlobUrl = resolvedUrl;
                audio.src = resolvedUrl || url;
                audio.play().catch(finish);
            })
            .catch(() => {
                if (activePromptEl !== audio) return;
                audio.src = url;
                audio.play().catch(finish);
            });
        return true;
    } catch {
        return false;
    }
}

function getFootstepNoiseBuffer(ctx) {
    if (footstepNoiseBuffer && footstepNoiseBuffer.sampleRate === ctx.sampleRate) {
        return footstepNoiseBuffer;
    }
    const len = Math.floor(ctx.sampleRate * 0.16);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    // Warm pink-tinted noise (Paul Kellet filter) so soil steps sound earthy, never harsh
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    for (let i = 0; i < len; i += 1) {
        const white = Math.random() * 2 - 1;
        b0 = 0.997 * b0 + white * 0.029;
        b1 = 0.985 * b1 + white * 0.032;
        b2 = 0.95 * b2 + white * 0.048;
        data[i] = Math.max(-1, Math.min(1, (b0 + b1 + b2 + white * 0.12) * 1.9));
    }
    footstepNoiseBuffer = buf;
    return buf;
}

/**
 * Soft, warm barrio dirt-road footstep synced to each character stride (0ms latency, online & offline).
 */
export function playFootstepSfx() {
    const vol = getAudioVolume();
    if (vol <= 0) return;
    if (typeof document !== 'undefined' && document.hidden) return;
    const ctx = getAudioContext();
    if (!ctx || ctx.state !== 'running') return;

    const side = footstepSide;
    footstepSide = (footstepSide + 1) % 2;
    const now = ctx.currentTime;
    const jitter = (Math.random() - 0.5) * 7;

    // Optional subtle left/right panner
    const outNode = typeof ctx.createStereoPanner === 'function' ? ctx.createStereoPanner() : null;
    if (outNode) {
        outNode.pan.setValueAtTime(side === 0 ? -0.14 : 0.14, now);
        outNode.connect(ctx.destination);
    }
    const dest = outNode || ctx.destination;

    // 1) Muffled earthen heel-plant thump
    const thumpOsc = ctx.createOscillator();
    const thumpGain = ctx.createGain();
    const baseFreq = (side === 0 ? 95 : 85) + jitter;
    thumpOsc.type = 'sine';
    thumpOsc.frequency.setValueAtTime(baseFreq, now);
    thumpOsc.frequency.exponentialRampToValueAtTime(Math.max(44, baseFreq * 0.54), now + 0.075);
    thumpGain.gain.setValueAtTime(0.0001, now);
    thumpGain.gain.linearRampToValueAtTime(Math.max(0.0002, 0.28 * vol), now + 0.009);
    thumpGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.095);
    thumpOsc.connect(thumpGain);
    thumpGain.connect(dest);
    thumpOsc.start(now);
    thumpOsc.stop(now + 0.11);

    // 2) Soft soil/sand brush (band-passed warm pink noise — heel plant + gentle toe lift)
    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = getFootstepNoiseBuffer(ctx);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime((side === 0 ? 920 : 840) + jitter * 14, now);
    bp.Q.setValueAtTime(1.05, now);

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1750, now);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.0001, now);
    noiseGain.gain.linearRampToValueAtTime(Math.max(0.0002, 0.22 * vol), now + 0.018);
    noiseGain.gain.linearRampToValueAtTime(Math.max(0.0002, 0.09 * vol), now + 0.048);
    noiseGain.gain.linearRampToValueAtTime(Math.max(0.0002, 0.14 * vol), now + 0.068);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.125);

    noiseSrc.connect(bp);
    bp.connect(lp);
    lp.connect(noiseGain);
    noiseGain.connect(dest);
    noiseSrc.start(now);
    noiseSrc.stop(now + 0.14);
}

function stopBgmNodeImmediate(fadeSec = 0.09) {
    if (!bgmActiveSource) return;
    const src = bgmActiveSource;
    const gain = bgmActiveGain;
    const prevUrl = bgmActiveUrl;
    const prevBuf = prevUrl ? bgmBufferCache.get(prevUrl) : null;

    if (audioCtx && prevBuf && prevBuf.duration > 0) {
        const elapsed = Math.max(0, audioCtx.currentTime - bgmStartedCtxTime);
        bgmOffsetSec = (bgmOffsetSec + elapsed) % prevBuf.duration;
    }

    bgmActiveSource = null;
    bgmActiveGain = null;
    bgmActiveUrl = null;

    try {
        if (gain && audioCtx) {
            const now = audioCtx.currentTime;
            gain.gain.cancelScheduledValues(now);
            gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), now);
            gain.gain.linearRampToValueAtTime(0.0001, now + fadeSec);
        }
    } catch {
        // ignore
    }

    setTimeout(() => {
        try {
            src.stop();
        } catch {
            // already stopped
        }
        try {
            src.disconnect();
            gain?.disconnect();
        } catch {
            // ignore
        }
    }, Math.round(fadeSec * 1000) + 25);
}

function ensureBgmLifecycleHooks() {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    if (!bgmVisibilityHooked) {
        bgmVisibilityHooked = true;
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                stopBgmNodeImmediate(0.06);
            } else if (bgmDesiredPlaying && getAudioVolume() > 0) {
                const ctx = getAudioContext();
                if (ctx && ctx.state === 'suspended') {
                    ctx.resume().then(() => {
                        if (bgmDesiredPlaying && !document.hidden) startBgmPlaybackNow();
                    }).catch(() => {});
                } else {
                    startBgmPlaybackNow();
                }
            }
        });
    }
    if (!bgmGestureHooked) {
        bgmGestureHooked = true;
        const onGesture = () => {
            const ctx = getAudioContext();
            if (!ctx) return;
            const resumeAndPlay = () => {
                if (bgmDesiredPlaying && !document.hidden && !bgmActiveSource && getAudioVolume() > 0) {
                    startBgmPlaybackNow();
                }
            };
            if (ctx.state === 'suspended') {
                ctx.resume().then(resumeAndPlay).catch(() => {});
            } else {
                resumeAndPlay();
            }
        };
        window.addEventListener('pointerdown', onGesture, { passive: true, capture: true });
        window.addEventListener('touchstart', onGesture, { passive: true, capture: true });
        window.addEventListener('keydown', onGesture, { passive: true, capture: true });
    }
}

async function fetchAndDecodeBgmBuffer(targetUrl) {
    if (bgmBufferCache.has(targetUrl)) return bgmBufferCache.get(targetUrl);
    if (bgmLoadingMap.has(targetUrl)) return bgmLoadingMap.get(targetUrl);

    const job = (async () => {
        const ctx = getAudioContext();
        if (!ctx) return null;

        let fetchUrl = targetUrl;
        let tempObjectUrl = null;
        const isLocalPublicAsset = targetUrl.startsWith('/') && !targetUrl.startsWith('//');

        try {
            if (!isLocalPublicAsset) {
                const resolved = await resolveCachedAudioUrl(targetUrl);
                if (resolved?.url) {
                    fetchUrl = resolved.url;
                    if (resolved.isObjectUrl) tempObjectUrl = resolved.url;
                }
            }

            const res = await fetch(fetchUrl, isLocalPublicAsset ? undefined : { mode: 'cors' });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const arrayBuf = await res.arrayBuffer();
            if (!arrayBuf || arrayBuf.byteLength < 256) throw new Error('Empty audio payload');
            const decoded = await ctx.decodeAudioData(arrayBuf.slice(0));
            bgmBufferCache.set(targetUrl, decoded);
            return decoded;
        } catch {
            return null;
        } finally {
            if (tempObjectUrl) {
                try {
                    URL.revokeObjectURL(tempObjectUrl);
                } catch {
                    // ignore
                }
            }
            bgmLoadingMap.delete(targetUrl);
        }
    })();

    bgmLoadingMap.set(targetUrl, job);
    return job;
}

/**
 * Preload & decode the World Map BGM into a RAM AudioBuffer ahead of time (call on LoginPage
 * and StudentWorldPage mount) so entering or returning to the 3D map plays at literal 0ms delay!
 */
export function preloadWorldBgm(customUrl = null) {
    if (typeof window === 'undefined') return Promise.resolve(null);
    ensureBgmLifecycleHooks();
    const targetUrl = customUrl || DEFAULT_WORLD_BGM_URL;
    if (customUrl && customUrl !== DEFAULT_WORLD_BGM_URL) {
        // Also warm built-in fallback silently so offline/broken custom URL never goes silent
        fetchAndDecodeBgmBuffer(DEFAULT_WORLD_BGM_URL).catch(() => {});
    }
    return fetchAndDecodeBgmBuffer(targetUrl);
}

function startBgmPlaybackNow() {
    if (!bgmDesiredPlaying) return;
    if (typeof document !== 'undefined' && document.hidden) return;
    const vol = getAudioVolume();
    if (vol <= 0) return;

    const ctx = getAudioContext();
    if (!ctx) return;

    const targetUrl = bgmDesiredUrl || DEFAULT_WORLD_BGM_URL;
    const buffer = bgmBufferCache.get(targetUrl) || bgmBufferCache.get(DEFAULT_WORLD_BGM_URL);
    if (!buffer) {
        fetchAndDecodeBgmBuffer(targetUrl).then((decoded) => {
            if (!decoded && targetUrl !== DEFAULT_WORLD_BGM_URL) {
                return fetchAndDecodeBgmBuffer(DEFAULT_WORLD_BGM_URL);
            }
            return decoded;
        }).then((readyBuf) => {
            if (readyBuf && bgmDesiredPlaying && !bgmActiveSource) {
                startBgmPlaybackNow();
            }
        }).catch(() => {});
        return;
    }

    const resolvedUrl = bgmBufferCache.has(targetUrl) ? targetUrl : DEFAULT_WORLD_BGM_URL;

    // Already playing this exact track — just ensure volume is accurate
    if (bgmActiveSource && bgmActiveUrl === resolvedUrl) {
        if (bgmActiveGain) {
            const now = ctx.currentTime;
            bgmActiveGain.gain.cancelScheduledValues(now);
            bgmActiveGain.gain.setValueAtTime(Math.max(0.0001, bgmActiveGain.gain.value), now);
            bgmActiveGain.gain.linearRampToValueAtTime(Math.max(0.0001, vol * BGM_VOLUME_SCALE), now + 0.08);
        }
        return;
    }

    // Switching track (e.g., default -> teacher custom BGM once decoded)
    if (bgmActiveSource && bgmActiveUrl !== resolvedUrl) {
        stopBgmNodeImmediate(0.08);
        bgmOffsetSec = 0;
    }

    if (ctx.state === 'suspended') {
        ctx.resume().then(() => {
            if (bgmDesiredPlaying && !bgmActiveSource && !document.hidden) {
                startBgmPlaybackNow();
            }
        }).catch(() => {});
        return;
    }

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;

    const gain = ctx.createGain();
    const now = ctx.currentTime;
    const targetGain = Math.max(0.0001, vol * BGM_VOLUME_SCALE);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(targetGain, now + 0.12);

    src.connect(gain);
    gain.connect(ctx.destination);

    const offset = buffer.duration > 0 ? bgmOffsetSec % buffer.duration : 0;
    bgmActiveSource = src;
    bgmActiveGain = gain;
    bgmActiveUrl = resolvedUrl;
    bgmStartedCtxTime = now;

    try {
        src.start(0, offset);
    } catch {
        bgmActiveSource = null;
        bgmActiveGain = null;
        bgmActiveUrl = null;
    }
}

/**
 * Synchronize World Map BGM state.
 * Plays at 0ms from decoded RAM AudioBuffer during the 5-map fly-over and while idle on the 3D map,
 * and stops immediately when walking, playing inside a stage, or during Juan's voice-overs.
 */
export function syncWorldBgm({ playing, customUrl = null, resetOffset = false }) {
    if (typeof window === 'undefined') return;
    ensureBgmLifecycleHooks();
    const nextUrl = customUrl || DEFAULT_WORLD_BGM_URL;
    if (nextUrl !== bgmDesiredUrl) {
        bgmDesiredUrl = nextUrl;
        bgmOffsetSec = 0;
        preloadWorldBgm(nextUrl);
    }
    if (resetOffset) {
        bgmOffsetSec = 0;
    }
    bgmDesiredPlaying = Boolean(playing);

    if (!bgmDesiredPlaying) {
        stopBgmNodeImmediate(0.09);
        return;
    }

    startBgmPlaybackNow();
}

export function stopWorldBgm(resetOffset = false) {
    bgmDesiredPlaying = false;
    if (resetOffset) bgmOffsetSec = 0;
    stopBgmNodeImmediate(0.09);
}
