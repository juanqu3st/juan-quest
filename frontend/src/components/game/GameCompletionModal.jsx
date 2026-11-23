import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Award, Check, CheckCircle2, Clock, Copy, Download, Heart, ShieldCheck, Trophy } from 'lucide-react';
import { buildSignedResultQrPayload } from '../../utils/offlineEngine';
import { downloadResultQrImage } from '../../utils/qrExport';
import QrCodeImage from '../qr/QrCodeImage';

function getPerformanceLabel(score, maxScore) {
    const ratio = maxScore > 0 ? score / maxScore : 0;
    if (ratio >= 0.92) return { label: 'Napakahusay', tone: 'text-[#15803D] bg-emerald-50 border-emerald-200' };
    if (ratio >= 0.76) return { label: 'Mahusay', tone: 'text-[#15803D] bg-emerald-50 border-emerald-200' };
    if (ratio >= 0.6) return { label: 'Magaling', tone: 'text-[#C2410C] bg-orange-50 border-orange-200' };
    return { label: 'Natapos ang Paglalakbay', tone: 'text-stone-700 bg-stone-100 border-stone-200' };
}

function formatSeconds(sec) {
    const s = Number(sec || 0);
    if (s <= 0) return '—';
    const m = Math.floor(s / 60);
    const r = s % 60;
    return m > 0 ? `${m}m ${r}s` : `${r}s`;
}

/**
 * Final Game Completed overlay once all 5 maps are finished.
 * - Offline Mode: Hides scores completely; focuses 100% on the Result QR + Download PNG Backup.
 * - Online Mode: Shows full 5-Map Score Review + Rankings.
 */
