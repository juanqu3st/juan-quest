import { resolveCachedAudioUrl } from './videoCache';

// Feedback & lesson audio controller with clear Web Audio chimes + temporary Filipino voice praise fallback.

const MUTE_KEY = 'juanquest_audio_muted';
const PRAISE_PHRASES = ['Mahusay!', 'Magaling!', 'Tama!', 'Napakagaling!'];
const WRONG_PHRASES = ['Subukan muli.', 'Hindi tama, subukan ulit.'];

let audioCtx = null;
let activeFeedbackEl = null;
let activeFeedbackBlobUrl = null;
let activePromptEl = null;
let activePromptBlobUrl = null;
let praiseCursor = 0;

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

export function isAudioMuted() {
    try {
        return localStorage.getItem(MUTE_KEY) === '1';
    } catch {
        return false;
    }
}

export function setAudioMuted(muted) {
    try {
        localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
    } catch {
        // ignore storage restrictions
    }
    if (muted) {
        stopAllFeedbackAudio();
    }
}

export function stopAllFeedbackAudio() {
    if (activeFeedbackEl) {
        try {
            activeFeedbackEl.pause();
            activeFeedbackEl.currentTime = 0;
        } catch {
            // ignore
        }
        activeFeedbackEl = null;
    }
    revokeFeedbackBlob();
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

function speakTemporaryVoice(text) {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
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
        utter.volume = 0.85;
        synth.speak(utter);
    } catch {
        // speech synthesis optional fallback
    }
}

function playFallbackTone(type) {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const playNote = (freq, startOffset, duration, peakGain, wave = 'sine') => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = wave;
        osc.frequency.setValueAtTime(freq, now + startOffset);
        gain.gain.setValueAtTime(0.0001, now + startOffset);
        gain.gain.exponentialRampToValueAtTime(peakGain, now + startOffset + 0.015);
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
    if (isAudioMuted()) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.26, now + 0.045);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.055, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.06);
}

export function playPairSnap() {
    triggerHaptic('pair');
    if (isAudioMuted()) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(460, now);
    osc.frequency.exponentialRampToValueAtTime(720, now + 0.06);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.06, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.065);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.08);
}

export function playTimerTick() {
    triggerHaptic('tick');
    if (isAudioMuted()) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.042, now + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.036);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.05);
}

export function playVictoryFanfare() {
    triggerHaptic('victory');
    if (isAudioMuted()) return;
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
        gain.gain.exponentialRampToValueAtTime(0.085, now + i * 0.075 + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.075 + 0.28);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + i * 0.075);
        osc.stop(now + i * 0.075 + 0.31);
    });
}

export function playFeedbackAudio(type, customUrl, spokenText) {
    if (type === 'correct') triggerHaptic('correct');
    else if (type === 'complete') triggerHaptic('victory');
    else if (type === 'wrong') triggerHaptic('wrong');

    if (isAudioMuted()) return;

    if (activeFeedbackEl) {
        try {
            activeFeedbackEl.pause();
            activeFeedbackEl.currentTime = 0;
        } catch {
            // ignore
        }
        activeFeedbackEl = null;
    }
    revokeFeedbackBlob();

    if (customUrl) {
        resolveCachedAudioUrl(customUrl)
            .then(({ url, isObjectUrl }) => {
                if (!url || isAudioMuted()) {
                    if (isObjectUrl && url) URL.revokeObjectURL(url);
                    return;
                }
                const audio = new Audio(url);
                audio.volume = 0.95;
                activeFeedbackEl = audio;
                if (isObjectUrl) activeFeedbackBlobUrl = url;
                const clearRef = () => {
                    if (activeFeedbackEl === audio) {
                        activeFeedbackEl = null;
                        revokeFeedbackBlob();
                    } else if (isObjectUrl) {
                        URL.revokeObjectURL(url);
                    }
                };
                audio.onended = clearRef;
                audio.onerror = clearRef;
                audio.play().catch(() => {
                    clearRef();
                    playFallbackTone(type);
                });
            })
            .catch(() => {
                playFallbackTone(type);
            });
        return;
    }

    playFallbackTone(type);

    if (type === 'correct') {
        speakTemporaryVoice(spokenText || pickPraiseHeadline());
    } else if (type === 'complete') {
        speakTemporaryVoice(spokenText || 'Binabati kita! Tapos na ang mapa!');
    } else if (type === 'wrong') {
        const phrase = WRONG_PHRASES[praiseCursor % WRONG_PHRASES.length];
        speakTemporaryVoice(spokenText || phrase);
    }
}

/**
 * Crisp mechanical unlock click + ascending golden sparkle arpeggio for PadlockUnlockOverlay.
 */
export function playUnlockChime() {
    triggerHaptic('unlock');
    if (isAudioMuted()) return;
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const playSparkle = (freq, offset, dur, peak, wave = 'triangle') => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = wave;
        osc.frequency.setValueAtTime(freq, now + offset);
        gain.gain.setValueAtTime(0.0001, now + offset);
        gain.gain.exponentialRampToValueAtTime(peak, now + offset + 0.012);
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
        audio.volume = 0.95;
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
