import { useCallback, useEffect, useRef, useState } from 'react';
import { playUnlockChime } from '../../utils/gameAudio';
import { getDeviceProfile } from '../../utils/deviceTier';

function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
}

// Cached pre-rendered particle sprites (zero per-frame shadowBlur or radialGradient cost!)
let cachedSprites = null;

function getGoldSprites() {
    if (cachedSprites) return cachedSprites;

    const makeCanvas = (size) => {
        const c = document.createElement('canvas');
        c.width = size;
        c.height = size;
        return c;
    };

    const makeStar = (color) => {
        const size = 32;
        const c = makeCanvas(size);
        const cx = c.getContext('2d');
        const mid = size / 2;
        // Soft radial halo behind diamond star (baked once!)
        const g = cx.createRadialGradient(mid, mid, 0, mid, mid, mid);
        g.addColorStop(0, 'rgba(254, 249, 195, 0.85)');
        g.addColorStop(0.35, 'rgba(250, 204, 21, 0.35)');
        g.addColorStop(1, 'rgba(250, 204, 21, 0)');
        cx.fillStyle = g;
        cx.fillRect(0, 0, size, size);

        // Crisp 4-point diamond star
        cx.fillStyle = color;
        cx.beginPath();
        for (let i = 0; i < 8; i++) {
            const a = (i * Math.PI) / 4;
            const rr = i % 2 === 0 ? 12 : 2.3;
            const px = mid + Math.cos(a) * rr;
            const py = mid + Math.sin(a) * rr;
            if (i === 0) cx.moveTo(px, py);
            else cx.lineTo(px, py);
        }
        cx.closePath();
        cx.fill();
        return c;
    };

    const makeDot = (inner, outer) => {
        const size = 24;
        const c = makeCanvas(size);
        const cx = c.getContext('2d');
        const mid = size / 2;
        const g = cx.createRadialGradient(mid, mid, 0, mid, mid, mid);
        g.addColorStop(0, inner);
        g.addColorStop(0.4, outer);
        g.addColorStop(1, 'rgba(250, 204, 21, 0)');
        cx.fillStyle = g;
        cx.fillRect(0, 0, size, size);
        return c;
    };

    cachedSprites = {
        starWhite: makeStar('#FFFFFF'),
        starGold: makeStar('#FEF08A'),
        starAmber: makeStar('#FACC15'),
        dotBright: makeDot('#FFFFFF', 'rgba(254, 240, 138, 0.85)'),
        dotGold: makeDot('#FEF08A', 'rgba(250, 204, 21, 0.72)'),
        bokeh: makeDot('rgba(254, 252, 232, 0.65)', 'rgba(250, 204, 21, 0.32)'),
    };
    return cachedSprites;
}

/**
 * Ultra-lightweight 60fps pure-visual cinematic gold padlock unlock overlay (zero text, zero backdrop-filter blur,
 * zero per-frame shadowBlur, pre-rendered glow sprites, unified rAF loop):
 * 1) Dark focus vignette fades in while upright golden padlock flies smoothly from tapped building roof to center screen.
 * 2) Upright charge pulse + converging golden sparks + dual diagonal gold shimmer sweeps.
 * 3) U-shackle snaps straight up with molten keyhole glow, anamorphic lens flare, rotating volumetric rays,
 *    triple shockwave rings, and cached-sprite glittering gold diamond stars & bokeh dust.
 * 4) Dissolves smoothly while revealing StageModal underneath.
 */
