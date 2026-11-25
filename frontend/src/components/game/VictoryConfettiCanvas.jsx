import { useEffect, useRef, useState } from 'react';
import { getDeviceProfile } from '../../utils/deviceTier';

const FIESTA_PALETTE = ['#C2410C', '#F59E0B', '#15803D', '#FDE68A', '#EA580C', '#10B981'];

function prefersReducedMotion() {
    if (typeof window === 'undefined') return false;
    return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
}

/**
 * Smooth easeOutCubic numeric count-up for victory score readouts.
 * Respects prefers-reduced-motion by snapping immediately to target.
 */
export function useCountUp(target, active = true, durationMs = 760) {
    const safeTarget = Number.isFinite(Number(target)) ? Number(target) : 0;
    const [display, setDisplay] = useState(() => (active && !prefersReducedMotion() ? 0 : safeTarget));

    useEffect(() => {
        if (!active || safeTarget <= 0 || prefersReducedMotion()) {
            setDisplay(safeTarget);
            return undefined;
        }

        let rafId = null;
        const start = performance.now();
        setDisplay(0);

        const tick = (now) => {
            const rawT = Math.min(1, (now - start) / durationMs);
            const eased = 1 - Math.pow(1 - rawT, 3);
            setDisplay(Math.round(safeTarget * eased));
            if (rawT < 1) {
                rafId = requestAnimationFrame(tick);
            } else {
                setDisplay(safeTarget);
            }
        };

        rafId = requestAnimationFrame(tick);
        return () => {
            if (rafId) cancelAnimationFrame(rafId);
        };
    }, [safeTarget, active, durationMs]);

    return display;
}

/**
 * Ultra-lightweight 60fps 2D Canvas confetti celebration burst in warm JuanQuest tones.
 * - Zero DOM node explosion, 1x CSS pixel buffer, delta-time normalized.
 * - Auto-halves particle count on low-end classroom devices and skips entirely on reduced-motion.
 */
export default function VictoryConfettiCanvas({
    active = true,
    intensity = 'normal',
    burstOriginY = 0.32,
}) {
    const canvasRef = useRef(null);

    useEffect(() => {
        if (!active || prefersReducedMotion()) return undefined;
        const canvas = canvasRef.current;
        if (!canvas) return undefined;

        const ctx = canvas.getContext('2d', { alpha: true });
        if (!ctx) return undefined;

        const { isLowEnd } = getDeviceProfile();
        const baseCount = intensity === 'grand' ? 52 : 34;
        const count = isLowEnd ? Math.round(baseCount * 0.5) : baseCount;

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

        const originX = viewW * 0.5;
        const originY = viewH * burstOriginY;
        const particles = Array.from({ length: count }).map((_, idx) => {
            const spread = -Math.PI / 2 + (Math.random() - 0.5) * 1.95;
            const speed = (intensity === 'grand' ? 4.4 : 3.6) + Math.random() * 5.4;
            return {
                x: originX + (Math.random() - 0.5) * 48,
                y: originY + (Math.random() - 0.5) * 18,
                vx: Math.cos(spread) * speed,
                vy: Math.sin(spread) * speed - 1.4,
                w: 5.5 + Math.random() * 4.5,
                h: 3.5 + Math.random() * 3.5,
                rot: Math.random() * Math.PI * 2,
                vr: (Math.random() - 0.5) * 0.24,
                color: FIESTA_PALETTE[idx % FIESTA_PALETTE.length],
                alpha: 1,
                decay: 0.011 + Math.random() * 0.008,
                isCircle: idx % 5 === 0,
            };
        });

        let rafId = null;
        let lastNow = performance.now();

        const loop = (now) => {
            const dtScale = Math.min(2.2, Math.max(0.4, (now - lastNow) / 16.67));
            lastNow = now;

            ctx.clearRect(0, 0, viewW, viewH);
            let alive = 0;

            for (let i = 0; i < particles.length; i += 1) {
                const p = particles[i];
                if (p.alpha <= 0) continue;
                alive += 1;

                const drag = Math.pow(0.986, dtScale);
                p.vx *= drag;
                p.vy = p.vy * drag + 0.16 * dtScale;
                p.x += p.vx * dtScale;
                p.y += p.vy * dtScale;
                p.rot += p.vr * dtScale;
                p.alpha -= p.decay * dtScale;

                if (p.alpha <= 0) continue;

                ctx.save();
                ctx.globalAlpha = Math.max(0, Math.min(1, p.alpha));
                ctx.translate(p.x, p.y);
                ctx.rotate(p.rot);
                ctx.fillStyle = p.color;
                if (p.isCircle) {
                    ctx.beginPath();
                    ctx.arc(0, 0, p.w * 0.42, 0, Math.PI * 2);
                    ctx.fill();
                } else {
                    ctx.fillRect(-p.w * 0.5, -p.h * 0.5, p.w, p.h);
                }
                ctx.restore();
            }

            if (alive > 0) {
                rafId = requestAnimationFrame(loop);
            } else {
                ctx.clearRect(0, 0, viewW, viewH);
            }
        };

        rafId = requestAnimationFrame(loop);

        return () => {
            window.removeEventListener('resize', resize);
            if (rafId) cancelAnimationFrame(rafId);
        };
    }, [active, intensity, burstOriginY]);

    if (!active) return null;

    return (
        <canvas
            ref={canvasRef}
            aria-hidden="true"
            className="fixed inset-0 z-10 w-full h-full pointer-events-none"
        />
    );
}
