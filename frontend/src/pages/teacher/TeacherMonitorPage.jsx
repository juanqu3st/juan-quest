import { useEffect, useMemo, useRef, useState } from 'react';
import {
    Award,
    CheckCircle2,
    CloudUpload,
    Download,
    Heart,
    ImageUp,
    QrCode,
    RefreshCw,
    ShieldAlert,
    ShieldCheck,
    User,
    Users,
    WifiOff,
    X,
} from 'lucide-react';
import { teacherApi } from '../../api/teacherApi';
import { useToast } from '../../context/ToastContext';
import { usePwa } from '../../context/PwaContext';
import { verifyOfflineResultSignature } from '../../utils/offlineEngine';
import { decodeQrFromImageFile } from '../../utils/qrImageDecode';
import { playFeedbackAudio } from '../../utils/gameAudio';
import QrScannerBox from '../../components/qr/QrScannerBox';
import TeacherLayout from './TeacherLayout';

const STATUS_BADGE = {
    idle: { label: 'Naka-idle', cls: 'bg-slate-100 text-slate-600 border border-slate-200/80' },
    exploring_world: { label: 'Nasa 3D Mapa', cls: 'bg-sky-50 text-sky-700 border border-sky-200/80' },
    viewing_scene_guide: { label: 'Nasa Story Video', cls: 'bg-orange-50 text-[#C2410C] border border-orange-200/80' },
    in_game: { label: 'Naglalaro', cls: 'bg-amber-50 text-amber-800 border border-amber-200/80' },
    completed: { label: 'Tapos na', cls: 'bg-emerald-50 text-[#15803D] border border-emerald-200/80' },
};

const SESSIONS_CACHE_KEY = 'juanquest_teacher_sessions_cache_v1';
const monitorCacheKey = (id) => `juanquest_teacher_monitor_cache_${id}`;
const queueStorageKey = (id) => `juanquest_teacher_offline_queue_${id}`;

function readJsonStorage(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
    } catch {
        return fallback;
    }
}

function writeJsonStorage(key, val) {
    try {
        localStorage.setItem(key, JSON.stringify(val));
    } catch {
        // ignore quota errors
    }
}

function sortAndRankRows(rows) {
    const sorted = [...rows].sort((a, b) => {
        if ((b.total_score || 0) !== (a.total_score || 0)) {
            return (b.total_score || 0) - (a.total_score || 0);
        }
        if ((b.hearts_remaining || 0) !== (a.hearts_remaining || 0)) {
            return (b.hearts_remaining || 0) - (a.hearts_remaining || 0);
        }
        return (a.total_time_seconds || 0) - (b.total_time_seconds || 0);
    });
    return sorted.map((r, idx) => ({ ...r, rank: idx + 1 }));
}

function mergePendingIntoRows(baseRows, pendingQueue, isGroupMode, maxTotalHearts = 15) {
    if (!pendingQueue || pendingQueue.length === 0) return baseRows;

    const existingNames = new Set(
        baseRows.map((r) => String(isGroupMode ? r.leader_name : r.name || '').trim().toLowerCase())
    );
    const additions = [];

    pendingQueue.forEach((item, idx) => {
        const d = item.qr_payload || {};
        const leader = String(d.l || '').trim();
        const groupName = String(d.g || '').trim() || leader;
        if (existingNames.has(leader.toLowerCase())) return;
        existingNames.add(leader.toLowerCase());

        const scores = Array.isArray(d.s) ? d.s.map((v) => Number(v || 0)) : [0, 0, 0, 0, 0];
        const hearts = Array.isArray(d.h) ? d.h.map((v) => Number(v || 0)) : [0, 0, 0, 0, 0];
        const times = Array.isArray(d.tm) ? d.tm.map((v) => Number(v || 0)) : [0, 0, 0, 0, 0];
        const mapScores = {
            1: scores[0] ?? 0,
            2: scores[1] ?? 0,
            3: scores[2] ?? 0,
            4: scores[3] ?? 0,
            5: scores[4] ?? 0,
        };
        const totalScore = scores.reduce((a, b) => a + b, 0);
        const totalHearts = hearts.reduce((a, b) => a + b, 0);
        const totalTime = times.reduce((a, b) => a + b, 0);

        if (isGroupMode) {
            additions.push({
                group_id: `pending-${d.id || idx}`,
                leader_user_id: `pending-u-${d.id || idx}`,
                group_name: groupName,
                leader_name: leader,
                member_names: d.mb || null,
                current_map_number: 5,
                activity_status: 'completed',
                map_scores: mapScores,
                hearts_remaining: totalHearts,
                max_total_hearts: maxTotalHearts,
                total_time_seconds: totalTime,
                total_score: totalScore,
                source: 'offline_qr',
                pending_sync: true,
            });
        } else {
            additions.push({
                user_id: `pending-u-${d.id || idx}`,
                name: leader,
                current_map_number: 5,
                activity_status: 'completed',
                map_scores: mapScores,
                hearts_remaining: totalHearts,
                max_total_hearts: maxTotalHearts,
                total_time_seconds: totalTime,
                total_score: totalScore,
                source: 'offline_qr',
                pending_sync: true,
            });
        }
    });

    if (additions.length === 0) return baseRows;
    return sortAndRankRows([...baseRows, ...additions]);
}

