import { useCallback, useEffect, useRef, useState } from 'react';
import {
    BookOpen,
    CheckCircle2,
    ChevronDown,
    ChevronRight,
    Clock,
    Heart,
    Play,
    RotateCcw,
    Volume2,
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
        audio: '/audio/tutorial/step1.mp3',
        text: 'Uy, buti nakarating ka! Ako si Juan Osong. Tara, sasamahan kita sa laro natin ngayon!',
        visual: 'welcome',
        prompt: 'Pindutin kahit saan',
    },
    {
        id: 2,
        audio: '/audio/tutorial/step2.mp3',
        text: 'May limang mapa tayong dadaanan dito. Sampung puntos bawat isa, kaya pwedeng umabot ng singkwenta ang iskor mo!',
        visual: 'maps',
        prompt: 'Pindutin kahit saan',
    },
    {
        id: 3,
        audio: '/audio/tutorial/step3.mp3',
        text: 'Simple lang ang gagawin sa bawat mapa. Panoorin muna ang maikling video, basahin ang panuto, tapos sagutin ang mga tanong.',
        visual: 'flow',
        prompt: 'Pindutin kahit saan',
    },
    {
        id: 4,
        audio: '/audio/tutorial/step4.mp3',
        text: 'May tatlong puso ka sa bawat mapa bilang taga-ligtas. Kapag nagkamali ka, pwede kang gumamit ng isang puso para sumagot muli at makaiwas sa bawas ng puntos. Bantayan din ang oras!',
        visual: 'hearts',
        prompt: 'Pindutin kahit saan',
    },
    {
        id: 5,
        audio: '/audio/tutorial/step5.mp3',
        text: 'Ayos na! Pindutin mo lang ang Mapa 1 para magsimula. Kung nakalimutan mo, pindutin mo lang ang Gabay sa itaas anumang oras.',
        visual: 'start',
        prompt: 'Magsimula na',
    },
];

// Shared handcrafted warm barrio parchment plaque style (consistent tactile wood/paper game UI)
const PLAQUE_STYLE = {
    backgroundColor: '#FAF5EB',
    border: '2px solid #C8B08A',
    boxShadow: '0 4px 0 #AB9067, 0 18px 36px rgba(20, 14, 8, 0.38)',
};

/**
 * Handcrafted Filipino Storybook Game Onboarding Guide:
 * - Full-body live 3D Juan Osong (`JuanGuide3D`) with phrase-synced human acting, Web Audio lip-sync & eye blink.
 * - Cohesive warm parchment/wood game plaques for the 5-map trail, gameplay steps, and HUD rules (no rainbow SaaS cards).
 * - Clean text-only "Laktawan" button (no X icon) + Tap Anywhere progression.
 */
