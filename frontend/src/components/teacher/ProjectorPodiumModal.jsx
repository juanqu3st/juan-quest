import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { Award, Clock, Heart, Medal, QrCode, Trophy, Users, User, X } from 'lucide-react';

function formatTime(sec) {
    const s = Number(sec || 0);
    if (s <= 0) return '—';
    const m = Math.floor(s / 60);
    const r = s % 60;
    return m > 0 ? `${m}m ${r}s` : `${r}s`;
}

const PODIUM_STYLES = {
    1: {
        label: 'Top 1 · Kampeon',
        badgeCls: 'bg-amber-100 text-amber-900 border-amber-300',
        cardBorder: 'border-amber-300 shadow-lg ring-2 ring-amber-200/70',
        pedestalBg: 'bg-gradient-to-b from-[#C2410C] to-[#9A3412] text-white',
        pedestalHeight: 'h-24 sm:h-36',
        iconBg: 'bg-amber-50 border-amber-200 text-amber-600',
        delay: 0.34,
        orderCls: 'order-1 sm:order-2',
    },
    2: {
        label: 'Top 2',
        badgeCls: 'bg-slate-100 text-slate-700 border-slate-300',
        cardBorder: 'border-slate-200 shadow-sm',
        pedestalBg: 'bg-gradient-to-b from-slate-700 to-slate-800 text-white',
        pedestalHeight: 'h-16 sm:h-24',
        iconBg: 'bg-slate-100 border-slate-200 text-slate-600',
        delay: 0.18,
        orderCls: 'order-2 sm:order-1',
    },
    3: {
        label: 'Top 3',
        badgeCls: 'bg-orange-50 text-orange-900 border-orange-200',
        cardBorder: 'border-orange-200/90 shadow-sm',
        pedestalBg: 'bg-gradient-to-b from-amber-700 to-amber-800 text-white',
        pedestalHeight: 'h-12 sm:h-16',
        iconBg: 'bg-orange-50 border-orange-200 text-orange-700',
        delay: 0.05,
        orderCls: 'order-3 sm:order-3',
    },
};