function buildLocalCsv(rows, isGroupMode, maxTotalScore = 50, maxTotalHearts = 15) {
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const headers = isGroupMode
        ? ['Rank', 'Pangkat', 'Kinatawan', 'Mga Miyembro', 'Pinagmulan', 'M1', 'M2', 'M3', 'M4', 'M5', `Hearts (/${maxTotalHearts})`, 'Oras (s)', `Kabuuan (/${maxTotalScore})`]
        : ['Rank', 'Mag-aaral', 'Pinagmulan', 'M1', 'M2', 'M3', 'M4', 'M5', `Hearts (/${maxTotalHearts})`, 'Oras (s)', `Kabuuan (/${maxTotalScore})`];

    const lines = [headers.map(esc).join(',')];
    rows.forEach((r) => {
        const src = r.source === 'offline_qr' ? 'Offline QR' : 'Online';
        const cols = isGroupMode
            ? [
                  r.rank,
                  r.group_name,
                  r.leader_name,
                  r.member_names || '',
                  src,
                  r.map_scores?.[1] ?? '-',
                  r.map_scores?.[2] ?? '-',
                  r.map_scores?.[3] ?? '-',
                  r.map_scores?.[4] ?? '-',
                  r.map_scores?.[5] ?? '-',
                  r.hearts_remaining ?? 0,
                  r.total_time_seconds ?? 0,
                  r.total_score ?? 0,
              ]
            : [
                  r.rank,
                  r.name,
                  src,
                  r.map_scores?.[1] ?? '-',
                  r.map_scores?.[2] ?? '-',
                  r.map_scores?.[3] ?? '-',
                  r.map_scores?.[4] ?? '-',
                  r.map_scores?.[5] ?? '-',
                  r.hearts_remaining ?? 0,
                  r.total_time_seconds ?? 0,
                  r.total_score ?? 0,
              ];
        lines.push(cols.map(esc).join(','));
    });
    return lines.join('\r\n');
}

