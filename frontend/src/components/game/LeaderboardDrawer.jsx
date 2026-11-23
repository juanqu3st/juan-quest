import { AnimatePresence, motion } from 'framer-motion';
import { Trophy, Users, X } from 'lucide-react';

export default function LeaderboardDrawer({
    open,
    onClose,
    leaderboard,
    currentUserId,
    playMode,
    maxTotalScore = 50,
}) {
    const resolvedMode = playMode || leaderboard?.play_mode || 'individual';
    const isGroupMode = resolvedMode === 'group';

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-40 bg-stone-900/35 flex justify-end"
                    onClick={onClose}
                >
                    <motion.div
                        initial={{ x: 340 }}
                        animate={{ x: 0 }}
                        exit={{ x: 340 }}
                        transition={{ duration: 0.2, ease: 'easeOut' }}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full max-w-[92vw] sm:max-w-sm bg-white h-dvh border-l border-stone-200 flex flex-col pt-safe pb-safe"
                    >
                        <div className="px-4 sm:px-5 h-14 border-b border-stone-200 flex items-center justify-between shrink-0">
                            <h3 className="text-sm font-bold text-stone-900 flex items-center gap-2">
                                <Trophy className="w-4 h-4 text-[#C2410C]" />
                                {isGroupMode ? 'Ranking ng mga Pangkat' : 'Indibidwal na Ranking'}
                            </h3>
                            <button
                                type="button"
                                onClick={onClose}
                                aria-label="Isara"
                                className="w-10 h-10 rounded-xl text-stone-500 hover:text-stone-900 hover:bg-stone-100 inline-flex items-center justify-center transition cursor-pointer"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-5 space-y-4">
                            {isGroupMode ? (
                                <div className="space-y-2">
                                    <h4 className="text-xs font-semibold text-stone-500 flex items-center gap-1.5">
                                        <Users className="w-3.5 h-3.5" />
                                        <span>Live Team Standings (1 Device / Pangkat)</span>
                                    </h4>
                                    {(leaderboard?.groups || []).length === 0 ? (
                                        <p className="text-xs text-stone-400 py-6 text-center">
                                            Wala pang pangkat sa ranking.
                                        </p>
                                    ) : (
                                        <div className="divide-y divide-stone-200 border border-stone-200 rounded-xl overflow-hidden bg-white">
                                            {(leaderboard?.groups || []).map((g) => {
                                                const isMyGroup = g.user_id === currentUserId;
                                                return (
                                                    <div
                                                        key={g.group_id || g.user_id}
                                                        className={`px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs ${
                                                            isMyGroup ? 'bg-orange-50/70' : 'bg-white'
                                                        }`}
                                                    >
                                                        <div className="flex items-start gap-2.5 min-w-0">
                                                            <span className="font-bold text-[#C2410C] w-5 tabular-nums mt-0.5">
                                                                #{g.rank}
                                                            </span>
                                                            <div className="min-w-0">
                                                                <p className="font-bold text-stone-900 truncate">
                                                                    {g.group_name}
                                                                    {isMyGroup && (
                                                                        <span className="ml-1.5 text-[10px] font-bold text-[#C2410C]">
                                                                            (Kayo)
                                                                        </span>
                                                                    )}
                                                                </p>
                                                                {g.leader_name && (
                                                                    <p className="text-[11px] text-stone-500 truncate">
                                                                        {g.leader_name}
                                                                    </p>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <span className="font-bold text-stone-800 tabular-nums shrink-0">
                                                            {g.total_score}
                                                            <span className="font-normal text-stone-400">
                                                                /{maxTotalScore}
                                                            </span>
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    <h4 className="text-xs font-semibold text-stone-500">
                                        Live Class Standings (Solo)
                                    </h4>
                                    {(leaderboard?.individuals || []).length === 0 ? (
                                        <p className="text-xs text-stone-400 py-6 text-center">
                                            Wala pang mag-aaral sa ranking.
                                        </p>
                                    ) : (
                                        <div className="divide-y divide-stone-200 border border-stone-200 rounded-xl overflow-hidden bg-white">
                                            {(leaderboard?.individuals || []).map((ind) => {
                                                const isMe = ind.user_id === currentUserId;
                                                return (
                                                    <div
                                                        key={ind.user_id}
                                                        className={`px-3.5 py-2.5 text-xs flex items-center justify-between gap-2 ${
                                                            isMe ? 'bg-orange-50/70' : 'bg-white'
                                                        }`}
                                                    >
                                                        <div className="flex items-center gap-2.5 min-w-0">
                                                            <span className="font-semibold text-stone-400 w-5 tabular-nums">
                                                                #{ind.rank}
                                                            </span>
                                                            <span className="font-semibold text-stone-900 truncate">
                                                                {ind.name}
                                                                {isMe && (
                                                                    <span className="ml-1.5 text-[11px] font-semibold text-[#C2410C]">
                                                                        (Ikaw)
                                                                    </span>
                                                                )}
                                                            </span>
                                                        </div>
                                                        <span className="font-bold text-stone-800 shrink-0 tabular-nums">
                                                            {ind.total_score}
                                                            <span className="font-normal text-stone-400">
                                                                /{maxTotalScore}
                                                            </span>
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