export default function StudentOnboardingGuide({ open, onClose, onStepChange }) {
    const [stepIdx, setStepIdx] = useState(0);
    const [typedText, setTypedText] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [isAudioPlaying, setIsAudioPlaying] = useState(false);
    const [audioBlocked, setAudioBlocked] = useState(false);
    const [activeShowcaseIdx, setActiveShowcaseIdx] = useState(0);
    const [ripples, setRipples] = useState([]);

    const isTalkingRef = useRef(false);
    const audioLevelRef = useRef(0);
    const stepProgressRef = useRef(0);

    const audioPoolRef = useRef([]);
    const analyserMapRef = useRef(new WeakMap());
    const activeAudioRef = useRef(null);
    const activeAnalyserRef = useRef(null);
    const typingTimerRef = useRef(null);
    const rippleIdRef = useRef(0);

    isTalkingRef.current = isAudioPlaying || isTyping;

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

            if (analyser && audio && !audio.paused) {
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

    useEffect(() => {
        if (!open) {
            stopCurrentAudio();
            if (typingTimerRef.current) clearInterval(typingTimerRef.current);
            return undefined;
        }

        const pool = TUTORIAL_STEPS.map((s) => {
            const a = new Audio(s.audio);
            a.preload = 'auto';
            return a;
        });
        audioPoolRef.current = pool;
        setStepIdx(0);
        setAudioBlocked(false);

        return () => {
            pool.forEach((a) => {
                a.pause();
                a.src = '';
            });
            audioPoolRef.current = [];
            activeAudioRef.current = null;
            activeAnalyserRef.current = null;
            if (typingTimerRef.current) clearInterval(typingTimerRef.current);
        };
    }, [open, stopCurrentAudio]);

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

    useEffect(() => {
        if (!open) return undefined;
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
    }, [open, stepIdx, playStepAudio]);

    const handleFinish = useCallback(() => {
        stopCurrentAudio();
        if (typingTimerRef.current) {
            clearInterval(typingTimerRef.current);
            typingTimerRef.current = null;
        }
        onStepChange?.(null);
        onClose?.();
    }, [onClose, onStepChange, stopCurrentAudio]);

    const advanceGuide = useCallback(() => {
        const step = TUTORIAL_STEPS[stepIdx];
        if (!step) return;

        if (audioBlocked) {
            setAudioBlocked(false);
            playStepAudio(stepIdx);
            if (isTyping) {
                if (typingTimerRef.current) clearInterval(typingTimerRef.current);
                typingTimerRef.current = null;
                setTypedText(step.text);
                setIsTyping(false);
            }
            return;
        }

        if (isTyping) {
            if (typingTimerRef.current) {
                clearInterval(typingTimerRef.current);
                typingTimerRef.current = null;
            }
            setTypedText(step.text);
            setIsTyping(false);
            playTapPop(460, 0.035);
            return;
        }

        playTapPop(540 + stepIdx * 40, 0.05);
        if (stepIdx < TUTORIAL_STEPS.length - 1) {
            setStepIdx((i) => i + 1);
        } else {
            handleFinish();
        }
    }, [audioBlocked, handleFinish, isTyping, playStepAudio, stepIdx]);

    useEffect(() => {
        if (!open) return undefined;
        const onKeyDown = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                handleFinish();
            } else if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight') {
                e.preventDefault();
                advanceGuide();
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [open, advanceGuide, handleFinish]);

    if (!open) return null;

    const currentStep = TUTORIAL_STEPS[stepIdx] || TUTORIAL_STEPS[0];

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
                    'linear-gradient(180deg, rgba(16, 20, 26, 0.42) 0%, rgba(16, 20, 26, 0.14) 45%, rgba(16, 20, 26, 0.72) 100%)',
                transition: 'background 0.4s ease',
            }}
        >
            <style>{`
                @keyframes jqPanelIn {
                    0% { opacity: 0; transform: translateY(12px); }
                    100% { opacity: 1; transform: translateY(0px); }
                }
                @keyframes jqNodeIn {
                    0% { opacity: 0; transform: translateY(10px) scale(0.95); }
                    100% { opacity: 1; transform: translateY(0px) scale(1); }
                }
                @keyframes jqTapRipple {
                    0% { transform: translate(-50%, -50%) scale(0.25); opacity: 0.75; }
                    100% { transform: translate(-50%, -50%) scale(2.2); opacity: 0; }
                }
                @keyframes jqTapHint {
                    0%, 100% { opacity: 0.72; transform: translateY(0px); }
                    50% { opacity: 1; transform: translateY(2px); }
                }
                @keyframes jqVoiceBar {
                    0%, 100% { transform: scaleY(0.32); }
                    50% { transform: scaleY(1); }
                }
                .jq-panel-in { animation: jqPanelIn 0.28s cubic-bezier(0.22, 1, 0.36, 1) both; }
                .jq-node-in { animation: jqNodeIn 0.32s cubic-bezier(0.22, 1, 0.36, 1) both; }
                .jq-tap-ripple { animation: jqTapRipple 0.45s ease-out forwards; }
                .jq-tap-hint { animation: jqTapHint 1.35s ease-in-out infinite; }
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
                            border: '2px solid rgba(250, 245, 235, 0.75)',
                            backgroundColor: 'rgba(250, 245, 235, 0.16)',
                        }}
                    />
                ))}
            </div>

            {/* Clean Text-Only Top-Right "Laktawan" Button (NO X icon!) */}
            <div
                style={{
                    position: 'fixed',
                    top: 'max(14px, env(safe-area-inset-top))',
                    right: 'max(16px, env(safe-area-inset-right))',
                    zIndex: 96,
                }}
            >
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        handleFinish();
                    }}
                    className="rounded-full text-xs font-bold tracking-wide cursor-pointer transition hover:opacity-100"
                    style={{
                        minHeight: '36px',
                        padding: '0 18px',
                        backgroundColor: 'rgba(28, 22, 17, 0.78)',
                        color: '#FAF5EB',
                        border: '1.5px solid rgba(250, 245, 235, 0.28)',
                        boxShadow: '0 4px 14px rgba(0, 0, 0, 0.28)',
                    }}
                >
                    Laktawan
                </button>
            </div>

            {/* STEP 2: HANDCRAFTED BARRIO TRAIL PLAQUE (5 Real 3D Buildings on Warm Parchment — Zero Rainbow SaaS Gradients!) */}
            {currentStep.visual === 'maps' && (
                <div
                    key="vis-maps"
                    className="pointer-events-none px-3 sm:px-6 flex justify-center jq-panel-in"
                    style={{
                        position: 'fixed',
                        top: 'max(64px, calc(env(safe-area-inset-top) + 54px))',
                        left: 0,
                        right: 0,
                        zIndex: 92,
                    }}
                >
                    <div className="w-full max-w-[720px] rounded-2xl overflow-hidden" style={PLAQUE_STYLE}>
                        {/* Clean Editorial Plaque Header */}
                        <div
                            className="px-4 sm:px-5 py-2 flex items-center justify-between gap-2"
                            style={{ backgroundColor: '#F2E8D5', borderBottom: '1px solid #DFCEB2' }}
                        >
                            <span className="text-xs sm:text-[13px] font-extrabold tracking-tight text-[#2C1E14]">
                                Limang Mapa ng Kuwento
                            </span>
                            <span className="text-[11px] font-bold text-[#7A5B3E]">
                                10 pts bawat mapa · 50 pts max
                            </span>
                        </div>

                        {/* Connected 5-Building Barrio Trail */}
                        <div className="relative px-3 sm:px-5 py-3.5 sm:py-4">
                            {/* Subtle dashed dirt-road path connecting the 5 stops on desktop */}
                            <div
                                className="hidden sm:block absolute left-14 right-14 top-[54px] pointer-events-none"
                                style={{ borderTop: '2px dashed #D3BE9B' }}
                            />

                            <div className="relative flex flex-wrap sm:grid sm:grid-cols-5 justify-center gap-2 sm:gap-3">
                                {FIVE_MAP_BUILDINGS.map((b, idx) => {
                                    const isActive = idx === activeShowcaseIdx;
                                    return (
                                        <div
                                            key={b.num}
                                            className="jq-node-in w-[30%] sm:w-full flex flex-col items-center text-center"
                                            style={{
                                                animationDelay: `${idx * 75}ms`,
                                                transform: isActive ? 'translateY(-3px)' : 'translateY(0)',
                                                transition: 'transform 0.3s ease',
                                            }}
                                        >
                                            {/* Ground medallion holding the real colorful 3D building */}
                                            <div
                                                className="relative w-16 h-16 sm:w-[76px] sm:h-[76px] rounded-2xl flex items-center justify-center p-1.5"
                                                style={{
                                                    backgroundColor: isActive ? '#EFE2C9' : '#F4ECDD',
                                                    border: isActive ? '2px solid #B8421A' : '1.5px solid #DFCEB2',
                                                    transition: 'border-color 0.3s ease, background-color 0.3s ease',
                                                }}
                                            >
                                                <img
                                                    src={b.img}
                                                    alt={`Mapa ${b.num}: ${b.shortTitle}`}
                                                    draggable={false}
                                                    className="w-full h-full object-contain"
                                                />
                                            </div>

                                            <div className="mt-1.5 flex items-center gap-1">
                                                <span
                                                    className="px-1.5 py-[1px] rounded text-[10px] font-extrabold"
                                                    style={{
                                                        backgroundColor: isActive ? '#B8421A' : '#E7D8BE',
                                                        color: isActive ? '#FAF5EB' : '#573F2B',
                                                        transition: 'background-color 0.3s ease, color 0.3s ease',
                                                    }}
                                                >
                                                    Mapa {b.num}
                                                </span>
                                            </div>

                                            <div className="mt-0.5 text-[11px] font-bold text-[#2C1E14] leading-tight truncate w-full">
                                                {b.shortTitle}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* STEP 3: CLEAN EDITORIAL STEP TRAIL (No Rainbow Pastel Boxes!) */}
            {currentStep.visual === 'flow' && (
                <div
                    key="vis-flow"
                    className="pointer-events-none px-4 flex justify-center jq-panel-in"
                    style={{ position: 'fixed', top: '16%', left: 0, right: 0, zIndex: 92 }}
                >
                    <div className="w-full max-w-[540px] rounded-2xl px-4 sm:px-6 py-3.5" style={PLAQUE_STYLE}>
                        <div className="flex items-center justify-between gap-2 sm:gap-3">
                            {[
                                { icon: Play, title: '1. Manood', sub: 'Maikling 3D video' },
                                { icon: BookOpen, title: '2. Panuto', sub: 'Basahin nang mabuti' },
                                { icon: CheckCircle2, title: '3. Sagutin', sub: 'Hanggang 10 pts' },
                            ].map((item, idx) => {
                                const Icon = item.icon;
                                return (
                                    <div key={item.title} className="contents">
                                        <div className="flex-1 flex flex-col sm:flex-row items-center gap-2 text-center sm:text-left">
                                            <div
                                                className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                                                style={{
                                                    backgroundColor: '#EFE4D0',
                                                    border: '1.5px solid #D6C2A1',
                                                    color: '#B8421A',
                                                }}
                                            >
                                                <Icon className="w-4 h-4" />
                                            </div>
                                            <div className="min-w-0">
                                                <div className="text-xs sm:text-[13px] font-extrabold text-[#2C1E14] leading-tight">
                                                    {item.title}
                                                </div>
                                                <div className="text-[10px] sm:text-[11px] font-medium text-[#6B543E] mt-0.5 leading-tight">
                                                    {item.sub}
                                                </div>
                                            </div>
                                        </div>
                                        {idx < 2 && (
                                            <ChevronRight className="w-4 h-4 text-[#B89D76] shrink-0 hidden sm:block" />
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            {/* STEP 4: AUTHENTIC IN-GAME RULE BAR (Clean Parchment HUD Bar — Zero Pastel SaaS Bento Boxes!) */}
            {currentStep.visual === 'hearts' && (
                <div
                    key="vis-hearts"
                    className="pointer-events-none px-4 flex justify-center jq-panel-in"
                    style={{ position: 'fixed', top: '16%', left: 0, right: 0, zIndex: 92 }}
                >
                    <div className="w-full max-w-[520px] rounded-2xl overflow-hidden" style={PLAQUE_STYLE}>
                        <div className="grid grid-cols-3 divide-x divide-[#E3D4BA] text-center">
                            <div className="px-2.5 py-3 flex flex-col items-center justify-center">
                                <div className="flex items-center gap-0.5 mb-1.5">
                                    {[1, 2, 3].map((h) => (
                                        <Heart key={h} className="w-4 h-4 text-[#C43B2B] fill-[#C43B2B]" />
                                    ))}
                                </div>
                                <div className="text-xs font-extrabold text-[#2C1E14]">3 Puso</div>
                                <div className="text-[10px] font-medium text-[#6B543E] mt-0.5">Taga-ligtas bawat mapa</div>
                            </div>

                            <div className="px-2.5 py-3 flex flex-col items-center justify-center">
                                <RotateCcw className="w-[18px] h-[18px] text-[#2E6B42] mb-1.5" />
                                <div className="text-xs font-extrabold text-[#2C1E14]">Sumagot Muli</div>
                                <div className="text-[10px] font-medium text-[#6B543E] mt-0.5">Iwas bawas ng puntos</div>
                            </div>

                            <div className="px-2.5 py-3 flex flex-col items-center justify-center">
                                <Clock className="w-[18px] h-[18px] text-[#B8421A] mb-1.5" />
                                <div className="text-xs font-extrabold text-[#2C1E14]">May Oras</div>
                                <div className="text-[10px] font-medium text-[#6B543E] mt-0.5">Bantayan ang timer</div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* STEP 5: CLEAN WOODEN BARRIO SIGNPOST PLAQUE FOR MAPA 1 */}
            {currentStep.visual === 'start' && (
                <div
                    key="vis-start"
                    className="pointer-events-none px-4 flex justify-center jq-panel-in"
                    style={{ position: 'fixed', top: '16%', left: 0, right: 0, zIndex: 92 }}
                >
                    <div
                        className="inline-flex items-center gap-3.5 rounded-2xl px-4 py-2.5"
                        style={PLAQUE_STYLE}
                    >
                        <div
                            className="w-14 h-14 rounded-xl flex items-center justify-center p-1 shrink-0"
                            style={{ backgroundColor: '#EFE4D0', border: '1.5px solid #D6C2A1' }}
                        >
                            <img
                                src="/images/tutorial/map1_3d.png"
                                alt="Mapa 1: Ang Curfew"
                                draggable={false}
                                className="w-full h-full object-contain"
                            />
                        </div>
                        <div className="text-left pr-1">
                            <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#B8421A]">
                                Unang Hamon
                            </div>
                            <div className="text-sm font-extrabold text-[#2C1E14] leading-snug">
                                Mapa 1: Ang Curfew
                            </div>
                            <div className="text-[11px] font-medium text-[#6B543E]">
                                Pindutin sa mapa para magsimula
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* BOTTOM HANDCRAFTED STORYBOOK DIALOGUE DOCK (FULL-BODY 3D JUAN + FOREHEAD-ALIGNED WARM PARCHMENT BOX) */}
            <div
                className="pointer-events-none flex justify-center"
                style={{
                    position: 'fixed',
                    left: 0,
                    right: 0,
                    bottom: 0,
                    zIndex: 94,
                    paddingLeft: 'max(12px, env(safe-area-inset-left))',
                    paddingRight: 'max(12px, env(safe-area-inset-right))',
                    paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
                }}
            >
                <div className="w-full max-w-[780px] jq-panel-in">
                    <div className="flex flex-col sm:flex-row sm:items-end">
                        {/* FULL-BODY REAL-TIME 3D JUAN OSONG (WIDER FRAME SO EXTENDED POINTING ARM NEVER CLIPS!) */}
                        <div className="relative z-20 flex items-end justify-between sm:block pl-1 sm:pl-0 -mb-5 sm:mb-0 sm:-mr-12 md:-mr-14 shrink-0">
                            <div className="relative w-[166px] h-[208px] sm:w-[238px] sm:h-[300px] md:w-[264px] md:h-[330px]">
                                <JuanGuide3D
                                    stepIdx={stepIdx}
                                    isTalkingRef={isTalkingRef}
                                    audioLevelRef={audioLevelRef}
                                    stepProgressRef={stepProgressRef}
                                />
                            </div>
                        </div>

                        {/* COMPACT TACTILE WARM PARCHMENT DIALOGUE BOX — RAISED TO JUAN'S FACE / FOREHEAD LEVEL */}
                        <div
                            className="relative z-10 flex-1 min-w-0 rounded-2xl sm:mb-[86px] md:mb-[98px]"
                            style={PLAQUE_STYLE}
                        >
                            {/* Subtle Storybook Speech Pointer Aiming at Juan's Mouth / Cheek */}
                            <div
                                aria-hidden="true"
                                className="hidden sm:block absolute -left-[9px] top-[34px] w-4 h-4 rotate-45 rounded-[2px]"
                                style={{
                                    backgroundColor: '#FAF5EB',
                                    borderLeft: '2px solid #C8B08A',
                                    borderBottom: '2px solid #C8B08A',
                                }}
                            />

                            {/* Clean Terracotta Speaker Tag */}
                            <div
                                className="inline-flex items-center gap-2 rounded-lg right-4 sm:right-auto sm:left-5"
                                style={{
                                    position: 'absolute',
                                    top: '-14px',
                                    padding: '3px 13px',
                                    backgroundColor: '#B8421A',
                                    color: '#FAF5EB',
                                    border: '2px solid #FAF5EB',
                                    boxShadow: '0 3px 8px rgba(44, 24, 12, 0.28)',
                                }}
                            >
                                <span className="text-xs font-extrabold tracking-wide">Si Juan Osong</span>
                                {isAudioPlaying && (
                                    <span className="inline-flex items-end gap-[2px] h-2.5" aria-hidden="true">
                                        <span className="jq-vbar-1 w-[2px] h-2.5 rounded-full bg-amber-200 origin-bottom" />
                                        <span className="jq-vbar-2 w-[2px] h-2.5 rounded-full bg-amber-200 origin-bottom" />
                                        <span className="jq-vbar-3 w-[2px] h-2.5 rounded-full bg-amber-200 origin-bottom" />
                                    </span>
                                )}
                            </div>

                            {/* Crisp Balanced Dialogue Copy */}
                            <div className="relative px-4 sm:px-6 pt-5 pb-3">
                                <p
                                    className="text-[14.5px] sm:text-[16px] font-semibold leading-[1.58]"
                                    style={{ color: '#231810', minHeight: '48px' }}
                                >
                                    {typedText}
                                </p>
                            </div>

                            {/* Minimal Grounded Footer: Step Counter on Left + Quiet Continue Cue on Right */}
                            <div
                                className="relative px-4 sm:px-6 py-2 flex items-center justify-between gap-2 rounded-b-[14px]"
                                style={{
                                    backgroundColor: '#F2E8D5',
                                    borderTop: '1px solid #E3D4BA',
                                }}
                            >
                                {audioBlocked ? (
                                    <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[#9A3412]">
                                        <Volume2 className="w-3.5 h-3.5 shrink-0" />
                                        <span>Pindutin para marinig ang boses</span>
                                    </span>
                                ) : (
                                    <div className="inline-flex items-center gap-2">
                                        <span className="text-[11px] font-bold text-[#7A5B3E] tabular-nums">
                                            {stepIdx + 1} / {TUTORIAL_STEPS.length}
                                        </span>
                                        <div className="flex items-center gap-1">
                                            {TUTORIAL_STEPS.map((s, idx) => (
                                                <span
                                                    key={s.id}
                                                    className="h-1.5 rounded-full transition-all duration-300"
                                                    style={{
                                                        width: idx === stepIdx ? '16px' : '5px',
                                                        backgroundColor:
                                                            idx === stepIdx
                                                                ? '#B8421A'
                                                                : idx < stepIdx
                                                                  ? '#C9936D'
                                                                  : '#D6C4A8',
                                                    }}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <span
                                    className="jq-tap-hint inline-flex items-center gap-1 text-xs font-extrabold ml-auto"
                                    style={{ color: '#B8421A' }}
                                >
                                    <span>{currentStep.prompt}</span>
                                    <ChevronDown className="w-3.5 h-3.5 shrink-0" />
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
