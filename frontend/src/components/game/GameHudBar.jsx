import { motion } from 'framer-motion';
import { Award, Clock, Heart, Volume2, VolumeX } from 'lucide-react';

export default function GameHudBar({
    heartsRemaining,
    maxHearts = 3,
    secondsLeft,
    projectedScore,
    maxScore = 10,
    hideScore = false,
    shakeTrigger,
    muted = false,
    onToggleMute,
}) {
    const mins = Math.floor(secondsLeft / 60);
    const secs = String(secondsLeft % 60).padStart(2, '0');
    const isCriticalTime = secondsLeft <= 10;

    return (
        <div className="flex items-center gap-2 sm:gap-3.5 text-[11px] sm:text-[13px] font-semibold text-stone-700 shrink-0">
            {/* Hearts (Compact count on small phones, full 3 hearts on sm+) */}
            <motion.div
                key={shakeTrigger}
                animate={shakeTrigger > 0 ? { x: [-4, 4, -3, 3, 0] } : {}}
                transition={{ duration: 0.28 }}
                className="inline-flex items-center gap-0.5 sm:gap-1"
                title="Natitirang puso"
            >
                <span className="inline-flex sm:hidden items-center gap-1 text-rose-600 font-bold tabular-nums">
                    <Heart className="w-3.5 h-3.5 fill-rose-600" />
                    {heartsRemaining}
                </span>
                <span className="hidden sm:inline-flex items-center gap-1">
                    {Array.from({ length: maxHearts }).map((_, idx) => {
                        const active = idx < heartsRemaining;
                        return (
                            <Heart
                                key={idx}
                                className={`w-4 h-4 transition-opacity ${
                                    active ? 'text-rose-600 fill-rose-600' : 'text-stone-300'
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

            {/* Timer */}
            <div
                className={`inline-flex items-center gap-1 font-mono font-bold tabular-nums ${
                    isCriticalTime ? 'text-rose-600' : 'text-stone-800'
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

                    {/* Live Earned Score (Always visible online; hidden offline so final score stays secret until QR scan) */}
                    <div
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 sm:px-0 sm:py-0 rounded-md bg-emerald-50 sm:bg-transparent border border-emerald-200 sm:border-0 text-[#15803D] sm:text-stone-700 font-bold sm:font-semibold tabular-nums"
                        title="Nakuhang puntos"
                    >
                        <Award className="hidden sm:inline w-4 h-4 text-[#15803D] shrink-0" />
                        <span>
                            {projectedScore}/{maxScore}
                            <span className="hidden sm:inline"> pts</span>
                        </span>
                    </div>
                </>
            )}

            {onToggleMute && (
                <>
                    <span className="h-4 w-px bg-stone-200 hidden sm:inline-block" aria-hidden="true" />
                    <button
                        type="button"
                        onClick={onToggleMute}
                        aria-label={muted ? 'Buksan ang tunog' : 'I-mute ang tunog'}
                        title={muted ? 'Buksan ang tunog' : 'I-mute ang tunog'}
                        className="w-9 h-9 rounded-xl text-stone-500 hover:text-stone-900 hover:bg-stone-100 inline-flex items-center justify-center transition cursor-pointer shrink-0"
                    >
                        {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                    </button>
                </>
            )}
        </div>
    );
}
