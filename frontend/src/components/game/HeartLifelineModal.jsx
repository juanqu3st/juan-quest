import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Heart, RotateCcw } from 'lucide-react';

/**
 * Compact Apple HIG Heart Lifeline ("Taga-Ligtas") Modal.
 * Appears on wrong answer ONLY while the student still has hearts remaining.
 */
export default function HeartLifelineModal({
    open,
    heartsRemaining,
    maxHearts = 3,
    pendingLifeline,
    hideScores = false,
    busy = false,
    onUseHeart,
    onSkip,
}) {
    const isBoard = Boolean(pendingLifeline?.is_board);
    const attemptEarned = pendingLifeline?.attempt_earned ?? 0;
    const ptsAtStake = pendingLifeline?.points_at_stake ?? 1;

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.14 }}
                    className="fixed inset-0 z-[75] bg-stone-950/50 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-0 sm:p-4"
                >
                    <motion.div
                        initial={{ opacity: 0, y: 40 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 28 }}
                        transition={{ duration: 0.18, ease: 'easeOut' }}
                        className="w-full sm:max-w-sm bg-white border-t sm:border border-stone-200 rounded-t-3xl sm:rounded-2xl shadow-xl overflow-hidden pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:pb-0"
                    >
                        <div className="sm:hidden pt-2.5 flex justify-center">
                            <div className="w-10 h-1 rounded-full bg-stone-300" />
                        </div>

                        <div className="p-5 sm:p-6 text-center space-y-4">
                            {/* Remaining Hearts Visual */}
                            <div className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-2xl bg-rose-50 border border-rose-200/80">
                                {Array.from({ length: maxHearts }).map((_, idx) => {
                                    const filled = idx < heartsRemaining;
                                    return (
                                        <Heart
                                            key={idx}
                                            className={`w-5 h-5 transition-transform ${
                                                filled ? 'text-rose-600 fill-rose-600' : 'text-stone-300'
                                            }`}
                                        />
                                    );
                                })}
                                <span className="ml-1 text-xs font-bold text-rose-700 tabular-nums">
                                    {heartsRemaining}/{maxHearts}
                                </span>
                            </div>

                            <div className="space-y-1.5">
                                <h3 className="text-lg font-extrabold text-stone-900">
                                    {isBoard ? 'May Kulang pa sa Sagot' : 'Maling Sagot'}
                                </h3>
                                <p className="text-[13px] text-stone-600 leading-relaxed">
                                    {isBoard ? (
                                        hideScores ? (
                                            <>
                                                May <strong className="text-rose-600">{heartsRemaining} puso</strong> ka pang natitira — gagamit ka ba ng{' '}
                                                <strong className="text-stone-900">1 puso</strong> upang ayusin muli ang iyong sagot?
                                            </>
                                        ) : (
                                            <>
                                                Nakuha mo na ang <strong className="text-stone-900">{attemptEarned}/10 pts</strong>. May{' '}
                                                <strong className="text-rose-600">{heartsRemaining} puso</strong> ka pang natitira — gagamit ka ba ng{' '}
                                                <strong className="text-stone-900">1 puso</strong> upang ayusin muli?
                                            </>
                                        )
                                    ) : hideScores ? (
                                        <>
                                            May <strong className="text-rose-600">{heartsRemaining} puso</strong> ka pang natitira. Gagamit ka ba ng{' '}
                                            <strong className="text-stone-900">1 puso</strong> upang sumagot muli?
                                        </>
                                    ) : (
                                        <>
                                            May <strong className="text-rose-600">{heartsRemaining} puso</strong> ka pang natitira. Gagamit ka ba ng{' '}
                                            <strong className="text-stone-900">1 puso</strong> upang sumagot muli at mailigtas ang{' '}
                                            <strong className="text-[#15803D]">+{ptsAtStake} pts</strong>?
                                        </>
                                    )}
                                </p>
                            </div>

                            <div className="space-y-2.5 pt-1">
                                <button
                                    type="button"
                                    disabled={busy}
                                    onClick={onUseHeart}
                                    className="w-full min-h-[48px] px-4 py-2.5 rounded-xl bg-[#C2410C] hover:bg-[#9A3412] disabled:opacity-60 text-white font-bold text-sm inline-flex items-center justify-center gap-2 transition cursor-pointer"
                                >
                                    <RotateCcw className="w-4 h-4" />
                                    <span>
                                        {busy ? 'Sandali...' : 'Gumamit ng 1 Puso (Sumagot Muli)'}
                                    </span>
                                </button>

                                <button
                                    type="button"
                                    disabled={busy}
                                    onClick={onSkip}
                                    className="w-full min-h-[46px] px-4 py-2.5 rounded-xl bg-stone-50 hover:bg-stone-100 border border-stone-200 disabled:opacity-60 text-stone-700 font-semibold text-xs sm:text-sm inline-flex items-center justify-center gap-1.5 transition cursor-pointer"
                                >
                                    <span>
                                        {isBoard
                                            ? hideScores
                                                ? 'Huwag Gumamit (Itala ang Sagot)'
                                                : `Huwag Gumamit (Itala ang ${attemptEarned}/10)`
                                            : hideScores
                                              ? 'Huwag Gumamit (Tumuloy)'
                                              : 'Huwag Gumamit (0 pts, Tumuloy)'}
                                    </span>
                                    <ArrowRight className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
