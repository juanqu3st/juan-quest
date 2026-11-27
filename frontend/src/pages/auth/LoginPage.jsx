import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import {
    ArrowLeft,
    Check,
    CheckCircle2,
    Copy,
    Download,
    Eye,
    EyeOff,
    Gamepad2,
    GraduationCap,
    History,
    KeyRound,
    Keyboard,
    Loader2,
    Lock,
    Play,
    QrCode,
    ShieldCheck,
    User,
    Users,
    WifiOff,
    X,
} from 'lucide-react';
import { authApi } from '../../api/authApi';
import { useAuth } from '../../context/AuthContext';
import { usePwa } from '../../context/PwaContext';
import { hasOfflinePack } from '../../utils/offlinePack';
import {
    getCompletedPinLock,
    loadSavedQrHistory,
    startOfflineSession,
    unlockPinWithTeacherCode,
} from '../../utils/offlineEngine';
import { downloadResultQrImage } from '../../utils/qrExport';
import { preloadWorldBgm, unlockAudio } from '../../utils/gameAudio';
import QrCodeImage from '../../components/qr/QrCodeImage';
import QrScannerBox from '../../components/qr/QrScannerBox';

export default function LoginPage() {
    const navigate = useNavigate();
    const { user, loading, saveAuth } = useAuth();
    const { isOnline, appVersion, canShowInstallButton, startAppInstall } = usePwa();

    // Online login state
    const [tab, setTab] = useState('student');
    const [joinCode, setJoinCode] = useState('');
    const [fullName, setFullName] = useState('');
    const [onlineGroupName, setOnlineGroupName] = useState('');
    const [onlineMemberNames, setOnlineMemberNames] = useState('');
    const [sessionPreview, setSessionPreview] = useState(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const previewReqRef = useRef(0);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    // Offline QR join state (shown ONLY when device is actually offline!)
    const [offlineJoinMode, setOfflineJoinMode] = useState('scan'); // 'scan' | 'manual'
    const [scannedSession, setScannedSession] = useState(null);
    const [offlineCode, setOfflineCode] = useState('');
    const [offlinePlayMode, setOfflinePlayMode] = useState('group');
    const [offlineGroupName, setOfflineGroupName] = useState('');
    const [offlineLeaderName, setOfflineLeaderName] = useState('');
    const [offlineMemberNames, setOfflineMemberNames] = useState('');
    const [savedQrModalOpen, setSavedQrModalOpen] = useState(false);
    const [selectedSavedQrIdx, setSelectedSavedQrIdx] = useState(0);
    const [copiedSavedQr, setCopiedSavedQr] = useState(false);
    const [downloadedSavedQr, setDownloadedSavedQr] = useState(false);
    const [blockedPinInfo, setBlockedPinInfo] = useState(null);
    const [showUnblockForm, setShowUnblockForm] = useState(false);
    const [unblockScanMode, setUnblockScanMode] = useState(false);
    const [unblockCodeInput, setUnblockCodeInput] = useState('');
    const [unblockError, setUnblockError] = useState('');

    const savedQrHistory = loadSavedQrHistory();
    const activeSavedQr = savedQrHistory[selectedSavedQrIdx] || savedQrHistory[0] || null;

    // Warm & decode World Map BGM into RAM while student is still on the login screen (0ms playback on entry!)
    useEffect(() => {
        preloadWorldBgm();
    }, []);

    // Auto-detect Per Grupo vs Indibidwal as soon as student types the Class PIN online
    useEffect(() => {
        if (!isOnline || tab !== 'student') return undefined;
        const cleanCode = joinCode.trim().toUpperCase();
        if (cleanCode.length < 3) {
            previewReqRef.current += 1;
            setSessionPreview(null);
            setPreviewLoading(false);
            return undefined;
        }
        if (sessionPreview?.found && sessionPreview.join_code === cleanCode) {
            return undefined;
        }

        const reqId = ++previewReqRef.current;
        setPreviewLoading(true);
        const timer = setTimeout(async () => {
            try {
                const data = await authApi.previewSession(cleanCode);
                if (previewReqRef.current !== reqId) return;
                if (data?.found) {
                    setSessionPreview(data);
                    setError('');
                } else {
                    setSessionPreview({ found: false, checkedCode: cleanCode });
                }
            } catch {
                if (previewReqRef.current !== reqId) return;
                setSessionPreview(null);
            } finally {
                if (previewReqRef.current === reqId) {
                    setPreviewLoading(false);
                }
            }
        }, 280);

        return () => clearTimeout(timer);
    }, [isOnline, tab, joinCode, sessionPreview?.found, sessionPreview?.join_code]);

    if (!loading && user) {
        return <Navigate to={user.role === 'teacher' ? '/teacher/monitor' : '/student/world'} replace />;
    }

    const handleStudentJoin = async (e) => {
        e.preventDefault();
        unlockAudio();
        preloadWorldBgm();
        setError('');
        const cleanCode = joinCode.trim().toUpperCase();
        if (cleanCode.length < 3) {
            setError('Ilagay muna ang Code ng Klase mula sa iyong guro.');
            return;
        }

        // If user pressed Enter before debounce resolved, look up session mode immediately first
        let activePreview = sessionPreview?.found && sessionPreview.join_code === cleanCode ? sessionPreview : null;
        if (!activePreview) {
            setPreviewLoading(true);
            try {
                const data = await authApi.previewSession(cleanCode);
                if (!data?.found) {
                    setSessionPreview({ found: false, checkedCode: cleanCode });
                    setError('Hindi mahanap ang Code ng Klase na ito o tapos na ang sesyon.');
                    return;
                }
                setSessionPreview(data);
                return;
            } catch {
                setError('Hindi masuri ang Code ng Klase. Suriin ang iyong internet at subukan muli.');
                return;
            } finally {
                setPreviewLoading(false);
            }
        }

        const isGroupMode = activePreview.play_mode === 'group';
        if (isGroupMode) {
            if (onlineGroupName.trim().length < 2) {
                setError('Ilagay ang pangalan ng inyong pangkat (kahit 2 letra).');
                return;
            }
            if (onlineMemberNames.trim().length < 2) {
                setError('Ilagay ang mga miyembro ng pangkat (kasama ang humahawak ng device).');
                return;
            }
        } else if (fullName.trim().length < 2) {
            setError('Ilagay ang iyong pangalan (kahit 2 letra).');
            return;
        }

        setBusy(true);
        try {
            const payload = isGroupMode
                ? {
                      join_code: cleanCode,
                      group_name: onlineGroupName.trim(),
                      member_names: onlineMemberNames.trim(),
                  }
                : {
                      join_code: cleanCode,
                      full_name: fullName.trim(),
                  };
            const res = await authApi.joinByCode(payload);
            saveAuth(res.token, res.user);
            navigate('/student/world');
        } catch (err) {
            const msg =
                err.response?.data?.errors?.join_code?.[0] ||
                err.response?.data?.errors?.group_name?.[0] ||
                err.response?.data?.errors?.member_names?.[0] ||
                err.response?.data?.errors?.full_name?.[0] ||
                err.response?.data?.message ||
                'Hindi makapasok. Suriin ang Code ng Klase at mga detalye ng manlalaro.';
            setError(msg);
        } finally {
            setBusy(false);
        }
    };

    const handleEmailLogin = async (e) => {
        e.preventDefault();
        setError('');
        setBusy(true);
        try {
            const res = await authApi.login({ email, password });
            saveAuth(res.token, res.user);
            navigate(res.user.role === 'teacher' ? '/teacher/monitor' : '/student/world');
        } catch (err) {
            setError(err.response?.data?.errors?.email?.[0] || 'Mali ang email o password.');
        } finally {
            setBusy(false);
        }
    };

    const handleScanJoinQr = (decodedText) => {
        setError('');
        try {
            const parsed = JSON.parse(decodedText);
            if (parsed?.t !== 'jqj1' || !parsed?.c) {
                setError('Hindi valid na JuanQuest Session QR ang na-scan. I-scan ang QR sa screen ng guro.');
                return;
            }
            const nextScanned = {
                joinCode: String(parsed.c).toUpperCase(),
                className: String(parsed.n || parsed.c),
                playMode: parsed.m === 'individual' ? 'individual' : 'group',
                qrKey: String(parsed.k || ''),
                manualEntry: false,
            };
            const lock = getCompletedPinLock(nextScanned.joinCode);
            if (lock) {
                setBlockedPinInfo({ ...lock, pendingSession: nextScanned });
                setShowUnblockForm(false);
                setUnblockCodeInput('');
                setUnblockError('');
                return;
            }
            setBlockedPinInfo(null);
            setScannedSession(nextScanned);
        } catch {
            setError('Hindi mabasa ang QR code. Siguraduhing Session Join QR ng JuanQuest ito.');
        }
    };

    const handleStartOffline = (e) => {
        e.preventDefault();
        unlockAudio();
        preloadWorldBgm();
        setError('');
        const target = scannedSession || {
            joinCode: offlineCode.trim().toUpperCase(),
            className: offlineCode.trim().toUpperCase(),
            playMode: offlinePlayMode,
            qrKey: '',
            manualEntry: true,
        };

        if (!target.joinCode || target.joinCode.length < 3) {
            setError('Ilagay muna ang Code ng Klase.');
            return;
        }
        const existingLock = getCompletedPinLock(target.joinCode);
        if (existingLock) {
            setBlockedPinInfo({ ...existingLock, pendingSession: target });
            setShowUnblockForm(false);
            setUnblockCodeInput('');
            setUnblockError('');
            return;
        }
        if (target.playMode === 'group') {
            if (offlineGroupName.trim().length < 2) {
                setError('Ilagay ang pangalan ng inyong pangkat (kahit 2 letra).');
                return;
            }
            if (offlineMemberNames.trim().length < 2) {
                setError('Ilagay ang mga miyembro ng pangkat (kasama ang humahawak ng device).');
                return;
            }
        } else if (offlineLeaderName.trim().length < 2) {
            setError('Ilagay ang iyong pangalan.');
            return;
        }

        try {
            const { token, user: offlineUser } = startOfflineSession({
                joinCode: target.joinCode,
                className: target.className,
                playMode: target.playMode,
                qrKey: target.qrKey,
                groupName: target.playMode === 'group' ? offlineGroupName : '',
                leaderName: target.playMode === 'group' ? offlineGroupName : offlineLeaderName,
                memberNames: target.playMode === 'group' ? offlineMemberNames : '',
                manualEntry: target.manualEntry,
            });
            saveAuth(token, offlineUser);
            navigate('/student/world');
        } catch (err) {
            setError(err?.message || 'Hindi masimulan ang offline game.');
        }
    };

    const offlinePackReady = hasOfflinePack();

    return (
        <div className="relative min-h-dvh bg-[#FAF8F5] flex items-center justify-center px-4 py-8 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] overflow-hidden">
            {/* Subtle warm storybook backdrop glow */}
            <div
                aria-hidden="true"
                className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-[540px] h-[260px] rounded-full opacity-45 blur-3xl"
                style={{
                    background:
                        'radial-gradient(circle, rgba(251, 191, 36, 0.32) 0%, rgba(194, 65, 12, 0.14) 55%, rgba(250, 248, 245, 0) 100%)',
                }}
            />

            <div className="relative w-full max-w-[420px] space-y-6">
                {/* Compact Game Crest */}
                <div className="text-center space-y-2.5">
                    <img
                        src="/logo.svg"
                        alt="JuanQuest"
                        className="mx-auto w-16 h-16 sm:w-[72px] sm:h-[72px] select-none drop-shadow-xs"
                    />
                    <div>
                        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-stone-900">
                            JUANQUEST
                        </h1>
                        <p className="text-xs sm:text-sm font-medium text-stone-500 mt-0.5">
                            Si Juan Osong · Grade 7 Filipino
                        </p>
                    </div>
                </div>

                {/* OFFLINE MODE SCREEN — Shown ONLY when the device is actually offline! */}
                {!isOnline ? (
                    <div className="bg-white rounded-2xl border border-stone-200/90 shadow-sm p-5 sm:p-6 space-y-4">
                        <div className="flex items-center justify-between gap-2 pb-3 border-b border-stone-100">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-900 text-xs font-bold">
                                <WifiOff className="w-3.5 h-3.5 text-amber-700" />
                                Offline Mode
                            </span>
                            {scannedSession && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setScannedSession(null);
                                        setError('');
                                    }}
                                    className="inline-flex items-center gap-1 text-xs font-semibold text-stone-500 hover:text-stone-800 cursor-pointer"
                                >
                                    <ArrowLeft className="w-3.5 h-3.5" />
                                    I-scan Ulit
                                </button>
                            )}
                        </div>

                        {error && (
                            <div className="px-3.5 py-2.5 rounded-xl bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-700">
                                {error}
                            </div>
                        )}

                        {!offlinePackReady ? (
                            <div className="py-4 text-center space-y-2">
                                <p className="text-sm font-bold text-stone-900">
                                    Hindi pa handa ang JuanQuest App
                                </p>
                                <p className="text-xs text-stone-500 leading-relaxed">
                                    Kumonekta muna sandali sa Wi-Fi o mobile data at pindutin ang{' '}
                                    <strong>I-install ang JuanQuest App</strong> bago maglaro nang offline.
                                </p>
                            </div>
                        ) : blockedPinInfo ? (
                            <div className="space-y-4 text-center">
                                <div className="rounded-xl bg-amber-50 border border-amber-200 p-3.5 space-y-1 text-left">
                                    <p className="text-xs font-extrabold text-amber-900 inline-flex items-center gap-1.5">
                                        <Lock className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                                        <span>Natapos na ang Sesyong Ito ({blockedPinInfo.join_code})</span>
                                    </p>
                                    <p className="text-[11px] text-amber-800 leading-relaxed">
                                        Nakumpleto na ng device na ito ang lahat ng 5 mapa para sa klase na ito. Ipakita ang
                                        inyong Result QR sa guro.
                                    </p>
                                </div>

                                {blockedPinInfo.savedQr?.payload && (
                                    <div className="space-y-3">
                                        <div className="inline-block bg-white p-2.5 rounded-2xl border-2 border-stone-900 shadow-xs">
                                            <QrCodeImage
                                                value={blockedPinInfo.savedQr.payload}
                                                size={208}
                                                errorCorrectionLevel="L"
                                                alt="Completed Result QR"
                                                className="w-[196px] h-[196px] sm:w-[208px] sm:h-[208px]"
                                            />
                                        </div>
                                        <button
                                            type="button"
                                            onClick={async () => {
                                                await downloadResultQrImage(blockedPinInfo.savedQr.payload, {
                                                    userName: blockedPinInfo.savedQr.leader_name,
                                                    groupName: blockedPinInfo.savedQr.group_name,
                                                    className: blockedPinInfo.savedQr.class_name,
                                                }).catch(() => {});
                                                setDownloadedSavedQr(true);
                                                setTimeout(() => setDownloadedSavedQr(false), 2000);
                                            }}
                                            className="w-full min-h-[42px] px-4 py-2 rounded-xl bg-[#C2410C] hover:bg-[#9A3412] text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer transition"
                                        >
                                            {downloadedSavedQr ? (
                                                <Check className="w-4 h-4" />
                                            ) : (
                                                <Download className="w-4 h-4" />
                                            )}
                                            <span>
                                                {downloadedSavedQr ? 'Na-download na!' : 'I-download ang QR Image'}
                                            </span>
                                        </button>
                                    </div>
                                )}

                                {/* Teacher-Only Unblock Control (Works 100% Offline!) */}
                                <div className="pt-2 border-t border-stone-100 space-y-2.5 text-left">
                                    {!showUnblockForm ? (
                                        <div className="flex items-center justify-between gap-2">
                                            <button
                                                type="button"
                                                onClick={() => setBlockedPinInfo(null)}
                                                className="text-xs font-semibold text-stone-500 hover:text-stone-800 cursor-pointer"
                                            >
                                                Bumalik
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setShowUnblockForm(true);
                                                    setUnblockError('');
                                                }}
                                                className="inline-flex items-center gap-1 text-xs font-bold text-[#C2410C] hover:text-[#9A3412] cursor-pointer"
                                            >
                                                <KeyRound className="w-3.5 h-3.5" />
                                                <span>I-unblock ng Guro</span>
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="space-y-2.5 rounded-xl bg-stone-50 border border-stone-200 p-3">
                                            <div className="flex items-center justify-between gap-2">
                                                <p className="text-[11px] font-bold text-stone-700">
                                                    Teacher Unblock (Para sa Guro)
                                                </p>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setUnblockScanMode((v) => !v);
                                                        setUnblockError('');
                                                    }}
                                                    className="inline-flex items-center gap-1 text-[11px] font-bold text-[#C2410C] cursor-pointer"
                                                >
                                                    {unblockScanMode ? (
                                                        <>
                                                            <Keyboard className="w-3 h-3" />
                                                            <span>I-type Code</span>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <QrCode className="w-3 h-3" />
                                                            <span>I-scan Unblock QR</span>
                                                        </>
                                                    )}
                                                </button>
                                            </div>

                                            {unblockError && (
                                                <p className="text-[11px] font-semibold text-rose-600">
                                                    {unblockError}
                                                </p>
                                            )}

                                            {unblockScanMode ? (
                                                <QrScannerBox
                                                    active={unblockScanMode}
                                                    onScan={async (decoded) => {
                                                        try {
                                                            const parsed = JSON.parse(decoded);
                                                            if (parsed?.t !== 'jqu1' || !parsed?.u) {
                                                                setUnblockError(
                                                                    'Hindi valid na Teacher Unblock QR ito.'
                                                                );
                                                                return;
                                                            }
                                                            const res = await unlockPinWithTeacherCode(
                                                                blockedPinInfo.join_code,
                                                                parsed.u,
                                                                blockedPinInfo.pendingSession?.qrKey || ''
                                                            );
                                                            if (!res.ok) {
                                                                setUnblockError(res.message);
                                                                return;
                                                            }
                                                            const nextSess = blockedPinInfo.pendingSession;
                                                            setBlockedPinInfo(null);
                                                            setShowUnblockForm(false);
                                                            setUnblockScanMode(false);
                                                            setUnblockCodeInput('');
                                                            if (nextSess && !nextSess.manualEntry) {
                                                                setScannedSession(nextSess);
                                                            }
                                                        } catch {
                                                            setUnblockError('Hindi mabasa ang Teacher Unblock QR.');
                                                        }
                                                    }}
                                                />
                                            ) : (
                                                <div className="flex gap-2">
                                                    <input
                                                        type="text"
                                                        maxLength={12}
                                                        value={unblockCodeInput}
                                                        onChange={(e) => {
                                                            setUnblockCodeInput(e.target.value.toUpperCase());
                                                            setUnblockError('');
                                                        }}
                                                        placeholder="6-char code"
                                                        className="flex-1 min-w-0 h-9 rounded-lg border border-stone-200 bg-white px-3 text-xs font-mono font-bold tracking-widest uppercase text-stone-900 focus:border-[#C2410C] outline-none"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={async () => {
                                                            const res = await unlockPinWithTeacherCode(
                                                                blockedPinInfo.join_code,
                                                                unblockCodeInput,
                                                                blockedPinInfo.pendingSession?.qrKey || ''
                                                            );
                                                            if (!res.ok) {
                                                                setUnblockError(res.message);
                                                                return;
                                                            }
                                                            const nextSess = blockedPinInfo.pendingSession;
                                                            setBlockedPinInfo(null);
                                                            setShowUnblockForm(false);
                                                            setUnblockScanMode(false);
                                                            setUnblockCodeInput('');
                                                            if (nextSess && !nextSess.manualEntry) {
                                                                setScannedSession(nextSess);
                                                            }
                                                        }}
                                                        className="h-9 px-3.5 rounded-lg bg-stone-900 hover:bg-stone-800 text-white text-xs font-bold cursor-pointer shrink-0"
                                                    >
                                                        I-unblock
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : !scannedSession && offlineJoinMode === 'scan' ? (
                            <div className="space-y-3.5">
                                <div className="text-center">
                                    <h2 className="text-sm font-extrabold text-stone-900">
                                        I-scan ang Join QR ng Guro
                                    </h2>
                                    <p className="text-xs text-stone-500 mt-0.5">
                                        Itapat ang camera sa Offline Session QR sa screen ng iyong guro.
                                    </p>
                                </div>

                                <QrScannerBox active={!scannedSession} onScan={handleScanJoinQr} />

                                <button
                                    type="button"
                                    onClick={() => {
                                        setOfflineJoinMode('manual');
                                        setError('');
                                    }}
                                    className="w-full py-2.5 px-3 rounded-xl border border-stone-200 bg-[#FAF8F5] hover:bg-stone-100 text-stone-700 text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition cursor-pointer"
                                >
                                    <Keyboard className="w-3.5 h-3.5" />
                                    <span>Walang camera? Ilagay ang Code nang manual</span>
                                </button>
                            </div>
                        ) : (
                            <form onSubmit={handleStartOffline} className="space-y-3.5">
                                {scannedSession ? (
                                    <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-3.5 py-2.5 flex items-center gap-2.5">
                                        <CheckCircle2 className="w-4 h-4 text-[#15803D] shrink-0" />
                                        <div className="min-w-0 text-xs">
                                            <p className="font-bold text-emerald-900 truncate">
                                                {scannedSession.className} ({scannedSession.joinCode})
                                            </p>
                                            <p className="text-[11px] text-emerald-700">
                                                {scannedSession.playMode === 'group'
                                                    ? 'Per Grupo (1 Device)'
                                                    : 'Indibidwal (Solo)'}
                                            </p>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs font-bold text-stone-800">Manual Offline Code</span>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setOfflineJoinMode('scan');
                                                    setError('');
                                                }}
                                                className="inline-flex items-center gap-1 text-xs font-semibold text-[#C2410C] cursor-pointer"
                                            >
                                                <QrCode className="w-3.5 h-3.5" />
                                                Gumamit ng QR Camera
                                            </button>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <input
                                                type="text"
                                                value={offlineCode}
                                                onChange={(e) => setOfflineCode(e.target.value.toUpperCase())}
                                                placeholder="Code ng Klase"
                                                className="rounded-xl border border-stone-200 bg-[#FAF8F5]/60 focus:bg-white px-3.5 py-2.5 text-sm font-bold tracking-widest uppercase text-stone-900 focus:border-[#C2410C] outline-none"
                                                required
                                            />
                                            <select
                                                value={offlinePlayMode}
                                                onChange={(e) => setOfflinePlayMode(e.target.value)}
                                                className="rounded-xl border border-stone-200 bg-[#FAF8F5]/60 focus:bg-white px-3 py-2.5 text-xs font-semibold text-stone-800 focus:border-[#C2410C] outline-none"
                                            >
                                                <option value="group">Per Grupo</option>
                                                <option value="individual">Indibidwal</option>
                                            </select>
                                        </div>
                                    </div>
                                )}

                                {(scannedSession?.playMode ?? offlinePlayMode) === 'group' ? (
                                    <>
                                        <div>
                                            <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                                                Pangalan ng Pangkat
                                            </label>
                                            <input
                                                type="text"
                                                value={offlineGroupName}
                                                onChange={(e) => setOfflineGroupName(e.target.value)}
                                                placeholder="Hal. Pangkat Agila"
                                                maxLength={35}
                                                className="w-full rounded-xl border border-stone-200 bg-[#FAF8F5]/60 focus:bg-white px-4 py-2.5 text-sm text-stone-900 focus:border-[#C2410C] outline-none"
                                                required
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                                                Mga Miyembro
                                            </label>
                                            <textarea
                                                rows={2}
                                                value={offlineMemberNames}
                                                onChange={(e) => setOfflineMemberNames(e.target.value)}
                                                placeholder="Hal. Ana, Ben, Carl, Dan"
                                                maxLength={400}
                                                className="w-full rounded-xl border border-stone-200 bg-[#FAF8F5]/60 focus:bg-white px-4 py-2.5 text-sm text-stone-900 focus:border-[#C2410C] outline-none resize-none"
                                                required
                                            />
                                            <p className="mt-1 text-[11px] text-stone-500">
                                                Isama ang lahat ng miyembro, pati ang humahawak ng device.
                                            </p>
                                        </div>
                                    </>
                                ) : (
                                    <div>
                                        <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                                            Iyong Pangalan
                                        </label>
                                        <input
                                            type="text"
                                            value={offlineLeaderName}
                                            onChange={(e) => setOfflineLeaderName(e.target.value)}
                                            placeholder="Ilagay ang iyong pangalan"
                                            maxLength={60}
                                            className="w-full rounded-xl border border-stone-200 bg-[#FAF8F5]/60 focus:bg-white px-4 py-2.5 text-sm text-stone-900 focus:border-[#C2410C] outline-none"
                                            required
                                        />
                                    </div>
                                )}

                                <button
                                    type="submit"
                                    className="w-full min-h-[46px] py-3 px-4 rounded-xl bg-[#C2410C] hover:bg-[#9A3412] text-white font-bold text-sm inline-flex items-center justify-center gap-2 shadow-xs transition cursor-pointer"
                                >
                                    <Play className="w-4 h-4 fill-current" />
                                    <span>Simulan ang Laro (Offline)</span>
                                </button>
                            </form>
                        )}

                        {savedQrHistory.length > 0 && (
                            <div className="pt-3 border-t border-stone-100">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setSelectedSavedQrIdx(0);
                                        setSavedQrModalOpen(true);
                                    }}
                                    className="w-full py-2.5 px-3 rounded-xl bg-amber-50/75 hover:bg-amber-100/80 border border-amber-200/80 text-amber-900 text-xs font-bold inline-flex items-center justify-center gap-2 transition cursor-pointer"
                                >
                                    <History className="w-3.5 h-3.5 text-[#C2410C]" />
                                    <span>Mga Nakaraang Result QR (Backup · {savedQrHistory.length})</span>
                                </button>
                            </div>
                        )}
                    </div>
                ) : (
                    /* ONLINE MODE — 100% Clean & Simple (Zero Offline Clutter While Online!) */
                    <div className="space-y-3">
                        <div className="bg-white rounded-2xl border border-stone-200/90 shadow-sm p-5 sm:p-6">
                            {/* Role Switcher */}
                            <div className="grid grid-cols-2 rounded-xl bg-[#FAF8F5] border border-stone-200/80 p-1 mb-5">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setTab('student');
                                        setShowPassword(false);
                                        setError('');
                                    }}
                                    className={`flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-lg text-xs font-bold transition cursor-pointer ${
                                        tab === 'student'
                                            ? 'bg-white text-[#C2410C] shadow-2xs border border-stone-200/70'
                                            : 'text-stone-500 hover:text-stone-800'
                                    }`}
                                >
                                    <Gamepad2 className="w-4 h-4" />
                                    Manlalaro
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setTab('teacher');
                                        setError('');
                                    }}
                                    className={`flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-lg text-xs font-bold transition cursor-pointer ${
                                        tab === 'teacher'
                                            ? 'bg-white text-stone-900 shadow-2xs border border-stone-200/70'
                                            : 'text-stone-500 hover:text-stone-800'
                                    }`}
                                >
                                    <GraduationCap className="w-4 h-4" />
                                    Guro
                                </button>
                            </div>

                            {error && (
                                <div className="mb-4 px-3.5 py-2.5 rounded-xl bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-700">
                                    {error}
                                </div>
                            )}

                            {tab === 'student' ? (
                                <form onSubmit={handleStudentJoin} className="space-y-4">
                                    <div>
                                        <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                                            Code ng Klase
                                        </label>
                                        <input
                                            type="text"
                                            value={joinCode}
                                            onChange={(e) => {
                                                setJoinCode(e.target.value.toUpperCase());
                                                setError('');
                                            }}
                                            placeholder="Ilagay ang code"
                                            autoComplete="off"
                                            maxLength={16}
                                            className="w-full rounded-xl border border-stone-200 bg-[#FAF8F5]/60 focus:bg-white px-4 py-3 text-base font-bold tracking-widest uppercase text-stone-900 placeholder:font-normal placeholder:tracking-normal placeholder:normal-case placeholder:text-stone-400 focus:border-[#C2410C] outline-none transition"
                                            required
                                        />

                                        {previewLoading && (
                                            <div className="mt-2 flex items-center gap-1.5 text-[11px] font-medium text-stone-500">
                                                <Loader2 className="w-3.5 h-3.5 animate-spin text-[#C2410C]" />
                                                <span>Sinusuri ang code ng klase...</span>
                                            </div>
                                        )}

                                        {!previewLoading && sessionPreview?.found && (
                                            <div
                                                className={`mt-2.5 rounded-xl border px-3 py-2 flex items-center justify-between gap-2 ${
                                                    sessionPreview.groups_locked
                                                        ? 'bg-amber-50 border-amber-200'
                                                        : 'bg-emerald-50 border-emerald-200'
                                                }`}
                                            >
                                                <div className="min-w-0 flex items-center gap-2">
                                                    {sessionPreview.groups_locked ? (
                                                        <Lock className="w-4 h-4 text-amber-700 shrink-0" />
                                                    ) : (
                                                        <CheckCircle2 className="w-4 h-4 text-[#15803D] shrink-0" />
                                                    )}
                                                    <div className="min-w-0">
                                                        <p
                                                            className={`text-xs font-bold truncate ${
                                                                sessionPreview.groups_locked
                                                                    ? 'text-amber-900'
                                                                    : 'text-emerald-900'
                                                            }`}
                                                        >
                                                            {sessionPreview.class_name}
                                                        </p>
                                                        {sessionPreview.groups_locked && (
                                                            <p className="text-[10px] text-amber-800 leading-snug">
                                                                Sarado sa bagong sali (pwede bumalik ang nakasali na)
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                                <span
                                                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold shrink-0 ${
                                                        sessionPreview.play_mode === 'group'
                                                            ? 'bg-white/90 text-[#C2410C] border border-orange-200/80'
                                                            : 'bg-white/90 text-stone-700 border border-stone-200'
                                                    }`}
                                                >
                                                    {sessionPreview.play_mode === 'group' ? (
                                                        <>
                                                            <Users className="w-3 h-3" />
                                                            <span>Per Grupo</span>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <User className="w-3 h-3" />
                                                            <span>Indibidwal</span>
                                                        </>
                                                    )}
                                                </span>
                                            </div>
                                        )}

                                        {!previewLoading && sessionPreview && !sessionPreview.found && (
                                            <p className="mt-2 text-[11px] font-semibold text-rose-600">
                                                Hindi mahanap ang code na ito o tapos na ang sesyon.
                                            </p>
                                        )}
                                    </div>

                                    {sessionPreview?.found && sessionPreview.play_mode === 'group' ? (
                                        <>
                                            <div>
                                                <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                                                    Pangalan ng Pangkat
                                                </label>
                                                <input
                                                    type="text"
                                                    value={onlineGroupName}
                                                    onChange={(e) => setOnlineGroupName(e.target.value)}
                                                    placeholder="Hal. Pangkat Agila"
                                                    maxLength={35}
                                                    className="w-full rounded-xl border border-stone-200 bg-[#FAF8F5]/60 focus:bg-white px-4 py-3 text-sm text-stone-900 placeholder:text-stone-400 focus:border-[#C2410C] outline-none transition"
                                                    required
                                                />
                                            </div>

                                            <div>
                                                <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                                                    Mga Miyembro
                                                </label>
                                                <textarea
                                                    rows={2}
                                                    value={onlineMemberNames}
                                                    onChange={(e) => setOnlineMemberNames(e.target.value)}
                                                    placeholder="Hal. Ana, Ben, Carl, Dan"
                                                    maxLength={400}
                                                    className="w-full rounded-xl border border-stone-200 bg-[#FAF8F5]/60 focus:bg-white px-4 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 focus:border-[#C2410C] outline-none transition resize-none"
                                                    required
                                                />
                                                <p className="mt-1 text-[11px] text-stone-500">
                                                    Isama ang lahat ng miyembro, pati ang humahawak ng device.
                                                </p>
                                            </div>
                                        </>
                                    ) : sessionPreview?.found && sessionPreview.play_mode === 'individual' ? (
                                        <div>
                                            <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                                                Iyong Pangalan
                                            </label>
                                            <input
                                                type="text"
                                                value={fullName}
                                                onChange={(e) => setFullName(e.target.value)}
                                                placeholder="Ilagay ang iyong pangalan"
                                                autoComplete="name"
                                                maxLength={100}
                                                className="w-full rounded-xl border border-stone-200 bg-[#FAF8F5]/60 focus:bg-white px-4 py-3 text-sm text-stone-900 placeholder:text-stone-400 focus:border-[#C2410C] outline-none transition"
                                                required
                                            />
                                        </div>
                                    ) : (
                                        <div className="rounded-xl bg-[#FAF8F5] border border-stone-200/80 px-3.5 py-2.5 text-xs text-stone-500 leading-relaxed">
                                            Ilagay ang <strong>Code ng Klase</strong> mula sa iyong guro upang awtomatikong lumabas ang form (Per Grupo o Indibidwal).
                                        </div>
                                    )}

                                    <button
                                        type="submit"
                                        disabled={busy || previewLoading}
                                        className="w-full min-h-[46px] py-3 px-4 rounded-xl bg-[#C2410C] hover:bg-[#9A3412] disabled:opacity-60 text-white font-bold text-sm inline-flex items-center justify-center gap-2 shadow-xs transition cursor-pointer"
                                    >
                                        <Play className="w-4 h-4 fill-current" />
                                        <span>
                                            {busy
                                                ? 'Pumapasok...'
                                                : sessionPreview?.found
                                                  ? 'Simulan ang Laro'
                                                  : 'Suriin ang Code'}
                                        </span>
                                    </button>
                                </form>
                            ) : (
                                <form onSubmit={handleEmailLogin} className="space-y-4">
                                    <div>
                                        <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                                            Email
                                        </label>
                                        <input
                                            type="email"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            placeholder="Ilagay ang email"
                                            autoComplete="email"
                                            className="w-full rounded-xl border border-stone-200 bg-[#FAF8F5]/60 focus:bg-white px-4 py-3 text-sm text-stone-900 placeholder:text-stone-400 focus:border-stone-900 outline-none transition"
                                            required
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                                            Password
                                        </label>
                                        <div className="relative">
                                            <input
                                                type={showPassword ? 'text' : 'password'}
                                                value={password}
                                                onChange={(e) => setPassword(e.target.value)}
                                                placeholder="Ilagay ang password"
                                                autoComplete="current-password"
                                                className="w-full rounded-xl border border-stone-200 bg-[#FAF8F5]/60 focus:bg-white pl-4 pr-11 py-3 text-sm text-stone-900 placeholder:text-stone-400 focus:border-stone-900 outline-none transition"
                                                required
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowPassword((prev) => !prev)}
                                                aria-label={showPassword ? 'Itago ang password' : 'Ipakita ang password'}
                                                title={showPassword ? 'Itago ang password' : 'Ipakita ang password'}
                                                className="absolute inset-y-0 right-0 px-3 flex items-center justify-center text-stone-400 hover:text-stone-700 transition cursor-pointer"
                                            >
                                                {showPassword ? (
                                                    <EyeOff className="w-4 h-4" />
                                                ) : (
                                                    <Eye className="w-4 h-4" />
                                                )}
                                            </button>
                                        </div>
                                    </div>

                                    <button
                                        type="submit"
                                        disabled={busy}
                                        className="w-full min-h-[46px] py-3 px-4 rounded-xl bg-stone-900 hover:bg-stone-800 disabled:opacity-60 text-white font-bold text-sm transition cursor-pointer"
                                    >
                                        {busy ? 'Pumapasok...' : 'Buksan ang Portal'}
                                    </button>
                                </form>
                            )}
                        </div>

                        {/* Recoverable Offline Result QR Backup Button (Remains accessible even after Wi-Fi reconnects!) */}
                        {savedQrHistory.length > 0 && (
                            <button
                                type="button"
                                onClick={() => {
                                    setSelectedSavedQrIdx(0);
                                    setSavedQrModalOpen(true);
                                }}
                                className="w-full py-2.5 px-3 rounded-xl bg-amber-50/90 hover:bg-amber-100/90 border border-amber-200/80 text-amber-900 text-xs font-bold inline-flex items-center justify-center gap-2 transition cursor-pointer"
                            >
                                <History className="w-3.5 h-3.5 text-[#C2410C]" />
                                <span>Mga Nakaraang Result QR (Backup · {savedQrHistory.length})</span>
                            </button>
                        )}

                        {/* Clean Install App Button (Downloads 100% of app + 5 videos during installation!) */}
                        {canShowInstallButton && (
                            <div className="flex justify-center">
                                <button
                                    type="button"
                                    onClick={startAppInstall}
                                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/90 hover:bg-white border border-stone-200/90 shadow-2xs text-xs font-bold text-stone-700 hover:text-[#C2410C] transition cursor-pointer"
                                >
                                    <Download className="w-3.5 h-3.5 text-[#C2410C]" />
                                    <span>I-install ang JuanQuest App</span>
                                </button>
                            </div>
                        )}
                    </div>
                )}

                <p className="text-center text-[11px] font-medium text-stone-400 select-none tabular-nums">
                    v{appVersion}
                </p>
            </div>

            {/* Recoverable Offline Result QR Backup Modal (Zero score spoilers!) */}
            {savedQrModalOpen && activeSavedQr && (
                <div
                    className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-[2px] flex items-center justify-center p-4"
                    onClick={() => setSavedQrModalOpen(false)}
                >
                    <div
                        className="w-full max-w-sm max-h-[92dvh] overflow-y-auto rounded-2xl bg-white border border-stone-200 shadow-2xl p-5 space-y-4 text-center"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between gap-2 pb-2 border-b border-stone-100 text-left">
                            <div className="min-w-0">
                                <h3 className="text-sm font-extrabold text-stone-900">
                                    Backup na Result QR
                                </h3>
                                <p className="text-[11px] text-stone-500 truncate">
                                    {activeSavedQr.group_name &&
                                    activeSavedQr.leader_name &&
                                    activeSavedQr.group_name.trim().toLowerCase() !==
                                        activeSavedQr.leader_name.trim().toLowerCase()
                                        ? `${activeSavedQr.group_name} (${activeSavedQr.leader_name})`
                                        : activeSavedQr.group_name || activeSavedQr.leader_name}{' '}
                                    · <span className="font-mono font-bold">{activeSavedQr.join_code}</span>
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setSavedQrModalOpen(false)}
                                className="p-1.5 rounded-lg text-stone-400 hover:bg-stone-100 hover:text-stone-700 cursor-pointer shrink-0"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {savedQrHistory.length > 1 && (
                            <div className="flex gap-1.5 overflow-x-auto pb-0.5 justify-center">
                                {savedQrHistory.map((item, i) => (
                                    <button
                                        key={item.id}
                                        type="button"
                                        onClick={() => setSelectedSavedQrIdx(i)}
                                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border shrink-0 cursor-pointer transition ${
                                            i === selectedSavedQrIdx
                                                ? 'bg-stone-900 text-white border-stone-900'
                                                : 'bg-stone-50 text-stone-600 border-stone-200 hover:bg-stone-100'
                                        }`}
                                    >
                                        {item.join_code} · {item.group_name || item.leader_name}
                                    </button>
                                ))}
                            </div>
                        )}

                        <div className="inline-block bg-white p-3 rounded-2xl border-2 border-stone-900 shadow-xs">
                            <QrCodeImage
                                value={activeSavedQr.payload}
                                size={224}
                                errorCorrectionLevel="L"
                                alt="Backup Result QR"
                                className="w-[210px] h-[210px] sm:w-[224px] sm:h-[224px]"
                            />
                        </div>

                        <div>
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-[11px] font-bold text-[#15803D]">
                                <ShieldCheck className="w-3.5 h-3.5" />
                                {activeSavedQr.payload?.sig === 'manual'
                                    ? 'Offline Result QR (Manual)'
                                    : 'Verified Offline Result QR'}
                            </span>
                        </div>

                        <div className="space-y-2 pt-1">
                            <button
                                type="button"
                                onClick={async () => {
                                    await downloadResultQrImage(activeSavedQr.payload, {
                                        userName: activeSavedQr.leader_name,
                                        groupName: activeSavedQr.group_name,
                                        className: activeSavedQr.class_name,
                                    }).catch(() => {});
                                    setDownloadedSavedQr(true);
                                    setTimeout(() => setDownloadedSavedQr(false), 2000);
                                }}
                                className="w-full min-h-[44px] px-4 py-2 rounded-xl bg-[#C2410C] hover:bg-[#9A3412] text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer transition"
                            >
                                {downloadedSavedQr ? <Check className="w-4 h-4" /> : <Download className="w-4 h-4" />}
                                <span>{downloadedSavedQr ? 'Na-download na!' : 'I-download ang QR Image'}</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    navigator.clipboard?.writeText(JSON.stringify(activeSavedQr.payload)).catch(() => {});
                                    setCopiedSavedQr(true);
                                    setTimeout(() => setCopiedSavedQr(false), 1800);
                                }}
                                className="w-full min-h-[40px] px-4 py-2 rounded-xl border border-stone-200 bg-white hover:bg-stone-50 text-stone-700 text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer transition"
                            >
                                {copiedSavedQr ? (
                                    <Check className="w-3.5 h-3.5 text-[#15803D]" />
                                ) : (
                                    <Copy className="w-3.5 h-3.5 text-stone-500" />
                                )}
                                <span>{copiedSavedQr ? 'Nakopya ang Result Code' : 'Kopyahin ang Result Code'}</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