export default function ProjectorPodiumModal({
    open,
    onClose,
    session,
    rows = [],
    isGroupMode = true,
    maxTotalScore = 50,
    maxTotalHearts = 15,
}) {
    useEffect(() => {
        if (!open) return undefined;
        const onKeyDown = (e) => {
            if (e.key === 'Escape') onClose?.();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [open, onClose]);

    if (!open) return null;

    const topThree = rows.slice(0, 3);
    const others = rows.slice(3);

    return (
        <div className="fixed inset-0 z-[80] bg-[#FAF8F5] overflow-y-auto flex flex-col pt-safe pb-safe">
            {/* Warm subtle top glow for projector contrast */}
            <div
                aria-hidden="true"
                className="pointer-events-none fixed -top-24 left-1/2 -translate-x-1/2 w-[720px] h-[300px] rounded-full opacity-45 blur-3xl"
                style={{
                    background:
                        'radial-gradient(circle, rgba(251, 191, 36, 0.35) 0%, rgba(194, 65, 12, 0.14) 55%, rgba(250, 248, 245, 0) 100%)',
                }}
            />

            {/* Header Bar */}
            <header className="relative z-10 shrink-0 px-4 sm:px-8 py-4 border-b border-stone-200/80 bg-white/85 backdrop-blur-md">
                <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                        <img src="/logo.svg" alt="JuanQuest" className="w-10 h-10 shrink-0 select-none" />
                        <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                                <h2 className="text-base sm:text-xl font-extrabold text-stone-900 tracking-tight truncate">
                                    Opisyal na Ranking · {session?.class_name || 'JuanQuest'}
                                </h2>
                                <span className="px-2 py-0.5 rounded-md bg-orange-50 border border-orange-200 text-[#C2410C] text-[11px] font-mono font-bold">
                                    {session?.join_code}
                                </span>
                            </div>
                            <p className="text-xs text-stone-500 inline-flex items-center gap-1.5 mt-0.5">
                                {isGroupMode ? <Users className="w-3.5 h-3.5" /> : <User className="w-3.5 h-3.5" />}
                                <span>
                                    {isGroupMode ? 'Per Grupo (1 Device)' : 'Indibidwal (Solo)'} · {rows.length}{' '}
                                    {isGroupMode ? 'pangkat' : 'manlalaro'}
                                </span>
                            </p>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        className="h-10 px-3.5 rounded-xl border border-stone-200 bg-white hover:bg-stone-50 text-stone-700 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition shrink-0"
                    >
                        <X className="w-4 h-4" />
                        <span>Isara</span>
                    </button>
                </div>
            </header>

            {/* Main Podium Stage */}
            <main className="relative z-10 flex-1 px-4 sm:px-8 py-6 sm:py-10 flex flex-col justify-center">
                <div className="max-w-5xl mx-auto w-full space-y-8">
                    {/* Top 3 Podium Columns */}
                    <div className="grid sm:grid-cols-3 gap-4 sm:gap-5 items-end">
                        {[1, 2, 3].map((place) => {
                            const row = topThree[place - 1];
                            if (!row) return null;
                            const st = PODIUM_STYLES[place];
                            const primaryName = isGroupMode ? row.group_name : row.name;
                            const IconComp = place === 1 ? Trophy : place === 2 ? Medal : Award;

                            return (
                                <motion.div
                                    key={`podium-${place}`}
                                    initial={{ opacity: 0, y: 24 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.38, delay: st.delay, ease: [0.22, 1, 0.36, 1] }}
                                    className={`flex flex-col ${st.orderCls}`}
                                >
                                    <div
                                        className={`rounded-t-2xl sm:rounded-2xl bg-white border p-5 text-center space-y-3 ${st.cardBorder}`}
                                    >
                                        <div className="flex flex-col items-center gap-2">
                                            <div
                                                className={`w-12 h-12 sm:w-14 sm:h-14 rounded-2xl border flex items-center justify-center ${st.iconBg}`}
                                            >
                                                <IconComp className="w-6 h-6 sm:w-7 sm:h-7" />
                                            </div>
                                            <span
                                                className={`px-2.5 py-0.5 rounded-full border text-[11px] font-extrabold ${st.badgeCls}`}
                                            >
                                                {st.label}
                                            </span>
                                        </div>

                                        <div className="space-y-1">
                                            <h3 className="text-lg sm:text-xl font-extrabold text-stone-900 leading-tight break-words">
                                                {primaryName}
                                            </h3>
                                            {isGroupMode && row.leader_name && (
                                                <p className="text-xs font-semibold text-stone-500">
                                                    Kinatawan: {row.leader_name}
                                                </p>
                                            )}
                                            {isGroupMode && row.member_names && (
                                                <p className="text-[11px] text-stone-400 line-clamp-2">
                                                    {row.member_names}
                                                </p>
                                            )}
                                            {row.source === 'offline_qr' && (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-[10px] font-bold">
                                                    <QrCode className="w-2.5 h-2.5" />
                                                    Offline QR
                                                </span>
                                            )}
                                        </div>

                                        <div className="pt-2 border-t border-stone-100">
                                            <p className="text-3xl sm:text-4xl font-extrabold text-[#C2410C] tabular-nums leading-none">
                                                {row.total_score}
                                                <span className="text-sm sm:text-base font-semibold text-stone-400">
                                                    /{maxTotalScore}
                                                </span>
                                            </p>
                                            <div className="mt-2 flex items-center justify-center gap-3 text-xs font-semibold text-stone-500 tabular-nums">
                                                <span className="inline-flex items-center gap-1 text-rose-600">
                                                    <Heart className="w-3.5 h-3.5 fill-rose-600" />
                                                    {row.hearts_remaining}/{row.max_total_hearts || maxTotalHearts}
                                                </span>
                                                <span className="inline-flex items-center gap-1">
                                                    <Clock className="w-3.5 h-3.5 text-stone-400" />
                                                    {formatTime(row.total_time_seconds)}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Visual Pedestal Base */}
                                    <div
                                        className={`hidden sm:flex mt-2 rounded-t-2xl items-center justify-center font-extrabold text-3xl tabular-nums shadow-sm ${st.pedestalBg} ${st.pedestalHeight}`}
                                    >
                                        #{place}
                                    </div>
                                </motion.div>
                            );
                        })}
                    </div>

                    {/* Remaining Ranks (#4+) */}
                    {others.length > 0 && (
                        <div className="space-y-2.5">
                            <p className="text-xs font-bold uppercase tracking-wider text-stone-400 text-center">
                                Iba Pang Kalahok
                            </p>
                            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                                {others.map((row) => (
                                    <div
                                        key={`other-${row.rank}-${row.leader_user_id || row.user_id}`}
                                        className="rounded-xl border border-stone-200 bg-white px-4 py-3 flex items-center justify-between gap-3"
                                    >
                                        <div className="flex items-center gap-3 min-w-0">
                                            <span className="w-8 h-8 rounded-lg bg-stone-100 text-stone-700 text-xs font-extrabold flex items-center justify-center shrink-0 tabular-nums">
                                                #{row.rank}
                                            </span>
                                            <div className="min-w-0">
                                                <p className="text-sm font-bold text-stone-900 truncate">
                                                    {isGroupMode ? row.group_name : row.name}
                                                </p>
                                                {isGroupMode && row.leader_name && (
                                                    <p className="text-[11px] text-stone-500 truncate">
                                                        {row.leader_name}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                        <div className="text-right shrink-0 tabular-nums">
                                            <p className="text-sm font-extrabold text-stone-900">
                                                {row.total_score}
                                                <span className="text-xs font-normal text-stone-400">
                                                    /{maxTotalScore}
                                                </span>
                                            </p>
                                            <p className="text-[10px] text-rose-600 font-semibold">
                                                {row.hearts_remaining}/{row.max_total_hearts || maxTotalHearts} puso
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}