export default function TeacherMonitorPage() {
    const { showToast } = useToast();
    const { isOnline } = usePwa();
    const [sessions, setSessions] = useState(() => readJsonStorage(SESSIONS_CACHE_KEY, []));
    const [selectedId, setSelectedId] = useState(() => {
        const cached = readJsonStorage(SESSIONS_CACHE_KEY, []);
        return cached[0]?.id || null;
    });
    const [monitor, setMonitor] = useState(null);
    const [polling, setPolling] = useState(true);
    const [pendingQueue, setPendingQueue] = useState([]);
    const [syncingQueue, setSyncingQueue] = useState(false);

    // Result QR Scanner Modal state
    const [scannerOpen, setScannerOpen] = useState(false);
    const [scannerBusy, setScannerBusy] = useState(false);
    const [decodingImage, setDecodingImage] = useState(false);
    const [scannerError, setScannerError] = useState('');
    const [manualCodeInput, setManualCodeInput] = useState('');
    const [manualConfirmPayload, setManualConfirmPayload] = useState(null);
    const [recentScans, setRecentScans] = useState([]);
    const qrFileInputRef = useRef(null);

    useEffect(() => {
        teacherApi
            .listSessions()
            .then((res) => {
                const list = res.sessions || [];
                setSessions(list);
                writeJsonStorage(SESSIONS_CACHE_KEY, list);
                if (list.length > 0) {
                    setSelectedId((prev) => prev || list[0].id);
                }
            })
            .catch(() => {
                const cached = readJsonStorage(SESSIONS_CACHE_KEY, []);
                if (cached.length > 0) {
                    setSessions(cached);
                    setSelectedId((prev) => prev || cached[0].id);
                }
            });
    }, []);

    useEffect(() => {
        if (!selectedId) return;
        setPendingQueue(readJsonStorage(queueStorageKey(selectedId), []));
        const cachedMonitor = readJsonStorage(monitorCacheKey(selectedId), null);
        if (cachedMonitor) {
            setMonitor(cachedMonitor);
        }
    }, [selectedId]);

    const fetchMonitor = async (id) => {
        if (!id) return;
        try {
            const res = await teacherApi.getMonitor(id);
            setMonitor(res.monitor);
            writeJsonStorage(monitorCacheKey(id), res.monitor);
        } catch {
            // Keep cached view on offline / transient errors
            setMonitor((prev) => prev || readJsonStorage(monitorCacheKey(id), null));
        }
    };

    useEffect(() => {
        if (!selectedId) return;
        fetchMonitor(selectedId);
        if (!polling || !isOnline) return;
        const timer = setInterval(() => fetchMonitor(selectedId), 5000);
        return () => clearInterval(timer);
    }, [selectedId, polling, isOnline]);

    const savePendingQueue = (sessionId, nextQueue) => {
        setPendingQueue(nextQueue);
        writeJsonStorage(queueStorageKey(sessionId), nextQueue);
    };

    const handleSyncPendingQueue = async () => {
        if (!selectedId || pendingQueue.length === 0 || syncingQueue) return;
        if (!navigator.onLine) {
            showToast('warning', 'Wala pang internet upang mag-sync sa server.', 'Offline.');
            return;
        }
        setSyncingQueue(true);
        const remaining = [];
        let syncedCount = 0;

        for (const item of pendingQueue) {
            try {
                const res = await teacherApi.importOfflineResult(
                    selectedId,
                    item.qr_payload,
                    Boolean(item.allow_manual)
                );
                if (res.monitor) {
                    setMonitor(res.monitor);
                    writeJsonStorage(monitorCacheKey(selectedId), res.monitor);
                }
                syncedCount += 1;
            } catch (err) {
                // Drop permanent 422 errors only if clearly invalid; keep network errors
                if (!err?.response) {
                    remaining.push(item);
                }
            }
        }

        savePendingQueue(selectedId, remaining);
        setSyncingQueue(false);
        if (syncedCount > 0) {
            showToast('success', `Na-sync na ang ${syncedCount} offline result sa Live Monitor.`, 'Na-sync sa Cloud.');
        }
    };

    // Auto-sync queued offline scans when teacher reconnects online
    useEffect(() => {
        if (isOnline && selectedId && pendingQueue.length > 0 && !syncingQueue) {
            handleSyncPendingQueue();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOnline, selectedId]);

    const isGroupMode = (monitor?.session?.play_mode ?? 'group') === 'group';
    const maxTotalScore = monitor?.max_total_score || 50;
    const maxTotalHearts = monitor?.max_total_hearts || 15;

    const rows = useMemo(() => {
        const base = isGroupMode ? (monitor?.per_group || []) : (monitor?.individual || []);
        return mergePendingIntoRows(base, pendingQueue, isGroupMode, maxTotalHearts);
    }, [monitor, pendingQueue, isGroupMode, maxTotalHearts]);

    const totalEntries = rows.length;
    const completedCount = rows.filter((r) => r.activity_status === 'completed').length;
    const avgScore =
        totalEntries > 0
            ? (rows.reduce((sum, r) => sum + Number(r.total_score || 0), 0) / totalEntries).toFixed(1)
            : '0.0';

    const handleExport = async () => {
        if (!selectedId) return;
        const filename = `juanquest-${monitor?.session?.join_code || 'rankings'}.csv`;

        if (!navigator.onLine || pendingQueue.length > 0) {
            const csv = buildLocalCsv(rows, isGroupMode, maxTotalScore, maxTotalHearts);
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.click();
            window.URL.revokeObjectURL(url);
            showToast('success', 'Na-download na ang local CSV rankings (kasama ang mga offline QR).', 'Exported.');
            return;
        }

        try {
            const blob = await teacherApi.exportCsv(selectedId);
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.click();
            window.URL.revokeObjectURL(url);
            showToast('success', 'Na-download na ang CSV rankings ng sesyon.', 'Exported.');
        } catch {
            showToast('error', 'Hindi ma-export ang CSV. Pakisubukan muli.', 'May Error.');
        }
    };

    const recordRecentScan = (entryName, totalScore, maxScore, statusLabel, verified) => {
        setRecentScans((prev) => [
            {
                id: `${Date.now()}-${Math.random()}`,
                entryName,
                totalScore,
                maxScore,
                statusLabel,
                verified,
                at: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            },
            ...prev.slice(0, 7),
        ]);
    };

    const processQrPayload = async (payload, allowManual = false) => {
        if (!selectedId || !monitor?.session) return;
        setScannerError('');

        if (!payload || payload.t !== 'jqr1') {
            setScannerError('Hindi valid na JuanQuest Result QR ang na-scan.');
            return;
        }

        const expectedCode = String(monitor.session.join_code || '').trim().toUpperCase();
        const qrCode = String(payload.c || '').trim().toUpperCase();
        if (qrCode !== expectedCode) {
            setScannerError(`Para sa sesyon na "${qrCode}" ang QR na ito, hindi sa "${expectedCode}".`);
            return;
        }

        const isManualSig = String(payload.sig || '').toLowerCase() === 'manual';
        if (isManualSig && !allowManual) {
            setManualConfirmPayload(payload);
            return;
        }

        setScannerBusy(true);
        try {
            if (navigator.onLine) {
                try {
                    const res = await teacherApi.importOfflineResult(selectedId, payload, allowManual);
                    if (res.monitor) {
                        setMonitor(res.monitor);
                        writeJsonStorage(monitorCacheKey(selectedId), res.monitor);
                    }
                    const imp = res.imported || res.import;
                    playFeedbackAudio('correct');
                    recordRecentScan(
                        imp.entry_name,
                        imp.total_score,
                        imp.max_total_score,
                        imp.already_imported ? 'Na-scan na dati' : 'Naisama sa Cloud',
                        imp.verified_qr
                    );
                    showToast(
                        imp.already_imported ? 'info' : 'success',
                        imp.already_imported
                            ? `Naka-record na si ${imp.entry_name} (${imp.total_score}/${imp.max_total_score}).`
                            : `Natanggap: ${imp.entry_name} — ${imp.total_score}/${imp.max_total_score} puntos!`,
                        imp.already_imported ? 'Naitala na.' : 'Naidagdag sa Ranking!'
                    );
                    setManualConfirmPayload(null);
                    setManualCodeInput('');
                    return;
                } catch (err) {
                    if (err?.response) {
                        const msg =
                            err.response.data?.errors?.qr?.[0] ||
                            err.response.data?.message ||
                            'Hindi tinanggap ang Result QR.';
                        setScannerError(msg);
                        showToast('error', msg, 'Invalid QR.');
                        return;
                    }
                    // Network dropped mid-request -> fall through to offline local queue
                }
            }

            // Offline Teacher Mode: verify signature locally & queue for later sync
            const qrKey = monitor.session.offline_qr_key || '';
            if (!isManualSig) {
                const valid = await verifyOfflineResultSignature(payload, qrKey);
                if (!valid) {
                    setScannerError('Hindi tugma ang security signature ng Result QR (maaaring nabago).');
                    return;
                }
            }

            const scores = Array.isArray(payload.s) ? payload.s.map((v) => Number(v || 0)) : [];
            const hearts = Array.isArray(payload.h) ? payload.h.map((v) => Number(v || 0)) : [];
            if (
                scores.length !== 5 ||
                hearts.length !== 5 ||
                scores.some((s) => s < 0 || s > 10) ||
                hearts.some((h) => h < 0 || h > 3)
            ) {
                setScannerError('Hindi valid ang puntos o puso sa Result QR.');
                return;
            }

            const alreadyQueued = pendingQueue.some(
                (q) => q.qr_payload?.id && payload.id && q.qr_payload.id === payload.id
            );
            const entryName =
                isGroupMode && String(payload.g || '').trim() !== ''
                    ? String(payload.g).trim()
                    : String(payload.l || '').trim();
            const total = scores.reduce((a, b) => a + b, 0);

            if (!alreadyQueued) {
                const nextQueue = [
                    ...pendingQueue,
                    {
                        qr_payload: payload,
                        allow_manual: allowManual,
                        verified_qr: !isManualSig,
                        scanned_at: new Date().toISOString(),
                    },
                ];
                savePendingQueue(selectedId, nextQueue);
            }

            playFeedbackAudio('correct');
            recordRecentScan(
                entryName,
                total,
                maxTotalScore,
                alreadyQueued ? 'Nasa Offline Queue na' : 'Naisama Offline',
                !isManualSig
            );
            showToast(
                'success',
                `Naidagdag offline: ${entryName} (${total}/${maxTotalScore}). Isi-sync kapag may internet.`,
                'Naidagdag Offline.'
            );
            setManualConfirmPayload(null);
            setManualCodeInput('');
        } finally {
            setScannerBusy(false);
        }
    };

    const handleRawQrText = async (rawText) => {
        if (scannerBusy) return;
        try {
            const parsed = JSON.parse(String(rawText || '').trim());
            await processQrPayload(parsed, false);
        } catch {
            setScannerError('Hindi mabasa ang format ng Result QR. Tiyaking JuanQuest Result QR ito.');
        }
    };

    const handleQrImageFiles = async (fileList) => {
        const files = Array.from(fileList || []).filter((f) => f && f.type.startsWith('image/'));
        if (files.length === 0) return;

        setScannerError('');
        setDecodingImage(true);
        try {
            let failedCount = 0;
            for (const file of files) {
                try {
                    const decodedText = await decodeQrFromImageFile(file);
                    const parsed = JSON.parse(String(decodedText || '').trim());
                    await processQrPayload(parsed, false);
                } catch (err) {
                    failedCount += 1;
                    if (files.length === 1) {
                        setScannerError(
                            err?.message ||
                                'Walang mabasang JuanQuest Result QR sa larawan. Tiyaking malinaw ang QR code.'
                        );
                    }
                }
            }
            if (files.length > 1 && failedCount > 0) {
                setScannerError(
                    `${failedCount} sa ${files.length} larawan ang hindi nabasa. Tiyaking malinaw ang QR code.`
                );
            }
        } finally {
            setDecodingImage(false);
            if (qrFileInputRef.current) {
                qrFileInputRef.current.value = '';
            }
        }
    };

    // Allow desktop teachers to Ctrl+V paste a Messenger QR screenshot straight into the scanner modal!
    useEffect(() => {
        if (!scannerOpen) return undefined;
        const onPaste = (e) => {
            const items = Array.from(e.clipboardData?.items || []);
            const imgFiles = items
                .filter((it) => it.type.startsWith('image/'))
                .map((it) => it.getAsFile())
                .filter(Boolean);
            if (imgFiles.length > 0) {
                e.preventDefault();
                handleQrImageFiles(imgFiles);
            }
        };
        window.addEventListener('paste', onPaste);
        return () => window.removeEventListener('paste', onPaste);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [scannerOpen, selectedId, monitor, pendingQueue]);

    const handleManualPasteSubmit = (e) => {
        e.preventDefault();
        if (!manualCodeInput.trim()) return;
        handleRawQrText(manualCodeInput);
    };

    return (
        <TeacherLayout
            title="Live Monitor & Rankings"
            subtitle="Subaybayan nang live ang kasalukuyang mapa, puso, at puntos (/50) ng bawat pangkat o mag-aaral."
            toolbarRight={
                <div className="w-full sm:w-auto flex flex-wrap items-center gap-2">
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

                    {monitor && (
                        <button
                            type="button"
                            onClick={() => {
                                setScannerError('');
                                setManualConfirmPayload(null);
                                setScannerOpen(true);
                            }}
                            className="h-10 sm:h-9 inline-flex items-center gap-1.5 px-3.5 rounded-lg bg-[#C2410C] text-white text-xs font-semibold hover:bg-[#9A3412] transition cursor-pointer shrink-0"
                        >
                            <QrCode className="w-3.5 h-3.5" />
                            <span>I-scan Result QR</span>
                        </button>
                    )}

                    {pendingQueue.length > 0 && (
                        <button
                            type="button"
                            disabled={syncingQueue}
                            onClick={handleSyncPendingQueue}
                            className="h-10 sm:h-9 inline-flex items-center gap-1.5 px-3 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-60 transition cursor-pointer shrink-0"
                        >
                            <CloudUpload className="w-3.5 h-3.5" />
                            <span>{syncingQueue ? 'Sini-sync...' : `I-sync (${pendingQueue.length})`}</span>
                        </button>
                    )}

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
                    {!isOnline && (
                        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 flex items-center justify-between gap-3 text-xs text-amber-900">
                            <span className="inline-flex items-center gap-2 font-semibold">
                                <WifiOff className="w-4 h-4 text-amber-700 shrink-0" />
                                <span>
                                    Offline Monitor Mode: Maaari ka pa ring mag-scan ng Result QR ng mga mag-aaral at mag-export ng CSV. Isi-sync sa cloud kapag bumalik ang internet.
                                </span>
                            </span>
                        </div>
                    )}

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
                                        /{maxTotalScore}
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
                                    polling && isOnline
                                        ? 'bg-emerald-50 border-emerald-200 text-[#15803D]'
                                        : 'bg-white border-slate-200 text-slate-600'
                                }`}
                            >
                                <span
                                    className={`w-1.5 h-1.5 rounded-full ${
                                        polling && isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
                                    }`}
                                />
                                <span>{!isOnline ? 'Offline' : polling ? 'Live 5s' : 'Paused'}</span>
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
                        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center space-y-3">
                            <p className="text-sm text-slate-500">
                                {isGroupMode
                                    ? 'Wala pang nakapasok na pangkat sa sesyong ito.'
                                    : 'Wala pang nakapasok na mag-aaral sa sesyong ito.'}
                            </p>
                            <button
                                type="button"
                                onClick={() => {
                                    setScannerError('');
                                    setManualConfirmPayload(null);
                                    setScannerOpen(true);
                                }}
                                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-orange-50 border border-orange-200 text-[#C2410C] text-xs font-bold hover:bg-orange-100 cursor-pointer transition"
                            >
                                <QrCode className="w-3.5 h-3.5" />
                                <span>I-scan ang Offline Result QR</span>
                            </button>
                        </div>
                    ) : (
                        <>
                            {/* Mobile Ranked Cards (< md) — Zero Horizontal Scroll! */}
                            <div className="md:hidden space-y-3">
                                {rows.map((row) => {
                                    const st = STATUS_BADGE[row.activity_status] || STATUS_BADGE.idle;
                                    const isTop1 = row.rank === 1 && row.total_score > 0;
                                    const isOfflineQr = row.source === 'offline_qr';
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
                                                            {isOfflineQr && (
                                                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-800 text-[10px] font-bold">
                                                                    <QrCode className="w-2.5 h-2.5" />
                                                                    {row.pending_sync ? 'Offline (Pending)' : 'Offline QR'}
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
                                                            /{maxTotalScore}
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
                                                        {row.hearts_remaining}/{row.max_total_hearts || maxTotalHearts}
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
                                            const isOfflineQr = row.source === 'offline_qr';
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
                                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                                    <span className="font-bold text-slate-900 text-[13px]">
                                                                        {row.group_name}
                                                                    </span>
                                                                    {isTop1 && (
                                                                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-[#15803D] text-[10px] font-bold">
                                                                            <Award className="w-3 h-3" />
                                                                            Top 1
                                                                        </span>
                                                                    )}
                                                                    {isOfflineQr && (
                                                                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-800 text-[10px] font-bold">
                                                                            <QrCode className="w-2.5 h-2.5" />
                                                                            {row.pending_sync ? 'Offline (Pending)' : 'Offline QR'}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <p className="text-[11px] text-slate-500 mt-0.5">
                                                                    Kinatawan:{' '}
                                                                    <span className="font-medium text-slate-700">
                                                                        {row.leader_name}
                                                                    </span>
                                                                </p>
                                                                {row.member_names && (
                                                                    <p
                                                                        className="text-[11px] text-slate-400 mt-0.5 max-w-md truncate"
                                                                        title={row.member_names}
                                                                    >
                                                                        Miyembro: {row.member_names}
                                                                    </p>
                                                                )}
                                                            </div>
                                                        ) : (
                                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                                <span className="font-semibold text-slate-900">
                                                                    {row.name}
                                                                </span>
                                                                {isTop1 && (
                                                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-[#15803D] text-[10px] font-bold">
                                                                        <Award className="w-3 h-3" />
                                                                        Top 1
                                                                    </span>
                                                                )}
                                                                {isOfflineQr && (
                                                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-800 text-[10px] font-bold">
                                                                        <QrCode className="w-2.5 h-2.5" />
                                                                        {row.pending_sync ? 'Offline (Pending)' : 'Offline QR'}
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
                                                            {row.hearts_remaining}/{row.max_total_hearts || maxTotalHearts}
                                                        </span>
                                                    </td>
                                                    <td className="px-3 py-3 text-right font-mono text-slate-500">
                                                        {row.total_time_seconds}s
                                                    </td>
                                                    <td className="px-4 py-3 text-right font-extrabold text-slate-900 whitespace-nowrap">
                                                        {row.total_score}{' '}
                                                        <span className="font-normal text-slate-400">
                                                            / {maxTotalScore}
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

            {/* Teacher Result QR Scanner Modal */}
            {scannerOpen && monitor && (
                <div
                    className="fixed inset-0 z-50 bg-slate-900/55 backdrop-blur-xs flex items-center justify-center p-4"
                    onClick={() => setScannerOpen(false)}
                >
                    <div
                        className="w-full max-w-lg max-h-[92dvh] overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3 sticky top-0 bg-white z-10">
                            <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                    <QrCode className="w-4 h-4 text-[#C2410C] shrink-0" />
                                    <h3 className="text-sm font-extrabold text-slate-900 truncate">
                                        I-scan ang Offline Result QR
                                    </h3>
                                </div>
                                <p className="text-xs text-slate-500 truncate mt-0.5">
                                    Sesyon: <strong className="font-mono text-slate-800">{monitor.session.join_code}</strong> ·{' '}
                                    {monitor.session.class_name}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setScannerOpen(false)}
                                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer shrink-0"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="p-5 space-y-4">
                            {manualConfirmPayload ? (
                                <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 space-y-3">
                                    <div className="flex items-start gap-2.5">
                                        <ShieldAlert className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                                        <div className="space-y-1">
                                            <p className="text-xs font-extrabold text-amber-900">
                                                Manual Offline Result (Walang Join QR Signature)
                                            </p>
                                            <p className="text-xs text-amber-800 leading-relaxed">
                                                Manu-manong nag-type ng PIN ang device na ito sa halip na mag-scan ng Teacher Join QR.
                                                Tiyakin kung lehitimo ang kanilang resulta bago tanggapin:
                                            </p>
                                        </div>
                                    </div>

                                    <div className="rounded-xl bg-white border border-amber-200/80 p-3 text-xs space-y-1">
                                        <p className="font-bold text-slate-900">
                                            {isGroupMode && manualConfirmPayload.g
                                                ? `${manualConfirmPayload.g} (${manualConfirmPayload.l})`
                                                : manualConfirmPayload.l}
                                        </p>
                                        <p className="text-slate-600 tabular-nums">
                                            Kabuuang Puntos:{' '}
                                            <strong className="text-[#C2410C]">
                                                {(manualConfirmPayload.s || []).reduce((a, b) => a + Number(b || 0), 0)}/{maxTotalScore}
                                            </strong>{' '}
                                            · Puso:{' '}
                                            <strong>
                                                {(manualConfirmPayload.h || []).reduce((a, b) => a + Number(b || 0), 0)}/{maxTotalHearts}
                                            </strong>
                                        </p>
                                    </div>

                                    <div className="flex items-center justify-end gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setManualConfirmPayload(null)}
                                            className="h-9 px-3.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                                        >
                                            Kanselahin
                                        </button>
                                        <button
                                            type="button"
                                            disabled={scannerBusy}
                                            onClick={() => processQrPayload(manualConfirmPayload, true)}
                                            className="h-9 px-4 rounded-xl bg-[#15803D] hover:bg-[#166534] text-white text-xs font-semibold disabled:opacity-60 cursor-pointer"
                                        >
                                            {scannerBusy ? 'Tinatanggap...' : 'Tanggapin ang Manual Result'}
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    <QrScannerBox
                                        active={scannerOpen && !manualConfirmPayload}
                                        onScan={handleRawQrText}
                                        cooldownMs={1500}
                                    />

                                    {/* Accept QR Picture from Gallery / Messenger / Downloaded PNG (Supports multi-select + Ctrl+V!) */}
                                    <input
                                        ref={qrFileInputRef}
                                        type="file"
                                        accept="image/*"
                                        multiple
                                        className="hidden"
                                        onChange={(e) => handleQrImageFiles(e.target.files)}
                                    />
                                    <button
                                        type="button"
                                        disabled={decodingImage || scannerBusy}
                                        onClick={() => qrFileInputRef.current?.click()}
                                        className="w-full min-h-[44px] px-4 py-2.5 rounded-xl border border-orange-200 bg-orange-50/75 hover:bg-orange-100/80 text-[#C2410C] text-xs font-bold inline-flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer transition"
                                    >
                                        <ImageUp className="w-4 h-4 shrink-0" />
                                        <span>
                                            {decodingImage
                                                ? 'Binabasa ang QR mula sa larawan...'
                                                : 'Pumili ng Larawan ng QR (Gallery / Messenger)'}
                                        </span>
                                    </button>
                                </div>
                            )}

                            {scannerError && (
                                <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-700">
                                    {scannerError}
                                </div>
                            )}

                            {/* Manual Result Code Fallback */}
                            <form onSubmit={handleManualPasteSubmit} className="space-y-1.5 pt-1">
                                <label className="block text-[11px] font-semibold text-slate-500">
                                    Walang camera? I-paste ang nakopyang Result Code ng mag-aaral:
                                </label>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={manualCodeInput}
                                        onChange={(e) => setManualCodeInput(e.target.value)}
                                        placeholder='{"t":"jqr1","c":"..."}'
                                        className="flex-1 min-w-0 h-9 rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs font-mono text-slate-800 focus:bg-white focus:border-[#C2410C] outline-none"
                                    />
                                    <button
                                        type="submit"
                                        disabled={scannerBusy || !manualCodeInput.trim()}
                                        className="h-9 px-3.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold disabled:opacity-50 cursor-pointer shrink-0"
                                    >
                                        I-import
                                    </button>
                                </div>
                            </form>

                            {/* Recent Scanned Entries */}
                            {recentScans.length > 0 && (
                                <div className="pt-3 border-t border-slate-100 space-y-2">
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                        Mga Na-scan Ngayon ({recentScans.length})
                                    </p>
                                    <div className="space-y-1.5">
                                        {recentScans.map((scan) => (
                                            <div
                                                key={scan.id}
                                                className="rounded-xl border border-slate-200/80 bg-slate-50/70 px-3 py-2 flex items-center justify-between gap-2 text-xs"
                                            >
                                                <div className="flex items-center gap-2 min-w-0">
                                                    {scan.verified ? (
                                                        <ShieldCheck className="w-4 h-4 text-[#15803D] shrink-0" />
                                                    ) : (
                                                        <CheckCircle2 className="w-4 h-4 text-amber-600 shrink-0" />
                                                    )}
                                                    <div className="min-w-0">
                                                        <p className="font-bold text-slate-900 truncate">
                                                            {scan.entryName}
                                                        </p>
                                                        <p className="text-[10px] text-slate-500">
                                                            {scan.statusLabel} · {scan.at}
                                                        </p>
                                                    </div>
                                                </div>
                                                <span className="font-extrabold text-[#C2410C] tabular-nums shrink-0">
                                                    {scan.totalScore}/{scan.maxScore}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </TeacherLayout>
    );
}
