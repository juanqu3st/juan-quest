import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Award, Clock, Heart, Settings } from 'lucide-react';
import { playTimerTick } from '../../utils/gameAudio';

export default function GameHudBar({
    heartsRemaining,
    maxHearts = 3,
    secondsLeft,
    projectedScore,
    maxScore = 10,
    hideScore = false,
    shakeTrigger,
    muted = false,
    onOpenSettings,
}) {
    const mins = Math.floor(secondsLeft / 60);
    const secs = String(secondsLeft % 60).padStart(2, '0');
    const isCriticalTime = secondsLeft <= 10;

    // Track exact score deltas (+1 pt in Mapa 1, +2 pts in Mapa 4/5, or exact earned board delta!)
    const prevScoreRef = useRef(projectedScore);
    const [scorePop, setScorePop] = useState(null); // { id, delta }
    const [scoreBumpTick, setScoreBumpTick] = useState(0);

    // Track exact heart-break index when losing a heart
    const prevHeartsRef = useRef(heartsRemaining);
    const [lostHeartIdx, setLostHeartIdx] = useState(-1);

    // Final-5s soft clock tick SFX
    const lastTickSecRef = useRef(null);

    useEffect(() => {
        const prev = prevScoreRef.current;
        prevScoreRef.current = projectedScore;
        if (!hideScore && typeof projectedScore === 'number' && typeof prev === 'number' && projectedScore > prev) {
            const delta = projectedScore - prev;
            const id = Date.now();
            setScorePop({ id, delta });
            setScoreBumpTick((c) => c + 1);
            const t = setTimeout(() => {
                setScorePop((cur) => (cur?.id === id ? null : cur));
            }, 850);
            return () => clearTimeout(t);
        }
        return undefined;
    }, [projectedScore, hideScore]);

    useEffect(() => {
        const prev = prevHeartsRef.current;
        prevHeartsRef.current = heartsRemaining;
        if (typeof heartsRemaining === 'number' && typeof prev === 'number' && heartsRemaining < prev) {
            setLostHeartIdx(heartsRemaining);
            const t = setTimeout(() => setLostHeartIdx(-1), 420);
            return () => clearTimeout(t);
        }
        return undefined;
    }, [heartsRemaining]);

    useEffect(() => {
        if (secondsLeft >= 1 && secondsLeft <= 5 && lastTickSecRef.current !== secondsLeft) {
            lastTickSecRef.current = secondsLeft;
            if (!muted) playTimerTick();
        } else if (secondsLeft > 5 || secondsLeft === 0) {
            lastTickSecRef.current = null;
        }
    }, [secondsLeft, muted]);

    return (
        <div className="flex items-center gap-2 sm:gap-3.5 text-[11px] sm:text-[13px] font-semibold text-stone-700 shrink-0">
            {/* Hearts (Compact count on small phones, full hearts + heart-break animation on sm+) */}
            <motion.div
                key={shakeTrigger}
                animate={shakeTrigger > 0 ? { x: [-4, 4, -3, 3, 0] } : {}}
                transition={{ duration: 0.28 }}
                className="inline-flex items-center gap-0.5 sm:gap-1"
                title="Natitirang puso"
            >
                <span
                    className={`inline-flex sm:hidden items-center gap-1 text-rose-600 font-bold tabular-nums ${
                        lostHeartIdx >= 0 ? 'jq-heart-loss' : ''
                    }`}
                >
                    <Heart className="w-3.5 h-3.5 fill-rose-600" />
                    {heartsRemaining}
                </span>
                <span className="hidden sm:inline-flex items-center gap-1">
                    {Array.from({ length: maxHearts }).map((_, idx) => {
                        const active = idx < heartsRemaining;
                        const justLost = idx === lostHeartIdx;
                        return (
                            <Heart
                                key={idx}
                                className={`w-4 h-4 transition-opacity ${
                                    active
                                        ? 'text-rose-600 fill-rose-600'
                                        : justLost
                                          ? 'text-rose-400 fill-rose-400 jq-heart-loss'
                                          : 'text-stone-300'
                                }`}
                            />
                        );
                    })}
                    <span className="ml-0.5 tabular-nums text-stone-600">
                        {heartsRemaining}/{maxHearts}
                    </span>
                </span>
            </motion.div>

            <span className="h-4 w-px bg-stone-200" aria-hidden="true" />

            {/* Timer with Critical <=10s Gentle Urgency Pulse */}
            <div
                className={`inline-flex items-center gap-1 font-mono font-bold tabular-nums px-1.5 py-0.5 rounded-md transition-colors ${
                    isCriticalTime
                        ? `text-rose-600 bg-rose-50 ${secondsLeft > 0 ? 'jq-timer-pulse' : ''}`
                        : 'text-stone-800'
                }`}
                title="Natitirang oras"
            >
                <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                <span>
                    {mins}:{secs}
                </span>
            </div>

            {!hideScore && (
                <>
                    <span className="h-4 w-px bg-stone-200 hidden sm:inline-block" aria-hidden="true" />

                    {/* Live Earned Score + Exact Delta Floating Pop (+1 pt / +2 pts / exact earned!) */}
                    <div
                        className="relative inline-flex items-center gap-1 px-1.5 py-0.5 sm:px-0 sm:py-0 rounded-md bg-emerald-50 sm:bg-transparent border border-emerald-200 sm:border-0 text-[#15803D] sm:text-stone-700 font-bold sm:font-semibold tabular-nums"
                        title="Nakuhang puntos"
                    >
                        <Award className="hidden sm:inline w-4 h-4 text-[#15803D] shrink-0" />
                        <span key={scoreBumpTick} className={scoreBumpTick > 0 ? 'jq-pop inline-block' : 'inline-block'}>
                            {projectedScore}/{maxScore}
                            <span className="hidden sm:inline"> pts</span>
                        </span>
                        {scorePop && (
                            <span
                                key={scorePop.id}
                                aria-hidden="true"
                                className="jq-float-pts pointer-events-none absolute left-1/2 -top-1 text-[11px] font-extrabold text-[#15803D] whitespace-nowrap"
                            >
                                +{scorePop.delta} {scorePop.delta === 1 ? 'pt' : 'pts'}
                            </span>
                        )}
                    </div>
                </>
            )}

            {onOpenSettings && (
                <>
                    <span className="h-4 w-px bg-stone-200 hidden sm:inline-block" aria-hidden="true" />
                    <button
                        type="button"
                        onClick={onOpenSettings}
                        aria-label="Mga Setting ng Laro"
                        title="Mga Setting ng Laro"
                        className="w-9 h-9 rounded-xl text-stone-500 hover:text-stone-900 hover:bg-stone-100 inline-flex items-center justify-center transition cursor-pointer shrink-0 active:scale-95"
                    >
                        <Settings className="w-4 h-4" />
                    </button>
                </>
            )}
        </div>
    );
}
