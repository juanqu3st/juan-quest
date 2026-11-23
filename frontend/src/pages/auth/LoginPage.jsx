import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import {
    ArrowLeft,
    CheckCircle2,
    Download,
    Gamepad2,
    GraduationCap,
    Keyboard,
    Play,
    QrCode,
    WifiOff,
} from 'lucide-react';
import { authApi } from '../../api/authApi';
import { useAuth } from '../../context/AuthContext';
import { usePwa } from '../../context/PwaContext';
import { hasOfflinePack } from '../../utils/offlinePack';
import { startOfflineSession } from '../../utils/offlineEngine';
import QrScannerBox from '../../components/qr/QrScannerBox';

export default function LoginPage() {
    const navigate = useNavigate();
    const { user, loading, saveAuth } = useAuth();
    const { isOnline, appVersion, canShowInstallButton, startAppInstall } = usePwa();

    // Online login state
    const [tab, setTab] = useState('student');
    const [joinCode, setJoinCode] = useState('');
    const [fullName, setFullName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
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

    if (!loading && user) {
        return <Navigate to={user.role === 'teacher' ? '/teacher/monitor' : '/student/world'} replace />;
    }

    const handleStudentJoin = async (e) => {
        e.preventDefault();
        setError('');
        setBusy(true);
        try {
            const res = await authApi.joinByCode({ join_code: joinCode, full_name: fullName });
            saveAuth(res.token, res.user);
            navigate('/student/world');
        } catch (err) {
            const msg =
                err.response?.data?.errors?.join_code?.[0] ||
                err.response?.data?.errors?.full_name?.[0] ||
                err.response?.data?.message ||
                'Hindi makapasok. Suriin ang Code ng Klase at iyong pangalan.';
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
            setScannedSession({
                joinCode: String(parsed.c).toUpperCase(),
                className: String(parsed.n || parsed.c),
                playMode: parsed.m === 'individual' ? 'individual' : 'group',
                qrKey: String(parsed.k || ''),
                manualEntry: false,
            });
        } catch {
            setError('Hindi mabasa ang QR code. Siguraduhing Session Join QR ng JuanQuest ito.');
        }
    };

    const handleStartOffline = (e) => {
        e.preventDefault();
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
        if (target.playMode === 'group' && offlineGroupName.trim().length < 2) {
            setError('Ilagay ang pangalan ng inyong pangkat (kahit 2 letra).');
            return;
        }
        if (offlineLeaderName.trim().length < 2) {
            setError('Ilagay ang iyong pangalan.');
            return;
        }

        try {
            const { token, user: offlineUser } = startOfflineSession({
                joinCode: target.joinCode,
                className: target.className,
                playMode: target.playMode,
                qrKey: target.qrKey,
                groupName: offlineGroupName,
                leaderName: offlineLeaderName,
                memberNames: offlineMemberNames,
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

                                {(scannedSession?.playMode ?? offlinePlayMode) === 'group' && (
                                    <div>
                                        <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                                            Pangalan ng Pangkat
                                        </label>
                                        <input
                                            type="text"
                                            value={offlineGroupName}
                                            onChange={(e) => setOfflineGroupName(e.target.value)}
                                            placeholder="Hal. Pangkat Agila"
                                            maxLength={30}
                                            className="w-full rounded-xl border border-stone-200 bg-[#FAF8F5]/60 focus:bg-white px-4 py-2.5 text-sm text-stone-900 focus:border-[#C2410C] outline-none"
                                            required
                                        />
                                    </div>
                                )}

                                <div>
                                    <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                                        {(scannedSession?.playMode ?? offlinePlayMode) === 'group'
                                            ? 'Pangalan ng Kinatawan'
                                            : 'Iyong Pangalan'}
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

                                {(scannedSession?.playMode ?? offlinePlayMode) === 'group' && (
                                    <div>
                                        <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                                            Mga Miyembro <span className="font-normal text-stone-400">(opsyonal)</span>
                                        </label>
                                        <input
                                            type="text"
                                            value={offlineMemberNames}
                                            onChange={(e) => setOfflineMemberNames(e.target.value)}
                                            placeholder="Hal. Ana, Ben, Carl, Dan"
                                            maxLength={250}
                                            className="w-full rounded-xl border border-stone-200 bg-[#FAF8F5]/60 focus:bg-white px-4 py-2.5 text-sm text-stone-900 focus:border-[#C2410C] outline-none"
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
                                            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                                            placeholder="Ilagay ang code"
                                            autoComplete="off"
                                            className="w-full rounded-xl border border-stone-200 bg-[#FAF8F5]/60 focus:bg-white px-4 py-3 text-base font-bold tracking-widest uppercase text-stone-900 placeholder:font-normal placeholder:tracking-normal placeholder:normal-case placeholder:text-stone-400 focus:border-[#C2410C] outline-none transition"
                                            required
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                                            Pangalan
                                        </label>
                                        <input
                                            type="text"
                                            value={fullName}
                                            onChange={(e) => setFullName(e.target.value)}
                                            placeholder="Ilagay ang iyong pangalan"
                                            autoComplete="name"
                                            className="w-full rounded-xl border border-stone-200 bg-[#FAF8F5]/60 focus:bg-white px-4 py-3 text-sm text-stone-900 placeholder:text-stone-400 focus:border-[#C2410C] outline-none transition"
                                            required
                                        />
                                    </div>

                                    <button
                                        type="submit"
                                        disabled={busy}
                                        className="w-full min-h-[46px] py-3 px-4 rounded-xl bg-[#C2410C] hover:bg-[#9A3412] disabled:opacity-60 text-white font-bold text-sm inline-flex items-center justify-center gap-2 shadow-xs transition cursor-pointer"
                                    >
                                        <Play className="w-4 h-4 fill-current" />
                                        <span>{busy ? 'Pumapasok...' : 'Simulan ang Laro'}</span>
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
                                        <input
                                            type="password"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            placeholder="Ilagay ang password"
                                            autoComplete="current-password"
                                            className="w-full rounded-xl border border-stone-200 bg-[#FAF8F5]/60 focus:bg-white px-4 py-3 text-sm text-stone-900 placeholder:text-stone-400 focus:border-stone-900 outline-none transition"
                                            required
                                        />
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
        </div>
    );
}