export default function GameCompletionModal({
    open,
    user,
    world,
    onClose,
    onOpenRankings,
}) {
    const maps = world?.maps || [];
    const totalScore = world?.total_score ?? 0;
    const maxScore = world?.max_total_score ?? 50;
    const pct = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;
    const perf = getPerformanceLabel(totalScore, maxScore);

    const isGroupMode = world?.session?.play_mode === 'group';
    const myRanking = isGroupMode
        ? (world?.leaderboard?.groups || []).find((g) => g.user_id === user?.id)
        : (world?.leaderboard?.individuals || []).find((ind) => ind.user_id === user?.id);
    const totalHeartsLeft = maps.reduce(
        (acc, m) => acc + (m.progress?.hearts_remaining ?? 0),
        0
    );
    const maxTotalHearts = maps.reduce((acc, m) => acc + (m.max_hearts ?? 3), 0);
    const totalHeartsUsed = Math.max(0, maxTotalHearts - totalHeartsLeft);

    const isOfflineMode = Boolean(world?.offline_mode);
    const [resultQrPayload, setResultQrPayload] = useState(null);
    const [copiedCode, setCopiedCode] = useState(false);
    const [downloadedQr, setDownloadedQr] = useState(false);

    useEffect(() => {
        if (!open || !isOfflineMode) return undefined;
        let cancelled = false;
        buildSignedResultQrPayload().then((payload) => {
            if (!cancelled) setResultQrPayload(payload);
        });
        return () => {
            cancelled = true;
        };
    }, [open, isOfflineMode, totalScore, totalHeartsLeft]);

    const handleCopyResultCode = () => {
        if (!resultQrPayload) return;
        navigator.clipboard?.writeText(JSON.stringify(resultQrPayload)).catch(() => {});
        setCopiedCode(true);
        setTimeout(() => setCopiedCode(false), 1800);
    };

    const handleDownloadQrImage = async () => {
        if (!resultQrPayload) return;
        try {
            await downloadResultQrImage(resultQrPayload, {
                userName: user?.name || '',
                groupName: world?.session?.group_name || '',
                className: world?.session?.class_name || resultQrPayload.c,
            });
            setDownloadedQr(true);
            setTimeout(() => setDownloadedQr(false), 2600);
        } catch {
            // Fallback: copy code if canvas download is restricted
            handleCopyResultCode();
        }
    };

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[60] h-dvh bg-[#FAF8F5] flex flex-col overflow-y-auto pt-safe pb-safe"
                >
                    <div
                        className={`${
                            isOfflineMode ? 'max-w-md' : 'max-w-2xl'
                        } mx-auto w-full px-4 sm:px-6 py-6 sm:py-10 my-auto`}
                    >
                        {isOfflineMode ? (
                            /* OFFLINE MODE: 100% QR-Focused View (Zero Score Spoilers + Downloadable PNG Backup!) */
                            <div className="bg-white border border-stone-200 rounded-2xl p-6 sm:p-7 text-center space-y-5 shadow-xs">
                                <div className="space-y-2">
                                    <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-200 text-[#15803D] mx-auto flex items-center justify-center">
                                        <Trophy className="w-6 h-6" />
                                    </div>
                                    <p className="text-xs font-bold text-[#15803D]">
                                        Tapos na ang Lahat ng 5 Mapa
                                    </p>
                                    <h2 className="text-xl sm:text-2xl font-extrabold text-stone-900">
                                        Binabati kita, {user?.name}!
                                    </h2>
                                    <p className="text-xs text-stone-500">
                                        {world?.session?.group_name
                                            ? `${world.session.group_name} · `
                                            : ''}
                                        Klase:{' '}
                                        <span className="font-mono font-bold text-stone-700">
                                            {resultQrPayload?.c || world?.session?.join_code}
                                        </span>
                                    </p>
                                </div>

                                {resultQrPayload && (
                                    <div className="rounded-2xl border border-amber-200/90 bg-amber-50/40 p-4 sm:p-5 space-y-3.5">
                                        <div className="inline-block bg-white p-3 rounded-2xl border-2 border-stone-900 shadow-xs">
                                            <QrCodeImage
                                                value={resultQrPayload}
                                                size={240}
                                                errorCorrectionLevel="L"
                                                alt="JuanQuest Offline Result QR"
                                                className="w-[220px] h-[220px] sm:w-[240px] sm:h-[240px]"
                                            />
                                        </div>

                                        <div className="space-y-1.5">
                                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-[11px] font-bold text-[#15803D]">
                                                <ShieldCheck className="w-3.5 h-3.5" />
                                                {resultQrPayload.sig === 'manual'
                                                    ? 'Offline Result QR (Manual)'
                                                    : 'Verified Offline Result QR'}
                                            </span>
                                            <h3 className="text-sm sm:text-base font-extrabold text-stone-900">
                                                Ipakita ang QR Code sa iyong Guro
                                            </h3>
                                            <p className="text-xs text-stone-600 leading-relaxed">
                                                I-sscan ito ng iyong guro upang malaman ang inyong opisyal na puntos at
                                                ranking. I-download ang QR image bilang backup bago lumabas.
                                            </p>
                                        </div>
                                    </div>
                                )}

                                <div className="space-y-2.5 pt-1">
                                    <button
                                        type="button"
                                        onClick={handleDownloadQrImage}
                                        className="w-full min-h-[48px] px-5 py-2.5 rounded-xl bg-[#C2410C] hover:bg-[#9A3412] text-white text-sm font-bold inline-flex items-center justify-center gap-2 shadow-xs transition cursor-pointer"
                                    >
                                        {downloadedQr ? (
                                            <Check className="w-4 h-4" />
                                        ) : (
                                            <Download className="w-4 h-4" />
                                        )}
                                        <span>
                                            {downloadedQr ? 'Na-download na ang QR Image!' : 'I-download ang QR Image'}
                                        </span>
                                    </button>

                                    <div className="grid grid-cols-2 gap-2">
                                        <button
                                            type="button"
                                            onClick={handleCopyResultCode}
                                            className="min-h-[42px] px-3 py-2 rounded-xl bg-white border border-stone-200 hover:bg-stone-50 text-stone-700 text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition cursor-pointer"
                                        >
                                            {copiedCode ? (
                                                <Check className="w-3.5 h-3.5 text-[#15803D]" />
                                            ) : (
                                                <Copy className="w-3.5 h-3.5 text-stone-500" />
                                            )}
                                            <span>{copiedCode ? 'Nakopya' : 'Kopyahin Code'}</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={onClose}
                                            className="min-h-[42px] px-3 py-2 rounded-xl bg-[#1C1917] hover:bg-stone-800 text-white text-xs font-semibold transition cursor-pointer"
                                        >
                                            Bumalik sa Mapa
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            /* ONLINE MODE: Full 5-Map Score Review & Class Ranking */
                            <div className="bg-white border border-stone-200 rounded-2xl p-6 sm:p-8 space-y-6">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-200 pb-5">
                                    <div className="flex items-start gap-3.5">
                                        <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-200 text-[#15803D] flex items-center justify-center shrink-0">
                                            <Trophy className="w-6 h-6" />
                                        </div>
                                        <div>
                                            <p className="text-xs font-semibold text-[#15803D]">
                                                Kumpleto na ang Lahat ng Mapa
                                            </p>
                                            <h2 className="text-xl sm:text-2xl font-bold text-stone-900 mt-0.5">
                                                Binabati kita, {user?.name}!
                                            </h2>
                                            <p className="text-xs sm:text-sm text-stone-500 mt-0.5">
                                                Natapos mo ang buong paglalakbay sa JuanQuest: Si Juan Osong
                                                {world?.session?.group_name ? ` · ${world.session.group_name}` : ''}.
                                            </p>
                                        </div>
                                    </div>

                                    <span
                                        className={`self-start sm:self-center px-3 py-1 rounded-lg border text-xs font-semibold shrink-0 ${perf.tone}`}
                                    >
                                        {perf.label}
                                    </span>
                                </div>

                                <div className="grid grid-cols-3 gap-4 text-left">
                                    <div>
                                        <p className="text-xs text-stone-500 flex items-center gap-1">
                                            <Award className="w-3.5 h-3.5 text-[#C2410C]" />
                                            Kabuuang Puntos
                                        </p>
                                        <p className="text-2xl sm:text-3xl font-bold text-[#C2410C] tabular-nums mt-1">
                                            {totalScore}
                                            <span className="text-sm font-medium text-stone-400"> / {maxScore}</span>
                                        </p>
                                        <p className="text-[11px] text-stone-500 tabular-nums">{pct}% Marka</p>
                                    </div>

                                    <div>
                                        <p className="text-xs text-stone-500 flex items-center gap-1">
                                            <Heart className="w-3.5 h-3.5 text-rose-500" />
                                            Natirang Puso
                                        </p>
                                        <p className="text-2xl sm:text-3xl font-bold text-stone-900 tabular-nums mt-1">
                                            {totalHeartsLeft}
                                            <span className="text-sm font-medium text-stone-400"> / {maxTotalHearts}</span>
                                        </p>
                                        <p className="text-[11px] text-stone-500 tabular-nums">
                                            {totalHeartsUsed} nagamit · 5 mapa
                                        </p>
                                    </div>

                                    <div>
                                        <p className="text-xs text-stone-500 flex items-center gap-1">
                                            <Trophy className="w-3.5 h-3.5 text-amber-500" />
                                            Ranking
                                        </p>
                                        <p className="text-2xl sm:text-3xl font-bold text-stone-900 tabular-nums mt-1">
                                            {myRanking ? `#${myRanking.rank}` : '—'}
                                        </p>
                                        <p className="text-[11px] text-stone-500">Sa klase</p>
                                    </div>
                                </div>

                                <div className="space-y-2.5 pt-1">
                                    <h3 className="text-xs font-semibold text-stone-500">
                                        Buod ng Puntos sa Bawat Mapa (Score Review)
                                    </h3>
                                    <div className="border border-stone-200 rounded-xl divide-y divide-stone-200 overflow-hidden">
                                        {maps.map((m) => {
                                            const score = m.progress?.score ?? 0;
                                            const hearts = m.progress?.hearts_remaining ?? 0;
                                            const mapMaxHearts = m.max_hearts ?? 3;
                                            const heartsUsed = Math.max(0, mapMaxHearts - hearts);
                                            const taken = m.progress?.time_taken_seconds ?? 0;
                                            const isFullScore = score >= (m.perfect_score ?? 10);
                                            const isFlawless = isFullScore && heartsUsed === 0;
                                            const isSavedByHearts = isFullScore && heartsUsed > 0;
                                            const isTimeout = m.progress?.finish_reason === 'timeout';

                                            return (
                                                <div
                                                    key={m.id}
                                                    className="px-4 py-3 bg-white flex flex-wrap items-center justify-between gap-2 text-xs sm:text-sm"
                                                >
                                                    <div className="flex items-center gap-2.5 min-w-0">
                                                        <CheckCircle2
                                                            className={`w-4 h-4 shrink-0 ${
                                                                isFlawless
                                                                    ? 'text-[#15803D]'
                                                                    : isSavedByHearts
                                                                      ? 'text-amber-600'
                                                                      : 'text-stone-400'
                                                            }`}
                                                        />
                                                        <div className="min-w-0">
                                                            <p className="font-semibold text-stone-900 truncate">
                                                                Mapa {m.map_number}: {m.title}
                                                            </p>
                                                            <p className="text-[11px] text-stone-500 inline-flex items-center gap-2.5 mt-0.5 tabular-nums">
                                                                <span className="inline-flex items-center gap-1">
                                                                    <Heart className="w-3 h-3 text-rose-500 fill-rose-500" />
                                                                    {hearts}/{mapMaxHearts}
                                                                </span>
                                                                <span className="inline-flex items-center gap-1">
                                                                    <Clock className="w-3 h-3 text-stone-400" />
                                                                    {formatSeconds(taken)}
                                                                </span>
                                                            </p>
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center gap-2 shrink-0">
                                                        {isFlawless && (
                                                            <span className="px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-[11px] font-semibold text-[#15803D]">
                                                                Perpekto
                                                            </span>
                                                        )}
                                                        {isSavedByHearts && (
                                                            <span className="px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-[11px] font-semibold text-amber-800">
                                                                Gumamit ng {heartsUsed} puso
                                                            </span>
                                                        )}
                                                        {isTimeout && (
                                                            <span className="px-2 py-0.5 rounded-md bg-stone-100 border border-stone-200 text-[11px] font-semibold text-stone-600">
                                                                Naubos ang oras
                                                            </span>
                                                        )}
                                                        <span className="font-bold text-stone-900 tabular-nums">
                                                            {score}
                                                            <span className="font-normal text-stone-400">
                                                                /{m.perfect_score ?? 10}
                                                            </span>
                                                        </span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-end gap-2.5 pt-2">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            onClose?.();
                                            onOpenRankings?.();
                                        }}
                                        className="w-full sm:w-auto min-h-[46px] px-5 py-2 rounded-xl bg-white border border-stone-200 hover:border-stone-300 hover:bg-stone-50 text-stone-800 text-sm font-semibold inline-flex items-center justify-center gap-2 transition cursor-pointer"
                                    >
                                        <Trophy className="w-4 h-4 text-[#C2410C]" />
                                        <span>Tingnan ang Rankings</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={onClose}
                                        className="w-full sm:w-auto min-h-[46px] px-6 py-2 rounded-xl bg-[#1C1917] hover:bg-stone-800 text-white text-sm font-semibold transition cursor-pointer"
                                    >
                                        Bumalik sa 3D Mapa
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
