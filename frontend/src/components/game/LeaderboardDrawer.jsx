import { AnimatePresence, motion } from 'framer-motion';
import { Trophy, Users, X } from 'lucide-react';

function RankBadge({ rank, highlight = false }) {
    if (rank === 1) {
        return (
            <span className="min-w-[30px] h-6 px-1.5 rounded-md bg-amber-100 border border-amber-300/80 text-amber-800 text-[11px] font-extrabold inline-flex items-center justify-center tabular-nums shrink-0">
                #1
            </span>
        );
    }
    if (rank === 2) {
        return (
            <span className="min-w-[30px] h-6 px-1.5 rounded-md bg-stone-200/80 border border-stone-300/80 text-stone-700 text-[11px] font-extrabold inline-flex items-center justify-center tabular-nums shrink-0">
                #2
            </span>
        );
    }
    if (rank === 3) {
        return (
            <span className="min-w-[30px] h-6 px-1.5 rounded-md bg-orange-100 border border-orange-200 text-[#9A3412] text-[11px] font-extrabold inline-flex items-center justify-center tabular-nums shrink-0">
                #3
            </span>
        );
    }
    return (
        <span
            className={`min-w-[30px] text-center text-xs font-bold tabular-nums shrink-0 ${
                highlight ? 'text-[#C2410C]' : 'text-stone-400'
            }`}
        >
            #{rank}
        </span>
    );
}

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
    const groupRows = leaderboard?.groups || [];
    const individualRows = leaderboard?.individuals || [];
    const myEntry = isGroupMode
        ? groupRows.find((g) => g.user_id === currentUserId) || null
        : individualRows.find((ind) => ind.user_id === currentUserId) || null;
    const totalCount = isGroupMode ? groupRows.length : individualRows.length;

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[55] bg-stone-900/40 flex justify-end"
                    onClick={onClose}
                >
                    <motion.div
                        initial={{ x: '100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '100%' }}
                        transition={{ duration: 0.22, ease: 'easeOut' }}
                        onClick={(e) => e.stopPropagation()}
                        className={`w-full sm:max-w-sm bg-[#FAF8F5] sm:bg-white h-dvh sm:border-l border-stone-200 flex flex-col pt-safe ${
                            myEntry ? '' : 'pb-safe'
                        }`}
                    >
                        <div className="px-4 sm:px-5 h-14 bg-white border-b border-stone-200 flex items-center justify-between shrink-0">
                            <h3 className="text-sm sm:text-[15px] font-bold text-stone-900 flex items-center gap-2">
                                <Trophy className="w-4 h-4 text-[#C2410C]" />
                                {isGroupMode ? 'Ranking ng mga Pangkat' : 'Indibidwal na Ranking'}
                            </h3>
                            <button
                                type="button"
                                onClick={onClose}
                                aria-label="Isara"
                                className="w-10 h-10 rounded-xl text-stone-500 hover:text-stone-900 hover:bg-stone-100 active:scale-95 inline-flex items-center justify-center transition cursor-pointer"
                            >
                                <X className="w-5 h-5 sm:w-4 sm:h-4" />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3.5">
                            {isGroupMode ? (
                                <div className="space-y-2.5">
                                    <h4 className="text-xs font-semibold text-stone-500 flex items-center gap-1.5">
                                        <Users className="w-3.5 h-3.5" />
                                        <span>Live Team Standings (1 Device / Pangkat)</span>
                                    </h4>
                                    {groupRows.length === 0 ? (
                                        <p className="text-xs text-stone-400 py-8 text-center">
                                            Wala pang pangkat sa ranking.
                                        </p>
                                    ) : (
                                        <div className="divide-y divide-stone-200 border border-stone-200 rounded-xl overflow-hidden bg-white">
                                            {groupRows.map((g, idx) => {
                                                const isMyGroup = g.user_id === currentUserId;
                                                const rowKey = g.user_id
                                                    ? `u-${g.user_id}`
                                                    : `g-${g.group_id ?? 'none'}-${idx}`;
                                                return (
                                                    <div
                                                        key={rowKey}
                                                        className={`px-3.5 py-3 flex items-center justify-between gap-2.5 text-xs sm:text-[13px] ${
                                                            isMyGroup ? 'bg-orange-50/80' : 'bg-white'
                                                        }`}
                                                    >
                                                        <div className="flex items-center gap-2.5 min-w-0">
                                                            <RankBadge rank={g.rank} highlight={isMyGroup} />
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
                                <div className="space-y-2.5">
                                    <h4 className="text-xs font-semibold text-stone-500">
                                        Live Class Standings (Solo)
                                    </h4>
                                    {individualRows.length === 0 ? (
                                        <p className="text-xs text-stone-400 py-8 text-center">
                                            Wala pang mag-aaral sa ranking.
                                        </p>
                                    ) : (
                                        <div className="divide-y divide-stone-200 border border-stone-200 rounded-xl overflow-hidden bg-white">
                                            {individualRows.map((ind, idx) => {
                                                const isMe = ind.user_id === currentUserId;
                                                const rowKey = ind.user_id ? `u-${ind.user_id}` : `i-${idx}`;
                                                return (
                                                    <div
                                                        key={rowKey}
                                                        className={`px-3.5 py-3 text-xs sm:text-[13px] flex items-center justify-between gap-2.5 ${
                                                            isMe ? 'bg-orange-50/80' : 'bg-white'
                                                        }`}
                                                    >
                                                        <div className="flex items-center gap-2.5 min-w-0">
                                                            <RankBadge rank={ind.rank} highlight={isMe} />
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

                        {/* Pinned "Iyong Ranggo" Footer so students see their standing immediately in large classes */}
                        {myEntry && (
                            <div className="shrink-0 bg-white border-t border-stone-200 px-4 sm:px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                                <div className="px-3.5 py-2.5 rounded-xl bg-[#FFF8F3] border border-[#C2410C]/35 flex items-center justify-between gap-2.5">
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <RankBadge rank={myEntry.rank} highlight={true} />
                                        <div className="min-w-0">
                                            <p className="text-[10px] font-bold text-[#C2410C] leading-tight">
                                                {isGroupMode ? 'Ranggo ng Inyong Pangkat' : 'Iyong Ranggo'} · {myEntry.rank} sa {totalCount}
                                            </p>
                                            <p className="text-xs sm:text-[13px] font-bold text-stone-900 truncate">
                                                {isGroupMode ? myEntry.group_name : myEntry.name}
                                            </p>
                                        </div>
                                    </div>
                                    <span className="text-sm font-extrabold text-[#C2410C] tabular-nums shrink-0">
                                        {myEntry.total_score}
                                        <span className="text-xs font-medium text-stone-400">/{maxTotalScore}</span>
                                    </span>
                                </div>
                            </div>
                        )}
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
