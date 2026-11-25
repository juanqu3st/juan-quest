import { resolveCachedAudioUrl } from './videoCache';

// Feedback & lesson audio controller with clear Web Audio chimes + temporary Filipino voice praise fallback.

const MUTE_KEY = 'juanquest_audio_muted';
const VOLUME_KEY = 'juanquest_audio_volume';
const PRAISE_PHRASES = ['Mahusay!', 'Magaling!', 'Tama!', 'Napakagaling!'];
const WRONG_PHRASES = ['Subukan muli.', 'Hindi tama, subukan ulit.'];

let audioCtx = null;
let activeFeedbackEl = null;
let activeFeedbackBlobUrl = null;
let activeFeedbackResolve = null;
let activePromptEl = null;
let activePromptBlobUrl = null;
let praiseCursor = 0;

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
    } else {
        if (activeFeedbackEl) activeFeedbackEl.volume = clamped * 0.95;
        if (activePromptEl) activePromptEl.volume = clamped * 0.95;
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
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        try {
            window.speechSynthesis.cancel();
        } catch {
            // ignore
        }
    }
}

export function pickPraiseHeadline() {
    const label = PRAISE_PHRASES[praiseCursor % PRAISE_PHRASES.length];
    praiseCursor += 1;
    return label;
}

function speakTemporaryVoice(text, onFinished) {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
        return false;
    }
    try {
        const synth = window.speechSynthesis;
        synth.cancel();
        const utter = new SpeechSynthesisUtterance(text);
        const voices = synth.getVoices?.() || [];
        const filVoice =
            voices.find((v) => /^(fil|tl)/i.test(v.lang)) ||
            voices.find((v) => /filipino|tagalog/i.test(v.name)) ||
            voices.find((v) => /^en-(PH|US)/i.test(v.lang));
        if (filVoice) utter.voice = filVoice;
        utter.lang = filVoice?.lang || 'fil-PH';
        utter.rate = 1.05;
        utter.pitch = 1.05;
        utter.volume = Math.max(0, Math.min(1, getAudioVolume() * 0.9));
        if (onFinished) {
            utter.onend = onFinished;
            utter.onerror = onFinished;
        }
        synth.speak(utter);
        return true;
    } catch {
        // speech synthesis optional fallback
        return false;
    }
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
            playFallbackTone(type);
            let phrase = spokenText;
            if (!phrase) {
                if (type === 'correct') phrase = pickPraiseHeadline();
                else if (type === 'complete') phrase = 'Binabati kita! Tapos na ang mapa!';
                else if (type === 'wrong') phrase = WRONG_PHRASES[praiseCursor % WRONG_PHRASES.length];
            }
            const spoke = phrase ? speakTemporaryVoice(phrase, finishRespectingMin) : false;
            if (!spoke) {
                const chimeMs = type === 'complete' ? 680 : 420;
                minTimer = setTimeout(finishRespectingMin, chimeMs);
            }
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
