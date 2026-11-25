import { useCallback, useEffect, useRef, useState } from 'react';
import {
    ArrowUpRight,
    BookOpen,
    CheckCircle2,
    ChevronLeft,
    ChevronRight,
    Clock,
    Heart,
    MapPin,
    Play,
    RotateCcw,
    Volume2,
    VolumeX,
} from 'lucide-react';
import JuanGuide3D from '../three/JuanGuide3D';

let sharedAudioCtx = null;
function getSharedAudioCtx() {
    if (typeof window === 'undefined') return null;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    if (!sharedAudioCtx) sharedAudioCtx = new Ctx();
    if (sharedAudioCtx.state === 'suspended') sharedAudioCtx.resume().catch(() => {});
    return sharedAudioCtx;
}

function playTapPop(freq = 540, dur = 0.045) {
    try {
        const ctx = getSharedAudioCtx();
        if (!ctx) return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(freq * 1.25, ctx.currentTime + dur);
        gain.gain.setValueAtTime(0.042, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + dur);
    } catch {
        // ignore audio context restrictions
    }
}

const FIVE_MAP_BUILDINGS = [
    { num: 1, shortTitle: 'Ang Curfew', img: '/images/tutorial/map1_3d.png' },
    { num: 2, shortTitle: 'Ang Kuwartel', img: '/images/tutorial/map2_3d.png' },
    { num: 3, shortTitle: 'Ang Kariton', img: '/images/tutorial/map3_3d.png' },
    { num: 4, shortTitle: 'Pinto at Palakol', img: '/images/tutorial/map4_3d.png' },
    { num: 5, shortTitle: 'Magnanakaw', img: '/images/tutorial/map5_3d.png' },
];

const TUTORIAL_STEPS = [
    {
        id: 1,
        subtitle: 'Maligayang Pagdating',
        audio: '/audio/tutorial/step1.mp3',
        text: 'Uy, buti nakarating ka! Ako si Juan Osong. Tara, sasamahan kita sa laro natin ngayon!',
        visual: 'welcome',
        cta: 'Susunod',
    },
    {
        id: 2,
        subtitle: 'Mga Mapa at Iskor',
        audio: '/audio/tutorial/step2.mp3',
        text: 'May limang mapa tayong dadaanan dito. Sampung puntos bawat isa, kaya pwedeng umabot ng singkwenta ang iskor mo!',
        visual: 'maps',
        cta: 'Susunod',
    },
    {
        id: 3,
        subtitle: 'Paano Maglaro',
        audio: '/audio/tutorial/step3.mp3',
        text: 'Simple lang ang gagawin sa bawat mapa. Panoorin muna ang maikling video, basahin ang panuto, tapos sagutin ang mga tanong.',
        visual: 'flow',
        cta: 'Susunod',
    },
    {
        id: 4,
        subtitle: 'Mga Puso at Oras',
        audio: '/audio/tutorial/step4.mp3',
        text: 'May tatlong puso ka sa bawat mapa bilang taga-ligtas. Kapag nagkamali ka, pwede kang gumamit ng isang puso para sumagot muli at makaiwas sa bawas ng puntos. Bantayan din ang oras!',
        visual: 'hearts',
        cta: 'Susunod',
    },
    {
        id: 5,
        subtitle: 'Handa na sa Hamon',
        audio: '/audio/tutorial/step5.mp3',
        text: 'Ayos na! Pindutin mo lang ang Mapa 1 para magsimula. Kung nakalimutan mo, pindutin mo lang ang Gabay sa itaas anumang oras.',
        visual: 'start',
        cta: 'Magsimula na',
    },
];

// Clean warm parchment card style shared across mobile & desktop Gabay cards
const SHEET_STYLE = {
    backgroundColor: 'rgba(250, 248, 245, 0.96)',
    border: '1.5px solid #E3D4BC',
    boxShadow: '0 16px 36px rgba(15, 10, 6, 0.32)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
};

const DIALOGUE_SHEET_STYLE = {
    backgroundColor: '#FAF8F5',
    border: '1.5px solid #E3D4BC',
    boxShadow: '0 20px 44px rgba(15, 10, 6, 0.48)',
};

function useIsDesktopViewport() {
    const [isDesktop, setIsDesktop] = useState(() => {
        if (typeof window === 'undefined' || !window.matchMedia) return false;
        return window.matchMedia('(min-width: 640px)').matches;
    });

    useEffect(() => {
        if (typeof window === 'undefined' || !window.matchMedia) return undefined;
        const mq = window.matchMedia('(min-width: 640px)');
        const onChange = (e) => setIsDesktop(e.matches);
        setIsDesktop(mq.matches);
        if (mq.addEventListener) {
            mq.addEventListener('change', onChange);
            return () => mq.removeEventListener('change', onChange);
        }
        mq.addListener(onChange);
        return () => mq.removeListener(onChange);
    }, []);

    return isDesktop;
}

/**
 * Handcrafted Filipino Storybook Game Onboarding Guide (v3 Mobile-First + Desktop Responsive):
 * - Mobile (<640px): Half-body Juan Osong seamlessly front-faded into the warm dialogue card (zero box, zero 2nd WebGL context, 60 FPS),
 *   enlarged 3D map/heart/step plaques, clean top-right Volume + Laktawan controls (no top progress bar), and thumb-zone Bumalik / Susunod CTAs.
 * - Desktop (>=640px): Full-body real-time articulated 3D Juan Osong (`JuanGuide3D`) beside the matching warm storybook dialogue sheet.
 */
