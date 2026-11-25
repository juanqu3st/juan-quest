import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Smart anti-abuse polling hook:
 * 1. Route-scoped (auto-cleans on unmount when leaving Live Monitor / Lobby).
 * 2. Page-active gated (pauses 100% when tab is hidden / minimized; fires 1 immediate refresh on tab return).
 * 3. In-flight guarded (recursive setTimeout — slow Wi-Fi never stacks duplicate requests).
 * 4. Adaptive idle backoff (gradually backs off when backend reports `unchanged`, snaps back instantly on new data).
 */
export function useSmartPoll({
    enabled = true,
    baseIntervalMs = 5000,
    maxIntervalMs = 30000,
    onTick,
    resetKey = null,
}) {
    const [isPageActive, setIsPageActive] = useState(() =>
        typeof document === 'undefined' ? true : document.visibilityState === 'visible'
    );

    const onTickRef = useRef(onTick);
    onTickRef.current = onTick;

    const timerRef = useRef(null);
    const inFlightRef = useRef(false);
    const unchangedStreakRef = useRef(0);
    const wasHiddenRef = useRef(false);

    const computeDelay = useCallback(() => {
        const streak = unchangedStreakRef.current;
        if (streak <= 2) return baseIntervalMs;
        if (streak <= 4) return Math.min(maxIntervalMs, baseIntervalMs * 2);
        if (streak <= 7) return Math.min(maxIntervalMs, baseIntervalMs * 4);
        return maxIntervalMs;
    }, [baseIntervalMs, maxIntervalMs]);

    const resetBackoff = useCallback(() => {
        unchangedStreakRef.current = 0;
    }, []);

    useEffect(() => {
        if (typeof document === 'undefined') return undefined;
        const syncVisibility = () => {
            const visible = document.visibilityState === 'visible';
            if (!visible) wasHiddenRef.current = true;
            setIsPageActive(visible);
        };
        document.addEventListener('visibilitychange', syncVisibility);
        window.addEventListener('focus', syncVisibility);
        return () => {
            document.removeEventListener('visibilitychange', syncVisibility);
            window.removeEventListener('focus', syncVisibility);
        };
    }, []);

    useEffect(() => {
        unchangedStreakRef.current = 0;
    }, [resetKey]);

    useEffect(() => {
        let cancelled = false;

        const clearScheduled = () => {
            if (timerRef.current) {
                clearTimeout(timerRef.current);
                timerRef.current = null;
            }
        };

        if (!enabled || !isPageActive) {
            clearScheduled();
            return undefined;
        }

        const scheduleNext = (delayMs) => {
            clearScheduled();
            if (cancelled) return;
            timerRef.current = setTimeout(runOnce, delayMs);
        };

        const runOnce = async () => {
            if (cancelled) return;
            if (typeof navigator !== 'undefined' && navigator.onLine === false) {
                scheduleNext(Math.min(maxIntervalMs, baseIntervalMs * 2));
                return;
            }
            if (inFlightRef.current) {
                scheduleNext(baseIntervalMs);
                return;
            }

            inFlightRef.current = true;
            try {
                const hasNewData = await onTickRef.current?.();
                if (hasNewData) {
                    unchangedStreakRef.current = 0;
                } else {
                    unchangedStreakRef.current = Math.min(20, unchangedStreakRef.current + 1);
                }
            } catch {
                unchangedStreakRef.current = Math.min(20, unchangedStreakRef.current + 1);
            } finally {
                inFlightRef.current = false;
                if (!cancelled) {
                    scheduleNext(computeDelay());
                }
            }
        };

        // If the user just returned from a hidden tab, check immediately & snap back to base interval!
        if (wasHiddenRef.current) {
            wasHiddenRef.current = false;
            unchangedStreakRef.current = 0;
            runOnce();
        } else {
            scheduleNext(computeDelay());
        }

        return () => {
            cancelled = true;
            clearScheduled();
        };
    }, [enabled, isPageActive, resetKey, baseIntervalMs, maxIntervalMs, computeDelay]);

    return { isPageActive, resetBackoff };
}