export default function PadlockUnlockOverlay({ origin, onRevealStage, onComplete }) {
    const canvasRef = useRef(null);
    const wrapRef = useRef(null);
    const onRevealRef = useRef(onRevealStage);
    const onCompleteRef = useRef(onComplete);
    const revealedRef = useRef(false);
    const completedRef = useRef(false);
    const cleanupRef = useRef(null);

    const [overlayVisible, setOverlayVisible] = useState(false);
    const [phase, setPhase] = useState('flying'); // 'flying' | 'charging' | 'opened' | 'dissolving'
    const [auraOpacity, setAuraOpacity] = useState(0);
    const [raysVisible, setRaysVisible] = useState(false);

    useEffect(() => {
        onRevealRef.current = onRevealStage;
        onCompleteRef.current = onComplete;
    }, [onRevealStage, onComplete]);

    const triggerRevealOnce = useCallback(() => {
        if (revealedRef.current) return;
        revealedRef.current = true;
        onRevealRef.current?.();
    }, []);

    const triggerCompleteOnce = useCallback(() => {
        if (completedRef.current) return;
        completedRef.current = true;
        onCompleteRef.current?.();
    }, []);

    const handleSkipNow = useCallback(() => {
        cleanupRef.current?.();
        setPhase('dissolving');
        setAuraOpacity(0);
        setRaysVisible(false);
        setOverlayVisible(false);
        triggerRevealOnce();
        triggerCompleteOnce();
    }, [triggerCompleteOnce, triggerRevealOnce]);

    useEffect(() => {
        // Respect OS reduced-motion preference by opening immediately with gentle chime
        if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) {
            playUnlockChime();
            triggerRevealOnce();
            const quickId = setTimeout(() => triggerCompleteOnce(), 60);
            return () => clearTimeout(quickId);
        }

        const canvas = canvasRef.current;
        const wrap = wrapRef.current;
        if (!canvas || !wrap) return undefined;

        const ctx = canvas.getContext('2d', { alpha: true });
        const sprites = getGoldSprites();
        const starSprites = [sprites.starWhite, sprites.starGold, sprites.starAmber];
        const dotSprites = [sprites.dotBright, sprites.dotGold];
        const particleScale = getDeviceProfile().isLowEnd ? 0.5 : 1;

        const timers = [];
        let rafId = null;
        let fxActive = true;
        const particles = [];

        const stopAllFx = () => {
            fxActive = false;
            timers.forEach((id) => clearTimeout(id));
            timers.length = 0;
            if (rafId) {
                cancelAnimationFrame(rafId);
                rafId = null;
            }
        };
        cleanupRef.current = stopAllFx;

        // Keep particle canvas at 1x CSS pixels (soft glowing sparks look identical & 4x faster on Retina/mobile!)
        let viewW = window.innerWidth;
        let viewH = window.innerHeight;
        const resize = () => {
            viewW = window.innerWidth;
            viewH = window.innerHeight;
            canvas.width = viewW;
            canvas.height = viewH;
        };
        resize();
        window.addEventListener('resize', resize);

        const endX = viewW / 2;
        const endY = viewH / 2;
        const rawStartX = typeof origin?.x === 'number' ? origin.x : endX;
        const rawStartY = typeof origin?.y === 'number' ? origin.y : viewH * 0.6;
        const startX = Math.max(48, Math.min(viewW - 48, rawStartX));
        const startY = Math.max(64, Math.min(viewH - 64, rawStartY));

        const spawnCometSpark = (x, y) => {
            for (let i = 0; i < 2; i++) {
                const isStar = Math.random() > 0.45;
                particles.push({
                    kind: 'trail',
                    sprite: isStar
                        ? starSprites[Math.floor(Math.random() * starSprites.length)]
                        : dotSprites[Math.floor(Math.random() * dotSprites.length)],
                    x: x + (Math.random() - 0.5) * 16,
                    y: y + (Math.random() - 0.5) * 16,
                    vx: (Math.random() - 0.5) * 1.1,
                    vy: (Math.random() - 0.5) * 1.1 - 0.35,
                    drawSize: isStar ? 12 + Math.random() * 14 : 9 + Math.random() * 10,
                    alpha: 0.95,
                    decay: 0.028 + Math.random() * 0.015,
                    phase: Math.random() * 6.28,
                });
            }
        };

        const spawnConvergeSparks = (cx, cy) => {
            const total = Math.max(8, Math.round(22 * particleScale));
            for (let i = 0; i < total; i++) {
                const angle = Math.random() * Math.PI * 2;
                const dist = 74 + Math.random() * 68;
                const isStar = Math.random() > 0.4;
                particles.push({
                    kind: 'converge',
                    sprite: isStar ? sprites.starWhite : sprites.dotBright,
                    x: cx + Math.cos(angle) * dist,
                    y: cy + Math.sin(angle) * dist,
                    tx: cx,
                    ty: cy,
                    speed: 0.16 + Math.random() * 0.08,
                    drawSize: isStar ? 12 + Math.random() * 12 : 9 + Math.random() * 8,
                    alpha: 0.96,
                    decay: 0.034,
                    phase: Math.random() * 6.28,
                });
            }
        };

        const spawnRichGoldBurst = (cx, cy, count = 48, bokehCount = 16) => {
            const scaledCount = Math.max(12, Math.round(count * particleScale));
            const scaledBokeh = Math.max(6, Math.round(bokehCount * particleScale));
            for (let i = 0; i < scaledCount; i++) {
                const angle = (Math.PI * 2 * i) / scaledCount + (Math.random() - 0.5) * 0.25;
                const spd = 2.4 + Math.random() * 6.6;
                const isStar = Math.random() > 0.34;
                particles.push({
                    kind: 'burst',
                    sprite: isStar
                        ? starSprites[Math.floor(Math.random() * starSprites.length)]
                        : dotSprites[Math.floor(Math.random() * dotSprites.length)],
                    x: cx + (Math.random() - 0.5) * 16,
                    y: cy + (Math.random() - 0.5) * 16,
                    vx: Math.cos(angle) * spd,
                    vy: Math.sin(angle) * spd - 0.6,
                    drag: 0.95,
                    gravity: 0.032,
                    drawSize: isStar ? 14 + Math.random() * 18 : 10 + Math.random() * 12,
                    alpha: 1,
                    decay: 0.014 + Math.random() * 0.012,
                    phase: Math.random() * 6.28,
                });
            }
            for (let i = 0; i < scaledBokeh; i++) {
                const angle = Math.random() * Math.PI * 2;
                const dist = 20 + Math.random() * 105;
                particles.push({
                    kind: 'bokeh',
                    sprite: sprites.bokeh,
                    x: cx + Math.cos(angle) * dist,
                    y: cy + Math.sin(angle) * dist,
                    vx: (Math.random() - 0.5) * 0.7,
                    vy: -(0.6 + Math.random() * 1.1),
                    drawSize: 16 + Math.random() * 18,
                    alpha: 0.78,
                    decay: 0.011 + Math.random() * 0.008,
                    phase: Math.random() * 6.28,
                });
            }
        };

        // Fade in deep dark focus backdrop on next frame
        timers.push(setTimeout(() => setOverlayVisible(true), 16));

        // Unified single 60fps rAF loop for BOTH padlock flight & cached-sprite particles (delta-time normalized!)
        const flyDuration = 480;
        const flyStart = performance.now();
        let lastNow = flyStart;
        let flightDone = false;
        let lastCometTime = 0;
        wrap.style.opacity = '1';
        wrap.style.transform = `translate3d(${startX}px, ${startY}px, 0) scale(0.34)`;

        const frameLoop = (now) => {
            const dtScale = Math.min(2.2, Math.max(0.4, (now - lastNow) / 16.67));
            lastNow = now;

            // 1) Update upright arc flight from building roof -> exact center
            if (!flightDone) {
                const rawT = Math.min(1, (now - flyStart) / flyDuration);
                const eased = easeOutCubic(rawT);
                const arcLift = Math.sin(rawT * Math.PI) * 36;
                const x = startX + (endX - startX) * eased;
                const y = startY + (endY - startY) * eased - arcLift;
                const scale = 0.34 + (1.0 - 0.34) * eased;

                wrap.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`;

                if (rawT < 0.92 && now - lastCometTime >= 24) {
                    lastCometTime = now;
                    spawnCometSpark(x, y);
                }
                if (rawT >= 1) {
                    flightDone = true;
                    wrap.style.transform = `translate3d(${endX}px, ${endY}px, 0) scale(1)`;
                }
            }

            // 2) Draw all cached-sprite gold particles (ultra-fast drawImage only!)
            ctx.clearRect(0, 0, viewW, viewH);
            const tPhase = now * 0.014;
            for (let i = particles.length - 1; i >= 0; i--) {
                const p = particles[i];
                if (p.kind === 'converge') {
                    const step = 1 - Math.pow(1 - p.speed, dtScale);
                    p.x += (p.tx - p.x) * step;
                    p.y += (p.ty - p.y) * step;
                    p.alpha -= p.decay * dtScale;
                } else {
                    p.x += p.vx * dtScale;
                    p.y += p.vy * dtScale;
                    if (p.drag) {
                        const d = Math.pow(p.drag, dtScale);
                        p.vx *= d;
                        p.vy *= d;
                    }
                    if (p.gravity) p.vy += p.gravity * dtScale;
                    p.alpha -= p.decay * dtScale;
                }

                if (p.alpha <= 0) {
                    particles.splice(i, 1);
                    continue;
                }

                const twinkle = 0.6 + 0.4 * Math.sin(tPhase + p.phase);
                ctx.globalAlpha = Math.max(0, Math.min(1, p.alpha * twinkle));
                const half = p.drawSize * 0.5;
                ctx.drawImage(p.sprite, p.x - half, p.y - half, p.drawSize, p.drawSize);
            }
            ctx.globalAlpha = 1;

            if (!flightDone || particles.length > 0 || fxActive) {
                rafId = requestAnimationFrame(frameLoop);
            }
        };
        rafId = requestAnimationFrame(frameLoop);

        // Soft golden halo enters mid-flight
        timers.push(setTimeout(() => setAuraOpacity(0.78), 210));

        // STEP 2: Upright Charge Pulse + Dual Gold Shimmer Gleams + Converging Sparks
        timers.push(
            setTimeout(() => {
                setPhase('charging');
                spawnConvergeSparks(endX, endY);
            }, 480)
        );

        // STEP 3: POP OPEN! Shackle Springs Straight Up + Lens Flare + Volumetric Rays + Rich Gold Burst
        timers.push(
            setTimeout(() => {
                setPhase('opened');
                setAuraOpacity(1);
                setRaysVisible(true);
                playUnlockChime();
                spawnRichGoldBurst(endX, endY, 48, 16);
            }, 800)
        );

        // Second lighter shimmer wave while opened
        timers.push(
            setTimeout(() => {
                spawnRichGoldBurst(endX, endY - 8, 28, 10);
            }, 1030)
        );

        // STEP 4: Dissolve padlock in gold light & smoothly reveal StageModal underneath
        timers.push(
            setTimeout(() => {
                setPhase('dissolving');
                setAuraOpacity(0);
                setRaysVisible(false);
                setOverlayVisible(false);
                triggerRevealOnce();
            }, 1420)
        );

        // Unmount overlay cleanly after cross-fade finishes
        timers.push(
            setTimeout(() => {
                fxActive = false;
                triggerCompleteOnce();
            }, 1820)
        );

        return () => {
            window.removeEventListener('resize', resize);
            stopAllFx();
            cleanupRef.current = null;
        };
    }, [origin, triggerCompleteOnce, triggerRevealOnce]);

    const isCharging = phase === 'charging';
    const isOpened = phase === 'opened';
    const isDissolving = phase === 'dissolving';

    const innerAnimClass = isCharging
        ? 'jq-lock-charge'
        : isOpened
            ? 'jq-lock-pop'
            : isDissolving
                ? 'jq-lock-dissolve'
                : '';

    return (
        <div
            role="button"
            tabIndex={0}
            aria-label="Laktawan ang animasyon ng kandado"
            onClick={handleSkipNow}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
                    e.preventDefault();
                    handleSkipNow();
                }
            }}
            className={`fixed inset-0 z-[60] transition-opacity duration-300 cursor-pointer select-none ${
                overlayVisible ? 'opacity-100' : 'opacity-0'
            } ${isDissolving ? 'pointer-events-none' : 'pointer-events-auto'}`}
            style={{
                background:
                    'radial-gradient(circle at 50% 50%, rgba(12, 10, 9, 0.78) 0%, rgba(4, 3, 2, 0.94) 100%)',
                willChange: 'opacity',
            }}
        >
            {/* Pre-Rendered Glow Sprite Canvas (Zero shadowBlur, locked 60fps) */}
            <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />

            {/* Exact Viewport Center: Molten Gold Aura, Dual Volumetric Rays, Lens Flare & Shockwave Rings */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div
                    className="absolute w-72 h-72 sm:w-80 sm:h-80 rounded-full transition-opacity duration-300"
                    style={{
                        opacity: auraOpacity,
                        background:
                            'radial-gradient(circle, rgba(254, 249, 195, 0.76) 0%, rgba(250, 204, 21, 0.38) 36%, rgba(217, 119, 6, 0.14) 58%, rgba(217, 119, 6, 0) 76%)',
                    }}
                />

                <svg
                    className="absolute w-80 h-80 sm:w-96 sm:h-96 transition-opacity duration-300 jq-rays-cw"
                    style={{ opacity: raysVisible ? 1 : 0 }}
                    viewBox="0 0 200 200"
                >
                    <defs>
                        <radialGradient id="jqRayGold1" cx="50%" cy="50%" r="50%">
                            <stop offset="0%" stopColor="#FEF9C3" stopOpacity="0.9" />
                            <stop offset="45%" stopColor="#FACC15" stopOpacity="0.34" />
                            <stop offset="100%" stopColor="#F59E0B" stopOpacity="0" />
                        </radialGradient>
                    </defs>
                    <g fill="url(#jqRayGold1)">
                        <polygon points="100,100 91,0 109,0" />
                        <polygon points="100,100 134,8 150,18" />
                        <polygon points="100,100 172,36 184,52" />
                        <polygon points="100,100 196,86 200,104" />
                        <polygon points="100,100 188,136 178,152" />
                        <polygon points="100,100 156,174 140,184" />
                        <polygon points="100,100 108,200 90,200" />
                        <polygon points="100,100 62,188 46,176" />
                        <polygon points="100,100 26,160 14,144" />
                        <polygon points="100,100 2,112 0,94" />
                        <polygon points="100,100 14,62 24,46" />
                        <polygon points="100,100 46,24 62,14" />
                    </g>
                </svg>

                <svg
                    className="absolute w-72 h-72 sm:w-80 sm:h-80 transition-opacity duration-300 jq-rays-ccw"
                    style={{ opacity: raysVisible ? 0.92 : 0 }}
                    viewBox="0 0 200 200"
                >
                    <defs>
                        <radialGradient id="jqRayGold2" cx="50%" cy="50%" r="50%">
                            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.72" />
                            <stop offset="50%" stopColor="#FDE047" stopOpacity="0.22" />
                            <stop offset="100%" stopColor="#EAB308" stopOpacity="0" />
                        </radialGradient>
                    </defs>
                    <g fill="url(#jqRayGold2)">
                        <polygon points="100,100 96,4 104,4" />
                        <polygon points="100,100 146,16 154,24" />
                        <polygon points="100,100 184,58 190,68" />
                        <polygon points="100,100 194,116 190,126" />
                        <polygon points="100,100 162,168 152,176" />
                        <polygon points="100,100 112,196 100,198" />
                        <polygon points="100,100 54,180 44,172" />
                        <polygon points="100,100 14,136 10,124" />
                        <polygon points="100,100 8,78 14,66" />
                        <polygon points="100,100 40,28 50,20" />
                    </g>
                </svg>

                {(isOpened || isDissolving) && (
                    <>
                        <div
                            className="absolute w-80 sm:w-96 h-8 rounded-full jq-flare-burst"
                            style={{
                                background:
                                    'radial-gradient(ellipse at center, #FFFFFF 0%, #FEF08A 35%, rgba(250,204,21,0.35) 68%, rgba(250,204,21,0) 100%)',
                            }}
                        />
                        <div
                            className="absolute w-32 h-32 rounded-full jq-core-flash"
                            style={{
                                background:
                                    'radial-gradient(circle, #FFFFFF 0%, #FEF08A 40%, rgba(250,204,21,0) 76%)',
                            }}
                        />
                        <div className="absolute w-28 h-28 rounded-full border-[3.5px] border-yellow-200 jq-ring-1" />
                        <div className="absolute w-28 h-28 rounded-full border-2 border-amber-400 jq-ring-2" />
                        <div className="absolute w-28 h-28 rounded-full border border-yellow-100/80 jq-ring-3" />
                    </>
                )}
            </div>

            {/* Hero Upright Flying Golden Padlock (pure GPU transform/opacity — zero CSS filter drop-shadow!) */}
            <div
                ref={wrapRef}
                className="absolute left-0 top-0 pointer-events-none opacity-0"
                style={{
                    width: '144px',
                    height: '162px',
                    marginLeft: '-72px',
                    marginTop: '-81px',
                    willChange: 'transform, opacity',
                }}
            >
                <div className={`w-full h-full flex items-center justify-center ${innerAnimClass}`}>
                    <svg className="w-36 h-40 overflow-visible" viewBox="0 0 96 112">
                        <defs>
                            <linearGradient id="jqGoldMain" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stopColor="#FEFCE8" />
                                <stop offset="28%" stopColor="#FDE047" />
                                <stop offset="65%" stopColor="#F59E0B" />
                                <stop offset="100%" stopColor="#B45309" />
                            </linearGradient>
                            <linearGradient id="jqGoldArch" x1="0%" y1="0%" x2="100%" y2="0%">
                                <stop offset="0%" stopColor="#FEFCE8" />
                                <stop offset="45%" stopColor="#FACC15" />
                                <stop offset="100%" stopColor="#CA8A04" />
                            </linearGradient>
                            <linearGradient id="jqGleamBlade" x1="0%" y1="0%" x2="100%" y2="0%">
                                <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0" />
                                <stop offset="50%" stopColor="#FFFFFF" stopOpacity="0.95" />
                                <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
                            </linearGradient>
                            <radialGradient id="jqKeyholeGlow" cx="50%" cy="50%" r="50%">
                                <stop offset="0%" stopColor="#FFFFFF" stopOpacity="1" />
                                <stop offset="45%" stopColor="#FEF08A" stopOpacity="0.85" />
                                <stop offset="100%" stopColor="#FACC15" stopOpacity="0" />
                            </radialGradient>
                            <clipPath id="jqBodyClip">
                                <rect x="14" y="46" width="68" height="54" rx="12" />
                            </clipPath>
                        </defs>

                        {/* U-Shackle: straight-up pop opens cleanly */}
                        <g className={isOpened || isDissolving ? 'jq-shackle-open' : ''}>
                            <path
                                d="M29 50 V31 C29 15.5 67 15.5 67 31 V68"
                                fill="none"
                                stroke="#78350F"
                                strokeWidth="15"
                                strokeLinecap="round"
                            />
                            <path
                                d="M29 50 V31 C29 15.5 67 15.5 67 31 V68"
                                fill="none"
                                stroke="url(#jqGoldArch)"
                                strokeWidth="10.2"
                                strokeLinecap="round"
                            />
                            <path
                                d="M31 31 C31 19.5 62 19 64 28"
                                fill="none"
                                stroke="#FFFFFF"
                                strokeWidth="2.6"
                                strokeLinecap="round"
                                opacity="0.9"
                            />
                        </g>

                        {/* Metallic Golden Padlock Body */}
                        <rect
                            x="14"
                            y="46"
                            width="68"
                            height="54"
                            rx="12"
                            fill="url(#jqGoldMain)"
                            stroke="#92400E"
                            strokeWidth="3"
                        />
                        <rect x="17" y="49" width="62" height="6.5" rx="3.2" fill="#FEFCE8" opacity="0.65" />
                        <rect x="17" y="91" width="62" height="5" rx="2.5" fill="#78350F" opacity="0.45" />

                        {/* Keyhole + Baked Radial Glow (zero CSS blur!) */}
                        <circle cx="48" cy="69" r="7.5" fill="#422006" />
                        <rect x="44.2" y="72" width="7.6" height="14.5" rx="2.5" fill="#422006" />
                        <circle
                            cx="48"
                            cy="72"
                            r="18"
                            fill="url(#jqKeyholeGlow)"
                            opacity={isOpened || isDissolving ? 1 : 0}
                            className="transition-opacity duration-200"
                        />

                        {/* Dual Diagonal Gold Shimmer Sweeps */}
                        <g clipPath="url(#jqBodyClip)">
                            <rect
                                x="18"
                                y="40"
                                width="26"
                                height="68"
                                fill="url(#jqGleamBlade)"
                                opacity={isCharging || isOpened ? 1 : 0}
                                className={isCharging || isOpened ? 'jq-shimmer-1' : ''}
                            />
                            <rect
                                x="18"
                                y="40"
                                width="14"
                                height="68"
                                fill="url(#jqGleamBlade)"
                                opacity={isCharging || isOpened ? 1 : 0}
                                className={isCharging || isOpened ? 'jq-shimmer-2' : ''}
                            />
                        </g>
                    </svg>
                </div>
            </div>

            {!isDissolving && (
                <div className="absolute inset-x-0 bottom-8 sm:bottom-10 flex justify-center pointer-events-none">
                    <span className="px-3.5 py-1.5 rounded-full bg-stone-950/45 border border-amber-200/15 text-[11px] font-medium text-amber-100/70 tracking-wide">
                        I-tap kahit saan upang laktawan
                    </span>
                </div>
            )}
        </div>
    );
}