export default function StudentOnboardingGuide({ open, onClose, onStepChange }) {
    const isDesktop = useIsDesktopViewport();
    const [stepIdx, setStepIdx] = useState(0);
    const [juanReady, setJuanReady] = useState(false);
    const [typedText, setTypedText] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [isAudioPlaying, setIsAudioPlaying] = useState(false);
    const [audioBlocked, setAudioBlocked] = useState(false);
    const [muted, setMuted] = useState(false);
    const [activeShowcaseIdx, setActiveShowcaseIdx] = useState(0);
    const [ripples, setRipples] = useState([]);

    const isTalkingRef = useRef(false);
    const audioLevelRef = useRef(0);
    const stepProgressRef = useRef(0);
    const mutedRef = useRef(false);

    const audioPoolRef = useRef([]);
    const analyserMapRef = useRef(new WeakMap());
    const activeAudioRef = useRef(null);
    const activeAnalyserRef = useRef(null);
    const typingTimerRef = useRef(null);
    const rippleIdRef = useRef(0);

    mutedRef.current = muted;
    isTalkingRef.current = (!muted && isAudioPlaying) || isTyping;

    useEffect(() => {
        onStepChange?.(open ? stepIdx : null);
    }, [open, stepIdx, onStepChange]);

    // Gentle sequential trail highlight moving from Mapa 1 -> 5 during Step 2
    useEffect(() => {
        if (!open || stepIdx !== 1) return undefined;
        setActiveShowcaseIdx(0);
        const timer = setInterval(() => {
            setActiveShowcaseIdx((prev) => (prev + 1) % 5);
        }, 1050);
        return () => clearInterval(timer);
    }, [open, stepIdx]);

    useEffect(() => {
        if (!open) {
            audioLevelRef.current = 0;
            stepProgressRef.current = 0;
            return undefined;
        }
        let rafId = 0;
        const buf = new Uint8Array(128);

        const tick = () => {
            const audio = activeAudioRef.current;
            const analyser = activeAnalyserRef.current;

            if (audio && !audio.paused && audio.duration > 0) {
                stepProgressRef.current = Math.min(1, Math.max(0, audio.currentTime / audio.duration));
            }

            if (analyser && audio && !audio.paused && !mutedRef.current) {
                analyser.getByteTimeDomainData(buf);
                let sum = 0;
                for (let i = 0; i < buf.length; i += 1) {
                    const v = (buf[i] - 128) / 128;
                    sum += v * v;
                }
                audioLevelRef.current = Math.sqrt(sum / buf.length);
            } else {
                audioLevelRef.current = 0;
            }

            rafId = requestAnimationFrame(tick);
        };
        rafId = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(rafId);
    }, [open]);

    const stopCurrentAudio = useCallback(() => {
        if (activeAudioRef.current) {
            activeAudioRef.current.pause();
            try {
                activeAudioRef.current.currentTime = 0;
            } catch {
                // ignore
            }
            activeAudioRef.current = null;
        }
        activeAnalyserRef.current = null;
        audioLevelRef.current = 0;
        setIsAudioPlaying(false);
    }, []);

    const handleJuanReady = useCallback(() => {
        setJuanReady(true);
    }, []);

    useEffect(() => {
        if (!open) {
            stopCurrentAudio();
            setJuanReady(false);
            if (typingTimerRef.current) clearInterval(typingTimerRef.current);
            return undefined;
        }

        // Load ONLY step 1 immediately so bandwidth/CPU never competes with Juan's first frame
        const firstAudio = new Audio(TUTORIAL_STEPS[0].audio);
        firstAudio.preload = 'auto';
        const pool = [firstAudio];
        audioPoolRef.current = pool;
        setStepIdx(0);
        setJuanReady(false);
        setAudioBlocked(false);

        // Safety fallback so audio/dialogue always starts even if a device takes >900ms on first frame
        const readyGuard = setTimeout(() => setJuanReady(true), 900);

        return () => {
            clearTimeout(readyGuard);
            audioPoolRef.current.forEach((a) => {
                if (!a) return;
                a.pause();
                a.src = '';
            });
            audioPoolRef.current = [];
            activeAudioRef.current = null;
            activeAnalyserRef.current = null;
            if (typingTimerRef.current) clearInterval(typingTimerRef.current);
        };
    }, [open, stopCurrentAudio]);

    // Stagger preload of steps 2..5 quietly AFTER Juan is already rendered on screen
    useEffect(() => {
        if (!open || !juanReady) return undefined;
        const t = setTimeout(() => {
            for (let i = 1; i < TUTORIAL_STEPS.length; i += 1) {
                if (!audioPoolRef.current[i]) {
                    const a = new Audio(TUTORIAL_STEPS[i].audio);
                    a.preload = 'auto';
                    audioPoolRef.current[i] = a;
                }
            }
        }, 500);
        return () => clearTimeout(t);
    }, [open, juanReady]);

    const attachAnalyser = (audio) => {
        try {
            const ctx = getSharedAudioCtx();
            if (!ctx) return null;
            if (analyserMapRef.current.has(audio)) {
                return analyserMapRef.current.get(audio);
            }
            const src = ctx.createMediaElementSource(audio);
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 256;
            analyser.smoothingTimeConstant = 0.5;
            src.connect(analyser);
            analyser.connect(ctx.destination);
            analyserMapRef.current.set(audio, analyser);
            return analyser;
        } catch {
            return null;
        }
    };

    const playStepAudio = useCallback(
        (idx) => {
            stopCurrentAudio();
            if (mutedRef.current) return;

            const audio = audioPoolRef.current[idx] || new Audio(TUTORIAL_STEPS[idx].audio);
            audioPoolRef.current[idx] = audio;
            activeAudioRef.current = audio;
            activeAnalyserRef.current = attachAnalyser(audio);
            stepProgressRef.current = 0;

            try {
                audio.currentTime = 0;
            } catch {
                // ignore
            }
            audio.onended = () => {
                if (activeAudioRef.current === audio) {
                    setIsAudioPlaying(false);
                    audioLevelRef.current = 0;
                    stepProgressRef.current = 1;
                }
            };
            audio.onpause = () => {
                if (activeAudioRef.current === audio) {
                    setIsAudioPlaying(false);
                    audioLevelRef.current = 0;
                }
            };

            const p = audio.play();
            if (p && typeof p.then === 'function') {
                p.then(() => {
                    if (activeAudioRef.current === audio) {
                        setIsAudioPlaying(true);
                        setAudioBlocked(false);
                    }
                }).catch(() => {
                    if (activeAudioRef.current === audio) {
                        setIsAudioPlaying(false);
                        setAudioBlocked(true);
                    }
                });
            } else {
                setIsAudioPlaying(true);
                setAudioBlocked(false);
            }
        },
        [stopCurrentAudio]
    );

    const handleToggleMute = useCallback(
        (e) => {
            e.stopPropagation();
            const nextMuted = !mutedRef.current;
            mutedRef.current = nextMuted;
            setMuted(nextMuted);
            if (nextMuted) {
                stopCurrentAudio();
                setAudioBlocked(false);
            } else {
                playStepAudio(stepIdx);
            }
        },
        [playStepAudio, stepIdx, stopCurrentAudio]
    );

    // Wait until Juan's first real frame is rendered (`juanReady`) so voiceover & text NEVER start before Juan appears
    useEffect(() => {
        if (!open || !juanReady) return undefined;
        const step = TUTORIAL_STEPS[stepIdx];
        if (!step) return undefined;

        if (typingTimerRef.current) clearInterval(typingTimerRef.current);
        setTypedText('');
        setIsTyping(true);
        stepProgressRef.current = 0;
        playStepAudio(stepIdx);

        let pos = 0;
        const full = step.text;
        typingTimerRef.current = setInterval(() => {
            pos += 2;
            if (!activeAudioRef.current || activeAudioRef.current.paused) {
                stepProgressRef.current = Math.min(1, pos / Math.max(1, full.length));
            }
            if (pos >= full.length) {
                setTypedText(full);
                setIsTyping(false);
                clearInterval(typingTimerRef.current);
                typingTimerRef.current = null;
            } else {
                setTypedText(full.slice(0, pos));
            }
        }, 26);

        return () => {
            if (typingTimerRef.current) {
                clearInterval(typingTimerRef.current);
                typingTimerRef.current = null;
            }
        };
    }, [open, juanReady, stepIdx, playStepAudio]);

    const handleFinish = useCallback(() => {
        stopCurrentAudio();
        if (typingTimerRef.current) {
            clearInterval(typingTimerRef.current);
            typingTimerRef.current = null;
        }
        onStepChange?.(null);
        onClose?.();
    }, [onClose, onStepChange, stopCurrentAudio]);

    const goBackGuide = useCallback(() => {
        if (!juanReady || stepIdx <= 0) return;
        if (!mutedRef.current) playTapPop(440, 0.04);
        setStepIdx((i) => Math.max(0, i - 1));
    }, [juanReady, stepIdx]);

    const advanceGuide = useCallback(
        ({ forceStep = false } = {}) => {
            if (!juanReady) return;
            const step = TUTORIAL_STEPS[stepIdx];
            if (!step) return;

            if (audioBlocked && !mutedRef.current) {
                setAudioBlocked(false);
                playStepAudio(stepIdx);
                if (isTyping) {
                    if (typingTimerRef.current) clearInterval(typingTimerRef.current);
                    typingTimerRef.current = null;
                    setTypedText(step.text);
                    setIsTyping(false);
                }
                if (!forceStep) return;
            }

            if (isTyping && !forceStep) {
                if (typingTimerRef.current) {
                    clearInterval(typingTimerRef.current);
                    typingTimerRef.current = null;
                }
                setTypedText(step.text);
                setIsTyping(false);
                if (!mutedRef.current) playTapPop(460, 0.035);
                return;
            }

            if (!mutedRef.current) playTapPop(540 + stepIdx * 40, 0.05);
            if (stepIdx < TUTORIAL_STEPS.length - 1) {
                setStepIdx((i) => i + 1);
            } else {
                handleFinish();
            }
        },
        [audioBlocked, handleFinish, isTyping, juanReady, playStepAudio, stepIdx]
    );

    useEffect(() => {
        if (!open) return undefined;
        const onKeyDown = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                handleFinish();
            } else if (e.key === 'ArrowLeft') {
                e.preventDefault();
                goBackGuide();
            } else if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight') {
                e.preventDefault();
                advanceGuide();
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [open, advanceGuide, goBackGuide, handleFinish]);

    if (!open) return null;

    const currentStep = TUTORIAL_STEPS[stepIdx] || TUTORIAL_STEPS[0];
    const isFinalStep = stepIdx === TUTORIAL_STEPS.length - 1;
    const isSpeakingNow = !muted && isAudioPlaying;

    const handleScreenTap = (e) => {
        const id = ++rippleIdRef.current;
        const x = e.clientX;
        const y = e.clientY;
        if (Number.isFinite(x) && Number.isFinite(y)) {
            setRipples((prev) => [...prev.slice(-3), { id, x, y }]);
            setTimeout(() => {
                setRipples((prev) => prev.filter((r) => r.id !== id));
            }, 460);
        }
        advanceGuide();
    };

    const renderMapTile = (b, idx) => {
        const isActive = idx === activeShowcaseIdx;
        return (
            <div
                key={b.num}
                className="jq-node-in flex flex-col items-center text-center"
                style={{
                    animationDelay: `${idx * 65}ms`,
                    transform: isActive ? 'translateY(-2px)' : 'translateY(0)',
                    transition: 'transform 0.28s ease',
                }}
            >
                <div
                    className="w-[74px] h-[74px] min-[375px]:w-[82px] min-[375px]:h-[82px] sm:w-[86px] sm:h-[86px] rounded-[18px] flex items-center justify-center p-[3px] overflow-hidden"
                    style={{
                        backgroundColor: isActive ? '#FFF4EC' : '#F6F0E4',
                        border: isActive ? '2.5px solid #C2410C' : '1.5px solid #E3D4BC',
                        boxShadow: isActive
                            ? '0 8px 18px rgba(194, 65, 12, 0.22)'
                            : '0 2px 6px rgba(35, 24, 16, 0.06)',
                        transition: 'border-color 0.28s ease, background-color 0.28s ease, box-shadow 0.28s ease',
                    }}
                >
                    <img
                        src={b.img}
                        alt={`Mapa ${b.num}: ${b.shortTitle}`}
                        draggable={false}
                        className="w-full h-full object-contain scale-[1.12]"
                    />
                </div>
                <span
                    className="mt-1.5 px-2 py-[1.5px] rounded-full text-[10px] font-extrabold leading-tight"
                    style={{
                        backgroundColor: isActive ? '#C2410C' : '#EAE0CE',
                        color: isActive ? '#FAF8F5' : '#5E4530',
                        transition: 'background-color 0.28s ease, color 0.28s ease',
                    }}
                >
                    Mapa {b.num}
                </span>
                <span className="mt-0.5 text-[11px] font-bold text-[#231810] leading-tight truncate max-w-[96px] min-[375px]:max-w-[104px]">
                    {b.shortTitle}
                </span>
            </div>
        );
    };

    const renderFooterControls = () => (
        <div className="px-3.5 sm:px-5 pb-3.5 pt-0.5 flex items-center justify-between gap-2.5">
            {audioBlocked && !muted ? (
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        setAudioBlocked(false);
                        playStepAudio(stepIdx);
                    }}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-[#C2410C] cursor-pointer"
                >
                    <Volume2 className="w-4 h-4 shrink-0" />
                    <span>Pindutin para marinig</span>
                </button>
            ) : stepIdx === 0 ? (
                <span className="text-[11.5px] sm:text-xs font-semibold text-[#8A7058]">
                    Pindutin kahit saan
                </span>
            ) : (
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        goBackGuide();
                    }}
                    className="h-10 px-3.5 rounded-xl bg-[#F2E9DB] hover:bg-[#EAE0CE] active:scale-[0.98] text-[#5C4430] border border-[#E3D4BC] text-[12.5px] font-bold inline-flex items-center gap-1 transition cursor-pointer"
                >
                    <ChevronLeft className="w-3.5 h-3.5 shrink-0" />
                    <span>Bumalik</span>
                </button>
            )}

            <button
                type="button"
                onClick={(e) => {
                    e.stopPropagation();
                    advanceGuide({ forceStep: true });
                }}
                className="h-10 px-5 rounded-xl text-[#FAF8F5] text-[13px] font-extrabold inline-flex items-center gap-1.5 active:scale-[0.98] transition cursor-pointer"
                style={
                    isFinalStep
                        ? {
                              background: 'linear-gradient(135deg, #C2410C 0%, #D97706 100%)',
                              boxShadow: '0 6px 16px rgba(194, 65, 12, 0.38)',
                          }
                        : {
                              backgroundColor: '#C2410C',
                              boxShadow: '0 4px 12px rgba(194, 65, 12, 0.32)',
                          }
                }
            >
                <span>{currentStep.cta}</span>
                {isFinalStep ? (
                    <Play className="w-3.5 h-3.5 fill-current shrink-0" />
                ) : (
                    <ChevronRight className="w-4 h-4 shrink-0" />
                )}
            </button>
        </div>
    );

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-label="Gabay sa Paglalaro ng JuanQuest"
            onClick={handleScreenTap}
            className="fixed inset-0 cursor-pointer select-none overflow-hidden"
            style={{
                zIndex: 90,
                background:
                    'linear-gradient(180deg, rgba(16, 12, 9, 0.44) 0%, rgba(16, 12, 9, 0.08) 22%, rgba(16, 12, 9, 0.02) 52%, rgba(16, 12, 9, 0.24) 68%, rgba(16, 12, 9, 0.80) 100%)',
                transition: 'background 0.4s ease',
            }}
        >
            <style>{`
                @keyframes jqPanelIn {
                    0% { opacity: 0; transform: translateY(10px); }
                    100% { opacity: 1; transform: translateY(0px); }
                }
                @keyframes jqNodeIn {
                    0% { opacity: 0; transform: translateY(8px) scale(0.96); }
                    100% { opacity: 1; transform: translateY(0px) scale(1); }
                }
                @keyframes jqTapRipple {
                    0% { transform: translate(-50%, -50%) scale(0.25); opacity: 0.72; }
                    100% { transform: translate(-50%, -50%) scale(2.1); opacity: 0; }
                }
                @keyframes jqVoiceBar {
                    0%, 100% { transform: scaleY(0.35); }
                    50% { transform: scaleY(1); }
                }
                .jq-panel-in { animation: jqPanelIn 0.26s cubic-bezier(0.22, 1, 0.36, 1) both; }
                .jq-node-in { animation: jqNodeIn 0.3s cubic-bezier(0.22, 1, 0.36, 1) both; }
                .jq-tap-ripple { animation: jqTapRipple 0.45s ease-out forwards; }
                .jq-vbar-1 { animation: jqVoiceBar 0.42s ease-in-out infinite; }
                .jq-vbar-2 { animation: jqVoiceBar 0.42s ease-in-out 0.14s infinite; }
                .jq-vbar-3 { animation: jqVoiceBar 0.42s ease-in-out 0.28s infinite; }
            `}</style>

            {/* Subtle Tap Ripple */}
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
                {ripples.map((r) => (
                    <span
                        key={r.id}
                        className="jq-tap-ripple absolute w-10 h-10 rounded-full"
                        style={{
                            left: `${r.x}px`,
                            top: `${r.y}px`,
                            border: '2px solid rgba(250, 248, 245, 0.75)',
                            backgroundColor: 'rgba(250, 248, 245, 0.16)',
                        }}
                    />
                ))}
            </div>

            {/* CLEAN MINIMAL TOP-RIGHT CONTROLS (NO PROGRESS BAR / NO SLIDE COUNTER) */}
            <div
                className="flex items-center gap-2"
                style={{
                    position: 'fixed',
                    top: 'max(14px, env(safe-area-inset-top))',
                    right: 'max(14px, env(safe-area-inset-right))',
                    zIndex: 96,
                }}
            >
                <button
                    type="button"
                    aria-label={muted ? 'I-unmute ang boses ni Juan' : 'I-mute ang boses ni Juan'}
                    onClick={handleToggleMute}
                    className="w-9 h-9 rounded-full flex items-center justify-center cursor-pointer transition hover:opacity-100 active:scale-95"
                    style={{
                        backgroundColor: 'rgba(24, 18, 13, 0.62)',
                        color: '#FAF8F5',
                        border: '1px solid rgba(255, 255, 255, 0.20)',
                        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.22)',
                        backdropFilter: 'blur(10px)',
                        WebkitBackdropFilter: 'blur(10px)',
                    }}
                >
                    {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </button>

                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        handleFinish();
                    }}
                    className="h-9 px-4 rounded-full text-[12.5px] font-bold tracking-wide cursor-pointer transition hover:opacity-100 active:scale-95"
                    style={{
                        backgroundColor: 'rgba(24, 18, 13, 0.62)',
                        color: '#FAF8F5',
                        border: '1px solid rgba(255, 255, 255, 0.20)',
                        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.22)',
                        backdropFilter: 'blur(10px)',
                        WebkitBackdropFilter: 'blur(10px)',
                    }}
                >
                    Laktawan
                </button>
            </div>

            {/* UPPER CONTEXTUAL VISUAL PLAQUES (ENLARGED MAPS, STEP ICONS, HEARTS & TARGET) */}
            <div
                className="pointer-events-none px-3.5 sm:px-6 flex justify-center"
                style={{
                    position: 'fixed',
                    top: 'max(62px, calc(env(safe-area-inset-top) + 50px))',
                    left: 0,
                    right: 0,
                    zIndex: 92,
                }}
            >
                {/* STEP 1: Airy Barrio Location Pill */}
                {currentStep.visual === 'welcome' && (
                    <div key="vis-welcome" className="jq-panel-in">
                        <div
                            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[12.5px] font-bold"
                            style={{
                                backgroundColor: 'rgba(250, 248, 245, 0.93)',
                                color: '#3D2B1F',
                                border: '1.5px solid #E3D4BC',
                                boxShadow: '0 10px 26px rgba(15, 10, 6, 0.24)',
                                backdropFilter: 'blur(10px)',
                                WebkitBackdropFilter: 'blur(10px)',
                            }}
                        >
                            <MapPin className="w-3.5 h-3.5 text-[#C2410C] shrink-0" />
                            <span>Barrio ni Juan Osong</span>
                            <span className="opacity-35">·</span>
                            <span className="text-[#7A5B3E]">Grade 7 Filipino</span>
                        </div>
                    </div>
                )}

                {/* STEP 2: Enlarged 5-Map Showcase (3+2 Balanced Grid on Mobile, 5-Across on Desktop) */}
                {currentStep.visual === 'maps' && (
                    <div
                        key="vis-maps"
                        className="jq-panel-in w-full max-w-[376px] sm:max-w-[680px] rounded-[22px] overflow-hidden"
                        style={SHEET_STYLE}
                    >
                        <div
                            className="px-3.5 sm:px-5 py-2.5 flex items-center justify-between gap-2"
                            style={{ backgroundColor: '#F5EFE4', borderBottom: '1px solid #EDE2CF' }}
                        >
                            <span className="text-[13px] font-extrabold tracking-tight text-[#231810]">
                                Limang Mapa ng Kuwento
                            </span>
                            <span className="px-2.5 py-0.5 rounded-full text-[10.5px] font-extrabold bg-[#FCECE3] text-[#C2410C]">
                                10 pts · 50 max
                            </span>
                        </div>

                        <div className="px-2.5 sm:px-5 py-3 sm:py-4">
                            {/* Mobile: Clean 3-over-2 large tile layout */}
                            <div className="flex flex-col gap-2.5 sm:hidden">
                                <div className="grid grid-cols-3 gap-2 justify-items-center">
                                    {FIVE_MAP_BUILDINGS.slice(0, 3).map((b, idx) => renderMapTile(b, idx))}
                                </div>
                                <div className="flex justify-center gap-4">
                                    {FIVE_MAP_BUILDINGS.slice(3, 5).map((b, idx) => renderMapTile(b, idx + 3))}
                                </div>
                            </div>

                            {/* Desktop: Connected 5-across large tile trail */}
                            <div className="hidden sm:grid sm:grid-cols-5 gap-3 justify-items-center">
                                {FIVE_MAP_BUILDINGS.map((b, idx) => renderMapTile(b, idx))}
                            </div>
                        </div>
                    </div>
                )}

                {/* STEP 3: Enlarged 3-Step Numbered Rail */}
                {currentStep.visual === 'flow' && (
                    <div
                        key="vis-flow"
                        className="jq-panel-in w-full max-w-[376px] sm:max-w-[540px] rounded-[22px] px-3 sm:px-6 py-4"
                        style={SHEET_STYLE}
                    >
                        <div className="flex items-center justify-between gap-1 sm:gap-3">
                            {[
                                {
                                    num: 1,
                                    icon: Play,
                                    title: 'Manood',
                                    sub: 'Maikling 3D video',
                                    tileBg: '#FCECE3',
                                    tileBorder: '#F6CEB8',
                                    accent: '#C2410C',
                                    shadow: '0 6px 14px rgba(194, 65, 12, 0.14)',
                                },
                                {
                                    num: 2,
                                    icon: BookOpen,
                                    title: 'Panuto',
                                    sub: 'Basahin mabuti',
                                    tileBg: '#FEF3DC',
                                    tileBorder: '#F2D7A5',
                                    accent: '#B45309',
                                    shadow: '0 6px 14px rgba(180, 83, 9, 0.14)',
                                },
                                {
                                    num: 3,
                                    icon: CheckCircle2,
                                    title: 'Sagutin',
                                    sub: 'Hanggang 10 pts',
                                    tileBg: '#E6F4EC',
                                    tileBorder: '#BBE2CA',
                                    accent: '#15803D',
                                    shadow: '0 6px 14px rgba(21, 128, 61, 0.14)',
                                },
                            ].map((item, idx) => {
                                const Icon = item.icon;
                                return (
                                    <div key={item.title} className="contents">
                                        <div className="flex-1 flex flex-col items-center text-center min-w-0">
                                            <div
                                                className="relative w-[54px] h-[54px] sm:w-[58px] sm:h-[58px] rounded-[18px] flex items-center justify-center"
                                                style={{
                                                    backgroundColor: item.tileBg,
                                                    border: `1.5px solid ${item.tileBorder}`,
                                                    color: item.accent,
                                                    boxShadow: item.shadow,
                                                }}
                                            >
                                                <Icon className="w-6 h-6 sm:w-[26px] sm:h-[26px]" />
                                                <span
                                                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full text-[11px] font-extrabold text-[#FAF8F5] flex items-center justify-center border-2 border-[#FAF8F5]"
                                                    style={{ backgroundColor: item.accent }}
                                                >
                                                    {item.num}
                                                </span>
                                            </div>
                                            <div className="mt-2 text-[13.5px] font-extrabold text-[#231810] leading-tight">
                                                {item.title}
                                            </div>
                                            <div className="mt-0.5 text-[10.5px] sm:text-[11px] font-semibold text-[#7A5E46] leading-tight">
                                                {item.sub}
                                            </div>
                                        </div>
                                        {idx < 2 && (
                                            <ChevronRight className="w-4 h-4 text-[#C2A984] shrink-0 -mt-6" />
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* STEP 4: Enlarged Equal-Height 3-Tile Rules HUD (Big Red Hearts + Retry + Clock) */}
                {currentStep.visual === 'hearts' && (
                    <div
                        key="vis-hearts"
                        className="jq-panel-in w-full max-w-[376px] sm:max-w-[520px] rounded-[22px] p-2.5"
                        style={SHEET_STYLE}
                    >
                        <div className="grid grid-cols-3 gap-2">
                            <div className="rounded-2xl bg-[#F5EFE4] border border-[#E8DBC6] px-1.5 py-3.5 flex flex-col items-center justify-center text-center">
                                <div className="h-[46px] flex items-center justify-center gap-0.5">
                                    {[1, 2, 3].map((h) => (
                                        <Heart
                                            key={h}
                                            className="w-[22px] h-[22px] min-[375px]:w-6 min-[375px]:h-6 text-[#B91C1C] fill-[#DC2626]"
                                            style={{ filter: 'drop-shadow(0 2px 4px rgba(220,38,38,0.28))' }}
                                        />
                                    ))}
                                </div>
                                <div className="mt-1.5 text-[13.5px] font-extrabold text-[#231810] leading-tight">
                                    3 Puso
                                </div>
                                <div className="mt-0.5 text-[10.5px] font-semibold text-[#7A5E46]">
                                    Taga-ligtas
                                </div>
                            </div>

                            <div className="rounded-2xl bg-[#F5EFE4] border border-[#E8DBC6] px-1.5 py-3.5 flex flex-col items-center justify-center text-center">
                                <div className="w-[46px] h-[46px] rounded-[15px] bg-[#E6F4EC] border-[1.5px] border-[#BBE2CA] text-[#15803D] flex items-center justify-center">
                                    <RotateCcw className="w-6 h-6" />
                                </div>
                                <div className="mt-1.5 text-[13.5px] font-extrabold text-[#231810] leading-tight">
                                    Subok Muli
                                </div>
                                <div className="mt-0.5 text-[10.5px] font-semibold text-[#7A5E46]">
                                    Iwas bawas
                                </div>
                            </div>

                            <div className="rounded-2xl bg-[#F5EFE4] border border-[#E8DBC6] px-1.5 py-3.5 flex flex-col items-center justify-center text-center">
                                <div className="w-[46px] h-[46px] rounded-[15px] bg-[#FCECE3] border-[1.5px] border-[#F6CEB8] text-[#C2410C] flex items-center justify-center">
                                    <Clock className="w-6 h-6" />
                                </div>
                                <div className="mt-1.5 text-[13.5px] font-extrabold text-[#231810] leading-tight">
                                    May Oras
                                </div>
                                <div className="mt-0.5 text-[10.5px] font-semibold text-[#7A5E46]">
                                    Bantayan
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* STEP 5: Enlarged Mapa 1 Quest Target Card */}
                {currentStep.visual === 'start' && (
                    <div
                        key="vis-start"
                        className="jq-panel-in w-full max-w-[376px] sm:max-w-[440px] rounded-[22px] p-3 pr-3.5 flex items-center gap-3.5"
                        style={SHEET_STYLE}
                    >
                        <div
                            className="relative w-[76px] h-[76px] rounded-[18px] p-1 flex items-center justify-center shrink-0"
                            style={{
                                background: 'linear-gradient(145deg, #FBF2E2, #EFE0C5)',
                                border: '2px solid #DEC8A3',
                            }}
                        >
                            <img
                                src="/images/tutorial/map1_3d.png"
                                alt="Mapa 1: Ang Curfew"
                                draggable={false}
                                className="w-full h-full object-contain scale-[1.14]"
                            />
                            <span className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 rounded-full bg-[#16A34A] border-2 border-[#FAF8F5]" />
                        </div>
                        <div className="flex-1 min-w-0 text-left">
                            <span className="inline-block px-2.5 py-0.5 rounded-full bg-[#FCECE3] text-[#C2410C] text-[10px] font-extrabold uppercase tracking-wider">
                                Unang Hamon
                            </span>
                            <div className="mt-1 text-[16px] font-extrabold text-[#231810] leading-snug truncate">
                                Mapa 1: Ang Curfew
                            </div>
                            <div className="mt-0.5 text-[11.5px] font-semibold text-[#7A5E46]">
                                Pindutin sa mapa para magsimula
                            </div>
                        </div>
                        <div className="w-9 h-9 rounded-[13px] bg-[#FCECE3] text-[#C2410C] flex items-center justify-center shrink-0">
                            <ArrowUpRight className="w-[18px] h-[18px]" />
                        </div>
                    </div>
                )}
            </div>

            {/* BOTTOM DIALOGUE DOCK */}
            <div
                className="flex justify-center"
                style={{
                    position: 'fixed',
                    left: 0,
                    right: 0,
                    bottom: 0,
                    zIndex: 94,
                    paddingLeft: 'max(12px, env(safe-area-inset-left))',
                    paddingRight: 'max(12px, env(safe-area-inset-right))',
                    paddingBottom: 'max(14px, env(safe-area-inset-bottom))',
                }}
            >
                {!isDesktop ? (
                    /* MOBILE (<640px): LIVE 3D HALF-BODY JUAN OVERLAID CRISP ON DIALOGUE CARD (FULL HAND ACTIONS!) */
                    <div
                        className={`w-full max-w-[420px] transition-opacity duration-200 ${
                            juanReady ? 'opacity-100 jq-panel-in' : 'opacity-0'
                        }`}
                    >
                        <div className="relative rounded-[24px]" style={DIALOGUE_SHEET_STYLE}>
                            {/* Live 3D Half-Body Juan IN FRONT (z-30) — full solid body + waving/pointing hands + subtle edge-only waist feather */}
                            <div
                                className="pointer-events-none absolute -left-[10px] -top-[82px] w-[158px] h-[146px] z-30"
                                aria-hidden="true"
                            >
                                <JuanGuide3D
                                    variant="bust"
                                    stepIdx={stepIdx}
                                    isTalkingRef={isTalkingRef}
                                    audioLevelRef={audioLevelRef}
                                    stepProgressRef={stepProgressRef}
                                    onReady={handleJuanReady}
                                />
                            </div>

                            {/* Speaker Identity Header Right Beside Juan — divider line fades out cleanly under Juan so he reads as a crisp overlay! */}
                            <div className="relative pl-[136px] pr-4 py-3 min-h-[64px] flex flex-col justify-center">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-[15px] font-extrabold text-[#231810] tracking-tight leading-tight">
                                        Si Juan Osong
                                    </span>
                                    {isSpeakingNow && (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#FCECE3] text-[#C2410C] text-[10px] font-bold">
                                            <span className="inline-flex items-end gap-[1.5px] h-[9px]" aria-hidden="true">
                                                <span className="jq-vbar-1 w-[2px] h-[9px] rounded-full bg-[#C2410C] origin-bottom" />
                                                <span className="jq-vbar-2 w-[2px] h-[9px] rounded-full bg-[#C2410C] origin-bottom" />
                                                <span className="jq-vbar-3 w-[2px] h-[9px] rounded-full bg-[#C2410C] origin-bottom" />
                                            </span>
                                            <span>Nagsasalita</span>
                                        </span>
                                    )}
                                </div>
                                <div className="mt-0.5 text-[11.5px] font-semibold text-[#7C624A] leading-tight">
                                    Gabay ng Barrio · {currentStep.subtitle}
                                </div>
                                {/* Softly faded hairline divider so the line disappears smoothly behind/around Juan's overlay */}
                                <div
                                    aria-hidden="true"
                                    className="pointer-events-none absolute left-0 right-0 bottom-0 h-[1px]"
                                    style={{
                                        background:
                                            'linear-gradient(to right, transparent 0%, transparent 118px, #EFE5D5 144px, #EFE5D5 100%)',
                                    }}
                                />
                            </div>

                            {/* Crisp Dialogue Copy */}
                            <div className="px-4 py-3">
                                <p className="text-[14.5px] font-semibold leading-[1.55] text-[#231810] min-h-[48px]">
                                    {typedText}
                                </p>
                            </div>

                            {/* Ergonomic Thumb-Zone Footer */}
                            {renderFooterControls()}
                        </div>
                    </div>
                ) : (
                    /* DESKTOP (>=640px): FULL-BODY 3D JUAN BESIDE MATCHING WARM STORYBOOK SHEET */
                    <div
                        className={`w-full max-w-[780px] transition-opacity duration-200 ${
                            juanReady ? 'opacity-100 jq-panel-in' : 'opacity-0'
                        }`}
                    >
                        <div className="flex items-end">
                            <div className="pointer-events-none relative z-20 -mr-12 md:-mr-14 shrink-0">
                                <div className="relative w-[238px] h-[300px] md:w-[264px] md:h-[330px]">
                                    <JuanGuide3D
                                        variant="full"
                                        stepIdx={stepIdx}
                                        isTalkingRef={isTalkingRef}
                                        audioLevelRef={audioLevelRef}
                                        stepProgressRef={stepProgressRef}
                                        onReady={handleJuanReady}
                                    />
                                </div>
                            </div>

                            <div
                                className="relative z-10 flex-1 min-w-0 rounded-[24px] mb-[84px] md:mb-[96px]"
                                style={DIALOGUE_SHEET_STYLE}
                            >
                                {/* Subtle Speech Pointer Aiming at Juan */}
                                <div
                                    aria-hidden="true"
                                    className="absolute -left-[9px] top-[34px] w-4 h-4 rotate-45 rounded-[2px]"
                                    style={{
                                        backgroundColor: '#FAF8F5',
                                        borderLeft: '1.5px solid #E3D4BC',
                                        borderBottom: '1.5px solid #E3D4BC',
                                    }}
                                />

                                <div className="px-5 py-3 border-b border-[#EFE5D5] flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2.5">
                                        <span className="text-[15px] font-extrabold text-[#231810] tracking-tight">
                                            Si Juan Osong
                                        </span>
                                        {isSpeakingNow && (
                                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#FCECE3] text-[#C2410C] text-[10.5px] font-bold">
                                                <span className="inline-flex items-end gap-[1.5px] h-[9px]" aria-hidden="true">
                                                    <span className="jq-vbar-1 w-[2px] h-[9px] rounded-full bg-[#C2410C] origin-bottom" />
                                                    <span className="jq-vbar-2 w-[2px] h-[9px] rounded-full bg-[#C2410C] origin-bottom" />
                                                    <span className="jq-vbar-3 w-[2px] h-[9px] rounded-full bg-[#C2410C] origin-bottom" />
                                                </span>
                                                <span>Nagsasalita</span>
                                            </span>
                                        )}
                                    </div>
                                    <span className="text-xs font-semibold text-[#7C624A]">
                                        {currentStep.subtitle}
                                    </span>
                                </div>

                                <div className="px-5 py-3.5">
                                    <p className="text-[16px] font-semibold leading-[1.58] text-[#231810] min-h-[52px]">
                                        {typedText}
                                    </p>
                                </div>

                                {renderFooterControls()}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
