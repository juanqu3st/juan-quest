import { useEffect, useState } from 'react';
import { Award, Download, Heart, RefreshCw, User, Users } from 'lucide-react';
import { teacherApi } from '../../api/teacherApi';
import { useToast } from '../../context/ToastContext';
import TeacherLayout from './TeacherLayout';

const STATUS_BADGE = {
    idle: { label: 'Naka-idle', cls: 'bg-slate-100 text-slate-600 border border-slate-200/80' },
    exploring_world: { label: 'Nasa 3D Mapa', cls: 'bg-sky-50 text-sky-700 border border-sky-200/80' },
    viewing_scene_guide: { label: 'Nasa Story Video', cls: 'bg-orange-50 text-[#C2410C] border border-orange-200/80' },
    in_game: { label: 'Naglalaro', cls: 'bg-amber-50 text-amber-800 border border-amber-200/80' },
    completed: { label: 'Tapos na', cls: 'bg-emerald-50 text-[#15803D] border border-emerald-200/80' },
};

export default function TeacherMonitorPage() {
    const { showToast } = useToast();
    const [sessions, setSessions] = useState([]);
    const [selectedId, setSelectedId] = useState(null);
    const [monitor, setMonitor] = useState(null);
    const [polling, setPolling] = useState(true);

    useEffect(() => {
        teacherApi.listSessions().then((res) => {
            setSessions(res.sessions || []);
            if (res.sessions?.length > 0) {
                setSelectedId(res.sessions[0].id);
            }
        });
    }, []);

    const fetchMonitor = async (id) => {
        if (!id) return;
        try {
            const res = await teacherApi.getMonitor(id);
            setMonitor(res.monitor);
        } catch {
            // Keep prior view on transient poll errors
        }
    };

    useEffect(() => {
        if (!selectedId) return;
        fetchMonitor(selectedId);
        if (!polling) return;
        const timer = setInterval(() => fetchMonitor(selectedId), 5000);
        return () => clearInterval(timer);
    }, [selectedId, polling]);

    const handleExport = async () => {
        if (!selectedId) return;
        try {
            const blob = await teacherApi.exportCsv(selectedId);
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `juanquest-${monitor?.session?.join_code || 'rankings'}.csv`;
            a.click();
            window.URL.revokeObjectURL(url);
            showToast('success', 'Na-download na ang CSV rankings ng sesyon.', 'Exported.');
        } catch {
            showToast('error', 'Hindi ma-export ang CSV. Pakisubukan muli.', 'May Error.');
        }
    };

    const isGroupMode = (monitor?.session?.play_mode ?? 'group') === 'group';
    const rows = isGroupMode ? (monitor?.per_group || []) : (monitor?.individual || []);
    const totalEntries = rows.length;
    const completedCount = rows.filter((r) => r.activity_status === 'completed').length;
    const avgScore =
        totalEntries > 0
            ? (rows.reduce((sum, r) => sum + Number(r.total_score || 0), 0) / totalEntries).toFixed(1)
            : '0.0';

    return (
        <TeacherLayout
            title="Live Monitor & Rankings"
            subtitle="Subaybayan nang live ang kasalukuyang mapa, puso, at puntos (/50) ng bawat pangkat o mag-aaral."
            toolbarRight={
                <div className="w-full sm:w-auto flex items-center gap-2">
                    <select
                        value={selectedId || ''}
                        onChange={(e) => setSelectedId(Number(e.target.value))}
                        className="flex-1 sm:flex-initial min-w-0 h-10 sm:h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800 focus:outline-none focus:border-slate-400"
                    >
                        {sessions.map((s) => (
                            <option key={s.id} value={s.id}>
                                {s.class_name} ({s.join_code}) · {s.play_mode === 'individual' ? 'Solo' : 'Grupo'}
                            </option>
                        ))}
                    </select>

                    <button
                        type="button"
                        onClick={handleExport}
                        className="h-10 sm:h-9 inline-flex items-center gap-1.5 px-3.5 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 transition cursor-pointer shrink-0"
                    >
                        <Download className="w-3.5 h-3.5" />
                        <span>Export CSV</span>
                    </button>
                </div>
            }
        >
            {!monitor ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
                    Walang aktibong sesyon.
                </div>
            ) : (
                <div className="space-y-5">
                    {/* Clean Mode-Aware Summary Bar */}
                    <div className="rounded-2xl border border-slate-200/90 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] p-4 flex flex-wrap items-center justify-between gap-4">
                        <div className="flex flex-wrap items-center gap-5">
                            <span
                                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border ${
                                    isGroupMode
                                        ? 'bg-orange-50 text-[#C2410C] border-orange-200/80'
                                        : 'bg-slate-100 text-slate-700 border-slate-200/80'
                                }`}
                            >
                                {isGroupMode ? (
                                    <>
                                        <Users className="w-3.5 h-3.5" />
                                        <span>Per Grupo (1 Device)</span>
                                    </>
                                ) : (
                                    <>
                                        <User className="w-3.5 h-3.5" />
                                        <span>Indibidwal (Solo)</span>
                                    </>
                                )}
                            </span>

                            <div>
                                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                    {isGroupMode ? 'Mga Pangkat' : 'Mga Mag-aaral'}
                                </p>
                                <p className="text-lg font-extrabold text-slate-900 tabular-nums leading-tight">
                                    {totalEntries}
                                </p>
                            </div>
                            <div className="h-7 w-px bg-slate-200" />
                            <div>
                                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                    Tapos na
                                </p>
                                <p className="text-lg font-extrabold text-[#15803D] tabular-nums leading-tight">
                                    {completedCount}
                                    <span className="text-xs font-medium text-slate-400">/{totalEntries}</span>
                                </p>
                            </div>
                            <div className="h-7 w-px bg-slate-200 hidden sm:block" />
                            <div className="hidden sm:block">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                    Avg Score
                                </p>
                                <p className="text-lg font-extrabold text-[#C2410C] tabular-nums leading-tight">
                                    {avgScore}
                                    <span className="text-xs font-medium text-slate-400">
                                        /{monitor.max_total_score || 50}
                                    </span>
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <span className="text-[11px] text-slate-400 tabular-nums hidden md:inline">
                                Updated {monitor.updated_at}
                            </span>

                            <button
                                type="button"
                                onClick={() => setPolling(!polling)}
                                className={`h-8 px-2.5 rounded-lg border text-xs font-semibold inline-flex items-center gap-1.5 transition cursor-pointer ${
                                    polling
                                        ? 'bg-emerald-50 border-emerald-200 text-[#15803D]'
                                        : 'bg-white border-slate-200 text-slate-600'
                                }`}
                            >
                                <span
                                    className={`w-1.5 h-1.5 rounded-full ${
                                        polling ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
                                    }`}
                                />
                                <span>{polling ? 'Live 5s' : 'Paused'}</span>
                            </button>

                            <button
                                type="button"
                                onClick={async () => {
                                    await fetchMonitor(selectedId);
                                    showToast('info', 'Na-refresh ang Live Monitor data.', 'Updated.');
                                }}
                                className="h-8 w-8 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 inline-flex items-center justify-center cursor-pointer"
                                title="I-refresh"
                            >
                                <RefreshCw className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    </div>

                    {rows.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
                            {isGroupMode
                                ? 'Wala pang nakapasok na pangkat sa sesyong ito.'
                                : 'Wala pang nakapasok na mag-aaral sa sesyong ito.'}
                        </div>
                    ) : (
                        <>
                            {/* Mobile Ranked Cards (< md) — Zero Horizontal Scroll! */}
                            <div className="md:hidden space-y-3">
                                {rows.map((row) => {
                                    const st = STATUS_BADGE[row.activity_status] || STATUS_BADGE.idle;
                                    const isTop1 = row.rank === 1 && row.total_score > 0;
                                    const rowKey = isGroupMode
                                        ? `m-g-${row.group_id || 'x'}-${row.leader_user_id}`
                                        : `m-u-${row.user_id}`;

                                    return (
                                        <div
                                            key={rowKey}
                                            className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.03)] space-y-3"
                                        >
                                            <div className="flex items-start justify-between gap-2.5">
                                                <div className="flex items-start gap-2.5 min-w-0">
                                                    <span
                                                        className={`w-8 h-8 rounded-xl text-xs font-bold flex items-center justify-center shrink-0 tabular-nums ${
                                                            isTop1
                                                                ? 'bg-[#C2410C] text-white'
                                                                : 'bg-slate-100 text-slate-700'
                                                        }`}
                                                    >
                                                        #{row.rank}
                                                    </span>
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-1.5 flex-wrap">
                                                            <p className="text-sm font-bold text-slate-900 truncate">
                                                                {isGroupMode ? row.group_name : row.name}
                                                            </p>
                                                            {isTop1 && (
                                                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-[#15803D] text-[10px] font-bold">
                                                                    <Award className="w-3 h-3" />
                                                                    Top 1
                                                                </span>
                                                            )}
                                                        </div>
                                                        {isGroupMode && (
                                                            <>
                                                                <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                                                                    Kinatawan: {row.leader_name}
                                                                </p>
                                                                {row.member_names && (
                                                                    <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-2">
                                                                        {row.member_names}
                                                                    </p>
                                                                )}
                                                            </>
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="text-right shrink-0">
                                                    <p className="text-base font-extrabold text-slate-900 tabular-nums leading-tight">
                                                        {row.total_score}
                                                        <span className="text-xs font-normal text-slate-400">
                                                            /{monitor.max_total_score || 50}
                                                        </span>
                                                    </p>
                                                    <span
                                                        className={`inline-block mt-1 px-2 py-0.5 rounded-md text-[10px] font-semibold ${st.cls}`}
                                                    >
                                                        {st.label}
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="flex items-center justify-between text-[11px] text-slate-500 tabular-nums">
                                                <span>Mapa {row.current_map_number}</span>
                                                <div className="flex items-center gap-3">
                                                    <span className="inline-flex items-center gap-1 text-rose-600 font-bold">
                                                        <Heart className="w-3.5 h-3.5 fill-rose-600" />
                                                        {row.hearts_remaining}/{row.max_total_hearts || monitor.max_total_hearts || 15}
                                                    </span>
                                                    <span className="font-mono">{row.total_time_seconds}s</span>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-5 gap-1.5 pt-2.5 border-t border-slate-100 text-center">
                                                {[1, 2, 3, 4, 5].map((m) => (
                                                    <div
                                                        key={m}
                                                        className="rounded-lg bg-slate-50 border border-slate-200/70 py-1.5"
                                                    >
                                                        <p className="text-[9px] font-bold text-slate-400">M{m}</p>
                                                        <p className="text-xs font-bold text-slate-800 tabular-nums mt-0.5">
                                                            {row.map_scores[m] ?? '-'}
                                                        </p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Tablet & Desktop Full Table (md+) */}
                            <div className="hidden md:block rounded-2xl border border-slate-200/90 overflow-x-auto bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
                            <table className="w-full text-left border-collapse text-xs">
                                <thead>
                                    <tr className="h-10 bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider text-[11px]">
                                        <th className="px-4 font-bold">Rank</th>
                                        <th className="px-4 font-bold">
                                            {isGroupMode ? 'Pangkat & Mga Miyembro' : 'Mag-aaral'}
                                        </th>
                                        <th className="px-4 font-bold">Mapa</th>
                                        <th className="px-4 font-bold">Status</th>
                                        <th className="px-2 font-bold text-center">M1</th>
                                        <th className="px-2 font-bold text-center">M2</th>
                                        <th className="px-2 font-bold text-center">M3</th>
                                        <th className="px-2 font-bold text-center">M4</th>
                                        <th className="px-2 font-bold text-center">M5</th>
                                        <th className="px-3 font-bold text-center">Hearts</th>
                                        <th className="px-3 font-bold text-right">Oras</th>
                                        <th className="px-4 font-bold text-right">Kabuuan</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 tabular-nums">
                                    {rows.map((row) => {
                                        const st = STATUS_BADGE[row.activity_status] || STATUS_BADGE.idle;
                                        const isTop1 = row.rank === 1 && row.total_score > 0;
                                        const rowKey = isGroupMode
                                            ? `g-${row.group_id || 'x'}-${row.leader_user_id}`
                                            : `u-${row.user_id}`;

                                        return (
                                            <tr key={rowKey} className="hover:bg-slate-50/70 transition">
                                                <td className="px-4 py-3 font-bold text-slate-900">
                                                    <span
                                                        className={`inline-flex items-center justify-center w-7 h-7 rounded-lg text-xs font-bold ${
                                                            isTop1
                                                                ? 'bg-[#C2410C] text-white'
                                                                : 'bg-slate-100 text-slate-700'
                                                        }`}
                                                    >
                                                        #{row.rank}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    {isGroupMode ? (
                                                        <div>
                                                            <div className="flex items-center gap-2">
                                                                <span className="font-bold text-slate-900 text-[13px]">
                                                                    {row.group_name}
                                                                </span>
                                                                {isTop1 && (
                                                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-[#15803D] text-[10px] font-bold">
                                                                        <Award className="w-3 h-3" />
                                                                        Top 1
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <p className="text-[11px] text-slate-500 mt-0.5">
                                                                Kinatawan: <span className="font-medium text-slate-700">{row.leader_name}</span>
                                                            </p>
                                                            {row.member_names && (
                                                                <p className="text-[11px] text-slate-400 mt-0.5 max-w-md truncate" title={row.member_names}>
                                                                    Miyembro: {row.member_names}
                                                                </p>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-semibold text-slate-900">
                                                                {row.name}
                                                            </span>
                                                            {isTop1 && (
                                                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-[#15803D] text-[10px] font-bold">
                                                                    <Award className="w-3 h-3" />
                                                                    Top 1
                                                                </span>
                                                            )}
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 text-slate-700 whitespace-nowrap">
                                                    Mapa {row.current_map_number}
                                                </td>
                                                <td className="px-4 py-3 whitespace-nowrap">
                                                    <span className={`px-2 py-0.5 rounded-md text-[11px] font-semibold ${st.cls}`}>
                                                        {st.label}
                                                    </span>
                                                </td>
                                                {[1, 2, 3, 4, 5].map((m) => (
                                                    <td
                                                        key={m}
                                                        className="px-2 py-3 text-center font-mono font-semibold text-slate-700"
                                                    >
                                                        {row.map_scores[m] ?? '-'}
                                                    </td>
                                                ))}
                                                <td className="px-3 py-3 text-center">
                                                    <span className="inline-flex items-center gap-1 text-rose-600 font-bold">
                                                        <Heart className="w-3.5 h-3.5 fill-rose-600" />
                                                        {row.hearts_remaining}/{row.max_total_hearts || monitor.max_total_hearts || 15}
                                                    </span>
                                                </td>
                                                <td className="px-3 py-3 text-right font-mono text-slate-500">
                                                    {row.total_time_seconds}s
                                                </td>
                                                <td className="px-4 py-3 text-right font-extrabold text-slate-900 whitespace-nowrap">
                                                    {row.total_score}{' '}
                                                    <span className="font-normal text-slate-400">
                                                        / {monitor.max_total_score || 50}
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                        </>
                    )}
                </div>
            )}
        </TeacherLayout>
    );
}
