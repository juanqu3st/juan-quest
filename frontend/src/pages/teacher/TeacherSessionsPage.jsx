import { useEffect, useState } from 'react';
import {
    Check,
    Copy,
    Lock,
    Pencil,
    Play,
    Plus,
    QrCode,
    RotateCcw,
    Square,
    Unlock,
    User,
    Users,
    X,
} from 'lucide-react';
import { teacherApi } from '../../api/teacherApi';
import { useToast } from '../../context/ToastContext';
import QrCodeImage from '../../components/qr/QrCodeImage';
import TeacherLayout from './TeacherLayout';

const STATUS_META = {
    waiting: {
        shortLabel: 'Waiting',
        dotClass: 'bg-amber-500',
        activePill: 'bg-white text-amber-800 shadow-xs',
        hintGroup:
            'Naka-hold ang mapa — maaaring palitan ng bawat pangkat ang kanilang pangalan at ilista ang mga miyembro.',
        hintIndividual:
            'Naka-hold ang mapa — naghihintay ang mga mag-aaral sa iyong go-signal bago makapasok sa Mapa 1.',
    },
    active: {
        shortLabel: 'Active',
        dotClass: 'bg-emerald-500',
        activePill: 'bg-white text-emerald-800 shadow-xs',
        hintGroup:
            'Bukas na ang laro — naka-lock na ang pangalan ng pangkat upang makapag-pokus sila sa mga mapa.',
        hintIndividual:
            'Bukas na ang laro — maaari nang sagutan ng bawat mag-aaral ang Mapa 1 hanggang Mapa 5.',
    },
    finished: {
        shortLabel: 'Finished',
        dotClass: 'bg-slate-500',
        activePill: 'bg-white text-slate-800 shadow-xs',
        hintGroup:
            'Tapos na ang sesyon — sarado na ang mga mapa at maaari nang i-export ang resulta sa Live Monitor.',
        hintIndividual:
            'Tapos na ang sesyon — sarado na ang mga mapa at maaari nang i-export ang resulta sa Live Monitor.',
    },
};

function getInitials(name = '') {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function parseMemberList(memberNames) {
    if (!memberNames) return [];
    return memberNames
        .split(/[\n,;]+/)
        .map((s) => s.trim())
        .filter(Boolean);
}

export default function TeacherSessionsPage() {
    const { showToast } = useToast();
    const [sessions, setSessions] = useState([]);
    const [lessons, setLessons] = useState([]);
    const [selectedId, setSelectedId] = useState(null);
    const [lobby, setLobby] = useState(null);
    const [busy, setBusy] = useState(false);
    const [copied, setCopied] = useState(false);
    const [showJoinQr, setShowJoinQr] = useState(false);
    const [showCreate, setShowCreate] = useState(false);
    const [editingGroupId, setEditingGroupId] = useState(null);
    const [editingGroupName, setEditingGroupName] = useState('');
    const [editingMemberNames, setEditingMemberNames] = useState('');
    const [savingGroupId, setSavingGroupId] = useState(null);
    const [renameError, setRenameError] = useState('');
    const [createForm, setCreateForm] = useState({
        class_name: '',
        lesson_id: '',
        play_mode: 'group',
        join_code: '',
    });

    const loadIndex = async () => {
        const res = await teacherApi.listSessions();
        setSessions(res.sessions || []);
        setLessons(res.lessons || []);
        if (!selectedId && res.sessions?.length > 0) {
            setSelectedId(res.sessions[0].id);
        }
        if (res.lessons?.length > 0 && !createForm.lesson_id) {
            setCreateForm((f) => ({ ...f, lesson_id: res.lessons[0].id }));
        }
    };

    const loadLobby = async (id) => {
        if (!id) return;
        try {
            const res = await teacherApi.getSessionLobby(id);
            setLobby(res.session);
            try {
                localStorage.setItem(`juanquest_teacher_lobby_${id}`, JSON.stringify(res.session));
            } catch {
                // ignore storage quota
            }
        } catch {
            try {
                const cached = localStorage.getItem(`juanquest_teacher_lobby_${id}`);
                if (cached) setLobby(JSON.parse(cached));
            } catch {
                // ignore
            }
        }
    };

    useEffect(() => {
        loadIndex();
    }, []);

    useEffect(() => {
        if (!selectedId) return;
        loadLobby(selectedId);
        const timer = setInterval(() => {
            teacherApi.getSessionLobby(selectedId).then((r) => setLobby(r.session)).catch(() => {});
        }, 3000);
        return () => clearInterval(timer);
    }, [selectedId]);

    const handleCreateSession = async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
            const res = await teacherApi.createSession({
                class_name: createForm.class_name,
                lesson_id: createForm.lesson_id,
                play_mode: createForm.play_mode,
                join_code: createForm.join_code || undefined,
            });
            setShowCreate(false);
            setCreateForm((f) => ({ ...f, class_name: '', join_code: '' }));
            await loadIndex();
            setSelectedId(res.session.id);
            setLobby(res.session);
            showToast(
                'success',
                `Nagawa ang "${res.session.class_name}" (PIN: ${res.session.join_code}) sa Waiting status.`,
                'Bagong Sesyon.'
            );
        } catch (err) {
            const msg =
                err?.response?.data?.errors?.join_code?.[0] ||
                err?.response?.data?.errors?.class_name?.[0] ||
                err?.response?.data?.message ||
                'Hindi nagawa ang bagong sesyon.';
            showToast('error', msg, 'May Error.');
        } finally {
            setBusy(false);
        }
    };

    const handleToggleLock = async () => {
        if (!lobby?.id) return;
        setBusy(true);
        try {
            const res = await teacherApi.toggleLock(lobby.id);
            setLobby(res.session);
            showToast(
                res.session.groups_locked ? 'locked' : 'info',
                res.session.groups_locked
                    ? 'Sarado na ang pagsali ng mga bagong device sa sesyong ito.'
                    : 'Bukas na muli ang pagsali gamit ang Class PIN.',
                res.session.groups_locked ? 'Naka-lock.' : 'Bukas na.'
            );
        } catch {
            showToast('error', 'Hindi nabago ang lock status ng sesyon.', 'May Error.');
        } finally {
            setBusy(false);
        }
    };

    const handleStatus = async (status) => {
        if (!lobby?.id || lobby.status === status) return;
        setBusy(true);
        try {
            const res = await teacherApi.updateSessionStatus(lobby.id, status);
            setLobby(res.session);
            setSessions((prev) =>
                prev.map((s) => (s.id === lobby.id ? { ...s, status: res.session.status } : s))
            );
            if (status === 'active') {
                showToast(
                    'success',
                    'Bukas na ang mga mapa para sa klase at naka-lock na ang pangalan ng pangkat.',
                    'Nagsimula na ang Laro.'
                );
            } else if (status === 'waiting') {
                showToast(
                    'warning',
                    'Naka-hold muli ang mga mapa sa Waiting lobby.',
                    'Waiting Mode.'
                );
            } else {
                showToast(
                    'info',
                    'Sarado na ang sesyon at naitala na ang huling resulta.',
                    'Tapos na ang Laro.'
                );
            }
        } catch {
            showToast('error', 'Hindi nabago ang status ng laro.', 'May Error.');
        } finally {
            setBusy(false);
        }
    };

    const startEditGroup = (group) => {
        setEditingGroupId(group.id);
        setEditingGroupName(group.group_name || '');
        setEditingMemberNames(group.member_names || '');
        setRenameError('');
    };

    const cancelEditGroup = () => {
        setEditingGroupId(null);
        setEditingGroupName('');
        setEditingMemberNames('');
        setRenameError('');
    };

    const handleSaveGroup = async (groupId) => {
        const cleaned = editingGroupName.replace(/\s+/g, ' ').trim();
        if (cleaned.length < 2) {
            setRenameError('Dapat may hindi bababa sa 2 letra ang pangalan ng pangkat.');
            return;
        }
        setSavingGroupId(groupId);
        setRenameError('');
        try {
            const res = await teacherApi.renameGroup(groupId, {
                group_name: cleaned,
                member_names: editingMemberNames.trim(),
            });
            if (res.session) {
                setLobby(res.session);
            }
            cancelEditGroup();
            showToast('success', `Na-save ang pangkat "${res.group?.group_name || cleaned}".`, 'Na-save.');
        } catch (err) {
            const msg =
                err?.response?.data?.errors?.group_name?.[0] ||
                err?.response?.data?.errors?.member_names?.[0] ||
                err?.response?.data?.message ||
                'Hindi na-save ang pagbabago.';
            setRenameError(msg);
            showToast('error', msg, 'Hindi na-save.');
        } finally {
            setSavingGroupId(null);
        }
    };

    const handleCopy = () => {
        if (!lobby?.join_code) return;
        navigator.clipboard.writeText(lobby.join_code);
        setCopied(true);
        showToast('info', `Nakopya ang Class PIN "${lobby.join_code}".`, 'Nakopya.');
        setTimeout(() => setCopied(false), 1600);
    };

    const isGroupMode = (lobby?.play_mode ?? 'group') === 'group';
    const statusMeta = STATUS_META[lobby?.status] || STATUS_META.waiting;
    const statusHint = isGroupMode ? statusMeta.hintGroup : statusMeta.hintIndividual;

    return (
        <TeacherLayout
            title="Sessions & Lobby"
            subtitle="Gumawa ng Class PIN (Per Grupo o Indibidwal), subaybayan ang mga nakapasok, at simulan ang laro."
            toolbarRight={
                <div className="w-full sm:w-auto flex items-center gap-2">
                    <select
                        value={selectedId || ''}
                        onChange={(e) => setSelectedId(Number(e.target.value))}
                        className="flex-1 sm:flex-initial min-w-0 h-10 sm:h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800 focus:outline-none focus:border-slate-400"
                    >
                        {sessions.map((s) => (
                            <option key={s.id} value={s.id}>
                                {s.class_name} ({s.join_code}) · {s.play_mode === 'individual' ? 'Solo' : 'Grupo'} · {s.status}
                            </option>
                        ))}
                    </select>
                    <button
                        type="button"
                        onClick={() => setShowCreate(!showCreate)}
                        className="h-10 sm:h-9 inline-flex items-center gap-1.5 px-3.5 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 transition cursor-pointer shrink-0"
                    >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Bagong Sesyon</span>
                    </button>
                </div>
            }
        >
            {showCreate && (
                <form
                    onSubmit={handleCreateSession}
                    className="rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] p-5 mb-5 space-y-4"
                >
                    <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100">
                        <div>
                            <h2 className="text-sm font-bold text-slate-900">
                                Gumawa ng Bagong Sesyon{' '}
                                <span className="font-normal text-slate-400">/ New Session</span>
                            </h2>
                            <p className="text-xs text-slate-500 mt-0.5">
                                Piliin kung Per Grupo (1 device bawat pangkat) o Indibidwal (solo, walang grupo). Magsisimula ito sa Waiting status.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => setShowCreate(false)}
                            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Play Mode Selector */}
                    <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-2">
                            Uri ng Laro <span className="text-slate-400 font-normal">/ Game Mode</span>
                        </label>
                        <div className="grid sm:grid-cols-2 gap-3">
                            <button
                                type="button"
                                onClick={() => setCreateForm({ ...createForm, play_mode: 'group' })}
                                className={`p-3.5 rounded-xl border text-left transition cursor-pointer flex items-start gap-3 ${
                                    createForm.play_mode === 'group'
                                        ? 'border-[#C2410C] bg-orange-50/70'
                                        : 'border-slate-200 bg-white hover:bg-slate-50'
                                }`}
                            >
                                <div
                                    className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                                        createForm.play_mode === 'group'
                                            ? 'bg-[#C2410C] text-white'
                                            : 'bg-slate-100 text-slate-500'
                                    }`}
                                >
                                    <Users className="w-4 h-4" />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-xs font-bold text-slate-900">
                                        Per Grupo <span className="font-normal text-slate-500">(1 Device / Pangkat)</span>
                                    </p>
                                    <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                                        Isang device lang kada grupo at tulungan sa pagsagot. Awtomatikong Pangkat 1, 2, 3... at editable ang pangalan habang Waiting.
                                    </p>
                                </div>
                            </button>

                            <button
                                type="button"
                                onClick={() => setCreateForm({ ...createForm, play_mode: 'individual' })}
                                className={`p-3.5 rounded-xl border text-left transition cursor-pointer flex items-start gap-3 ${
                                    createForm.play_mode === 'individual'
                                        ? 'border-slate-900 bg-slate-50'
                                        : 'border-slate-200 bg-white hover:bg-slate-50'
                                }`}
                            >
                                <div
                                    className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                                        createForm.play_mode === 'individual'
                                            ? 'bg-slate-900 text-white'
                                            : 'bg-slate-100 text-slate-500'
                                    }`}
                                >
                                    <User className="w-4 h-4" />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-xs font-bold text-slate-900">
                                        Indibidwal <span className="font-normal text-slate-500">(Solo, Walang Grupo)</span>
                                    </p>
                                    <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                                        Kanya-kanyang device at sariling puntos (/50). Walang pangkat na bubuuin — direktang Individual Ranking.
                                    </p>
                                </div>
                            </button>
                        </div>
                    </div>

                    <div className="grid sm:grid-cols-3 gap-3.5">
                        <div>
                            <label className="block text-[11px] font-semibold text-slate-700 mb-1.5">
                                Pangalan ng Klase <span className="text-slate-400 font-normal">/ Class Name</span>
                            </label>
                            <input
                                type="text"
                                value={createForm.class_name}
                                onChange={(e) => setCreateForm({ ...createForm, class_name: e.target.value })}
                                placeholder="Hal. Grade 7 - Mabini"
                                className="w-full h-9 rounded-lg border border-slate-200 bg-slate-50/50 px-3 text-xs text-slate-900 focus:bg-white focus:border-[#C2410C] outline-none"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-[11px] font-semibold text-slate-700 mb-1.5">
                                Aralin <span className="text-slate-400 font-normal">/ Lesson</span>
                            </label>
                            <select
                                value={createForm.lesson_id}
                                onChange={(e) => setCreateForm({ ...createForm, lesson_id: e.target.value })}
                                className="w-full h-9 rounded-lg border border-slate-200 bg-slate-50/50 px-3 text-xs text-slate-900 focus:bg-white focus:border-[#C2410C] outline-none"
                            >
                                {lessons.map((l) => (
                                    <option key={l.id} value={l.id}>
                                        {l.title}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-[11px] font-semibold text-slate-700 mb-1.5">
                                Custom PIN <span className="text-slate-400 font-normal">(Optional)</span>
                            </label>
                            <input
                                type="text"
                                value={createForm.join_code}
                                onChange={(e) =>
                                    setCreateForm({ ...createForm, join_code: e.target.value.toUpperCase() })
                                }
                                placeholder="Auto-generated"
                                className="w-full h-9 rounded-lg border border-slate-200 bg-slate-50/50 px-3 text-xs font-mono uppercase text-slate-900 focus:bg-white focus:border-[#C2410C] outline-none"
                            />
                        </div>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-1">
                        <button
                            type="button"
                            onClick={() => setShowCreate(false)}
                            className="h-9 px-3.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
                        >
                            Kanselahin
                        </button>
                        <button
                            type="submit"
                            disabled={busy}
                            className="h-9 px-4 rounded-lg bg-[#C2410C] text-white text-xs font-semibold hover:bg-[#9A3412] disabled:opacity-60 cursor-pointer"
                        >
                            {busy ? 'Gumagawa...' : 'Gumawa ng Sesyon'}
                        </button>
                    </div>
                </form>
            )}

            {lobby && (
                <div className="space-y-5">
                    {/* Clean 2-Card Command Row */}
                    <div className="grid lg:grid-cols-12 gap-4">
                        {/* Card 1: Class PIN & Game Status */}
                        <section className="lg:col-span-7 rounded-2xl border border-slate-200/90 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] p-5 flex flex-col justify-between gap-4">
                            <div className="flex flex-wrap items-start justify-between gap-4">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                                            Class PIN
                                        </p>
                                        <span
                                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold ${
                                                isGroupMode
                                                    ? 'bg-orange-50 text-[#C2410C] border border-orange-200/80'
                                                    : 'bg-slate-100 text-slate-700 border border-slate-200/80'
                                            }`}
                                        >
                                            {isGroupMode ? (
                                                <>
                                                    <Users className="w-3 h-3" />
                                                    <span>Per Grupo · 1 Device</span>
                                                </>
                                            ) : (
                                                <>
                                                    <User className="w-3 h-3" />
                                                    <span>Indibidwal · Solo</span>
                                                </>
                                            )}
                                        </span>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-2 mt-1.5">
                                        <span className="text-3xl font-extrabold tracking-widest font-mono text-[#C2410C] leading-none">
                                            {lobby.join_code}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={handleCopy}
                                            className="h-7 px-2.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-[11px] font-semibold text-slate-700 inline-flex items-center gap-1.5 transition cursor-pointer"
                                        >
                                            {copied ? (
                                                <Check className="w-3.5 h-3.5 text-emerald-600" />
                                            ) : (
                                                <Copy className="w-3.5 h-3.5 text-slate-500" />
                                            )}
                                            <span>{copied ? 'Nakopya' : 'Kopyahin'}</span>
                                        </button>
                                        {lobby.offline_join_qr && (
                                            <button
                                                type="button"
                                                onClick={() => setShowJoinQr(true)}
                                                className="h-7 px-2.5 rounded-lg border border-orange-200 bg-orange-50/80 hover:bg-orange-100 text-[11px] font-semibold text-[#C2410C] inline-flex items-center gap-1.5 transition cursor-pointer"
                                            >
                                                <QrCode className="w-3.5 h-3.5" />
                                                <span>Offline QR</span>
                                            </button>
                                        )}
                                    </div>
                                    <p className="text-xs text-slate-500 mt-2">
                                        {lobby.class_name}
                                    </p>
                                </div>

                                {/* 1-Line Segmented Control (Full-width touch-friendly grid on mobile, compact inline on sm+) */}
                                <div className="w-full sm:w-auto flex flex-col items-start sm:items-end gap-1.5">
                                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                                        Status ng Laro
                                    </p>
                                    <div className="w-full sm:w-auto grid grid-cols-3 sm:inline-flex items-center rounded-xl bg-slate-100 p-1 border border-slate-200/70">
                                        {(['waiting', 'active', 'finished']).map((st) => {
                                            const meta = STATUS_META[st];
                                            const isSelected = lobby.status === st;
                                            return (
                                                <button
                                                    key={st}
                                                    type="button"
                                                    disabled={busy}
                                                    onClick={() => handleStatus(st)}
                                                    className={`min-h-[38px] sm:min-h-0 inline-flex items-center justify-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                                                        isSelected
                                                            ? meta.activePill
                                                            : 'text-slate-500 hover:text-slate-800'
                                                    }`}
                                                >
                                                    <span
                                                        className={`w-1.5 h-1.5 rounded-full ${
                                                            isSelected ? meta.dotClass : 'bg-slate-300'
                                                        }`}
                                                    />
                                                    {meta.shortLabel}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>

                            <div className="pt-3.5 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <p className="text-xs text-slate-500 leading-snug max-w-md">
                                    {statusHint}
                                </p>

                                {lobby.status === 'waiting' && (
                                    <button
                                        type="button"
                                        disabled={busy}
                                        onClick={() => handleStatus('active')}
                                        className="w-full sm:w-auto min-h-[44px] sm:min-h-0 sm:h-9 px-4 rounded-xl bg-[#15803D] hover:bg-[#166534] text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 shadow-xs transition cursor-pointer shrink-0"
                                    >
                                        <Play className="w-3.5 h-3.5 fill-current" />
                                        <span>Simulan ang Laro</span>
                                    </button>
                                )}
                                {lobby.status === 'active' && (
                                    <button
                                        type="button"
                                        disabled={busy}
                                        onClick={() => handleStatus('finished')}
                                        className="w-full sm:w-auto min-h-[44px] sm:min-h-0 sm:h-9 px-3.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition cursor-pointer shrink-0"
                                    >
                                        <Square className="w-3 h-3 fill-current" />
                                        <span>Tapusin ang Laro</span>
                                    </button>
                                )}
                                {lobby.status === 'finished' && (
                                    <button
                                        type="button"
                                        disabled={busy}
                                        onClick={() => handleStatus('waiting')}
                                        className="w-full sm:w-auto min-h-[44px] sm:min-h-0 sm:h-9 px-3.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition cursor-pointer shrink-0"
                                    >
                                        <RotateCcw className="w-3.5 h-3.5" />
                                        <span>Ibalik sa Waiting</span>
                                    </button>
                                )}
                            </div>
                        </section>

                        {/* Card 2: Lobby Status & Room Access Lock (Zero Obsolete Shuffle/Divide Controls) */}
                        <section className="lg:col-span-5 rounded-2xl border border-slate-200/90 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] p-5 flex flex-col justify-between gap-4">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                                            {isGroupMode ? 'Mga Nakapasok na Pangkat' : 'Mga Nakapasok na Mag-aaral'}
                                        </p>
                                        {lobby.groups_locked && (
                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 border border-rose-200 text-rose-700">
                                                <Lock className="w-2.5 h-2.5" />
                                                Sarado
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-baseline gap-2 mt-1">
                                        <span className="text-3xl font-extrabold text-slate-900 tabular-nums leading-none">
                                            {isGroupMode ? lobby.groups.length : lobby.total_students}
                                        </span>
                                        <span className="text-xs font-medium text-slate-500">
                                            {isGroupMode ? 'pangkat (1 device bawat grupo)' : 'solo players'}
                                        </span>
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    disabled={busy}
                                    onClick={handleToggleLock}
                                    className={`h-9 px-3 rounded-xl text-xs font-semibold border inline-flex items-center gap-1.5 transition cursor-pointer shrink-0 ${
                                        lobby.groups_locked
                                            ? 'bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100/80'
                                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                                    }`}
                                >
                                    {lobby.groups_locked ? (
                                        <Unlock className="w-3.5 h-3.5" />
                                    ) : (
                                        <Lock className="w-3.5 h-3.5" />
                                    )}
                                    <span>{lobby.groups_locked ? 'Buksan ang Pagsali' : 'Isara ang Pagsali'}</span>
                                </button>
                            </div>

                            <p className="text-xs text-slate-500 leading-relaxed pt-3 border-t border-slate-100">
                                {isGroupMode
                                    ? 'Awtomatikong nagkakaroon ng Pangkat 1, 2, 3... ang bawat device na sasali. Pindutin ang lapis sa card upang i-edit ang pangalan o miyembro ng grupo.'
                                    : 'Walang pangkat sa Indibidwal mode — bawat mag-aaral ay sasagot nang solo at direktang iraranggo sa Live Monitor.'}
                            </p>
                        </section>
                    </div>

                    {/* GROUP MODE: Auto-Assigned 1-Device Teams */}
                    {isGroupMode ? (
                        lobby.groups.length === 0 ? (
                            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 sm:p-10 text-center">
                                <div className="w-11 h-11 rounded-2xl bg-orange-50 border border-orange-200/70 text-[#C2410C] mx-auto flex items-center justify-center">
                                    <Users className="w-5 h-5" />
                                </div>
                                <h3 className="text-sm font-bold text-slate-900 mt-3.5">
                                    Naghihintay ng mga Pangkat
                                </h3>
                                <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                                    Isang device lang ang gagamitin ng bawat pangkat at awtomatiko silang lalabas dito.
                                </p>

                                <div className="grid sm:grid-cols-2 gap-3 mt-6 max-w-2xl mx-auto text-left">
                                    <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-4">
                                        <span className="inline-flex w-5 h-5 rounded-md bg-slate-900 text-white text-[11px] font-bold items-center justify-center">
                                            1
                                        </span>
                                        <p className="text-xs font-bold text-slate-900 mt-2">Ibahagi ang PIN ({lobby.join_code})</p>
                                        <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                                            Papasukin ang 1 device bawat pangkat. Awtomatiko silang magiging <strong>Pangkat 1, 2, 3...</strong> at maaari nilang palitan ang pangalan + ilista ang miyembro habang Waiting.
                                        </p>
                                    </div>
                                    <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-4">
                                        <span className="inline-flex w-5 h-5 rounded-md bg-[#15803D] text-white text-[11px] font-bold items-center justify-center">
                                            2
                                        </span>
                                        <p className="text-xs font-bold text-slate-900 mt-2">Simulan ang Laro</p>
                                        <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                                            Kapag kumpleto na ang mga grupo, pindutin ang <strong>Simulan ang Laro</strong> — magla-lock ang pangalan ng pangkat at magbubukas ang Mapa 1.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {lobby.groups.map((group) => {
                                    const isEditing = editingGroupId === group.id;
                                    const memberList = parseMemberList(group.member_names);

                                    return (
                                        <div
                                            key={group.id}
                                            className="rounded-2xl border border-slate-200/90 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)] overflow-hidden flex flex-col"
                                        >
                                            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/60">
                                                {isEditing ? (
                                                    <div className="space-y-2">
                                                        <div>
                                                            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                                                                Pangalan ng Pangkat
                                                            </label>
                                                            <input
                                                                type="text"
                                                                maxLength={25}
                                                                autoFocus
                                                                value={editingGroupName}
                                                                onChange={(e) => {
                                                                    setEditingGroupName(e.target.value);
                                                                    setRenameError('');
                                                                }}
                                                                placeholder="Hal. RIZZTAN"
                                                                className="w-full h-8 rounded-lg border border-[#C2410C] bg-white px-2.5 text-xs font-semibold text-slate-900 focus:outline-none"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                                                                Mga Miyembro (Optional)
                                                            </label>
                                                            <textarea
                                                                rows={2}
                                                                maxLength={400}
                                                                value={editingMemberNames}
                                                                onChange={(e) => {
                                                                    setEditingMemberNames(e.target.value);
                                                                    setRenameError('');
                                                                }}
                                                                placeholder="Hal. Ana, Ben, Carl, Dan, Eva"
                                                                className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-[#C2410C] focus:outline-none"
                                                            />
                                                        </div>
                                                        {renameError && (
                                                            <p className="text-[11px] font-semibold text-rose-600">
                                                                {renameError}
                                                            </p>
                                                        )}
                                                        <div className="flex items-center justify-end gap-1.5">
                                                            <button
                                                                type="button"
                                                                onClick={cancelEditGroup}
                                                                className="h-7 px-2.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
                                                            >
                                                                Kanselahin
                                                            </button>
                                                            <button
                                                                type="button"
                                                                disabled={savingGroupId === group.id}
                                                                onClick={() => handleSaveGroup(group.id)}
                                                                className="h-7 px-3 rounded-lg bg-[#15803D] text-white text-xs font-semibold hover:bg-[#166534] disabled:opacity-50 inline-flex items-center gap-1 cursor-pointer"
                                                            >
                                                                <Check className="w-3.5 h-3.5" />
                                                                <span>I-save</span>
                                                            </button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center justify-between gap-2">
                                                        <div className="flex items-center gap-2 min-w-0">
                                                            <span className="px-1.5 py-0.5 rounded-md bg-white border border-slate-200 text-[10px] font-bold text-slate-500 tabular-nums shrink-0">
                                                                #{group.group_number}
                                                            </span>
                                                            <h3 className="font-bold text-slate-900 text-sm truncate">
                                                                {group.group_name}
                                                            </h3>
                                                            <button
                                                                type="button"
                                                                onClick={() => startEditGroup(group)}
                                                                title="I-edit ang pangalan at miyembro"
                                                                className="p-1 rounded-md text-slate-400 hover:text-[#C2410C] hover:bg-white cursor-pointer shrink-0 transition"
                                                            >
                                                                <Pencil className="w-3.5 h-3.5" />
                                                            </button>
                                                        </div>
                                                        <span className="px-2 py-0.5 rounded-md bg-white border border-slate-200 text-[11px] font-semibold text-slate-600 tabular-nums shrink-0">
                                                            Mapa {group.current_map_number}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>

                                            <div className="p-4 space-y-3 flex-1">
                                                <div className="flex items-center justify-between gap-2 text-xs">
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <span className="w-6 h-6 rounded-full bg-orange-50 border border-orange-200/70 text-[#C2410C] text-[10px] font-bold flex items-center justify-center shrink-0">
                                                            {getInitials(group.leader_name || group.group_name)}
                                                        </span>
                                                        <div className="min-w-0">
                                                            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 leading-none">
                                                                Kinatawan / Device
                                                            </p>
                                                            <p className="font-semibold text-slate-800 truncate mt-0.5">
                                                                {group.leader_name || 'Naka-konekta'}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    {group.joined_at && (
                                                        <span className="text-[11px] text-slate-400 shrink-0">
                                                            {group.joined_at}
                                                        </span>
                                                    )}
                                                </div>

                                                <div className="pt-2.5 border-t border-slate-100">
                                                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                                                        Mga Miyembro
                                                    </p>
                                                    {memberList.length > 0 ? (
                                                        <div className="flex flex-wrap gap-1.5">
                                                            {memberList.map((name, i) => (
                                                                <span
                                                                    key={`${group.id}-m-${i}`}
                                                                    className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[11px] font-medium"
                                                                >
                                                                    {name}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <p className="text-[11px] text-slate-400 italic">
                                                            Wala pang nailistang karagdagang miyembro.
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )
                    ) : (
                        /* INDIVIDUAL MODE: Clean Solo Roster (Zero Group UI!) */
                        (lobby.participants || []).length === 0 ? (
                            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 sm:p-10 text-center">
                                <div className="w-11 h-11 rounded-2xl bg-slate-100 border border-slate-200 text-slate-700 mx-auto flex items-center justify-center">
                                    <User className="w-5 h-5" />
                                </div>
                                <h3 className="text-sm font-bold text-slate-900 mt-3.5">
                                    Naghihintay ng mga Mag-aaral (Indibidwal Mode)
                                </h3>
                                <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                                    Ibahagi ang PIN <strong className="font-mono text-[#C2410C]">{lobby.join_code}</strong> upang makasali ang bawat mag-aaral sa kanilang sariling device, pagkatapos ay pindutin ang <strong>Simulan ang Laro</strong>.
                                </p>
                            </div>
                        ) : (
                            <div className="rounded-2xl border border-slate-200/90 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)] overflow-hidden">
                                <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between">
                                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                                        Mga Nakapasok na Mag-aaral ({lobby.participants.length})
                                    </h3>
                                </div>
                                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5 p-4">
                                    {lobby.participants.map((p) => (
                                        <div
                                            key={p.user_id}
                                            className="rounded-xl border border-slate-200/80 bg-slate-50/40 px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs"
                                        >
                                            <div className="flex items-center gap-2.5 min-w-0">
                                                <span className="w-7 h-7 rounded-full bg-white border border-slate-200 text-slate-700 text-[10px] font-bold flex items-center justify-center shrink-0">
                                                    {getInitials(p.name)}
                                                </span>
                                                <div className="min-w-0">
                                                    <p className="font-semibold text-slate-900 truncate">{p.name}</p>
                                                    {p.joined_at && (
                                                        <p className="text-[10px] text-slate-400">{p.joined_at}</p>
                                                    )}
                                                </div>
                                            </div>
                                            <span className="px-2 py-0.5 rounded-md bg-white border border-slate-200 text-[11px] font-medium text-slate-600 tabular-nums shrink-0">
                                                Mapa {p.current_map_number}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )
                    )}
                </div>
            )}

            {/* Projector-Friendly Offline Join QR Modal */}
            {showJoinQr && lobby?.offline_join_qr && (
                <div
                    className="fixed inset-0 z-50 bg-slate-900/55 backdrop-blur-xs flex items-center justify-center p-4"
                    onClick={() => setShowJoinQr(false)}
                >
                    <div
                        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
                            <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                    <QrCode className="w-4 h-4 text-[#C2410C] shrink-0" />
                                    <h3 className="text-sm font-extrabold text-slate-900 truncate">
                                        Offline Join QR
                                    </h3>
                                </div>
                                <p className="text-xs text-slate-500 truncate mt-0.5">
                                    {lobby.class_name} · {isGroupMode ? 'Per Grupo (1 Device)' : 'Indibidwal (Solo)'}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowJoinQr(false)}
                                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer shrink-0"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="p-6 text-center space-y-4">
                            <div className="inline-block bg-white p-3.5 rounded-2xl border-2 border-slate-900 shadow-xs">
                                <QrCodeImage
                                    value={lobby.offline_join_qr}
                                    size={248}
                                    alt="JuanQuest Offline Join QR"
                                    className="w-[228px] h-[228px] sm:w-[248px] sm:h-[248px]"
                                />
                            </div>

                            <div className="flex items-center justify-center gap-2.5">
                                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                                    Class PIN:
                                </span>
                                <span className="text-2xl font-extrabold tracking-widest font-mono text-[#C2410C]">
                                    {lobby.join_code}
                                </span>
                            </div>

                            <p className="text-xs text-slate-600 leading-relaxed max-w-sm mx-auto">
                                Para sa mga device na <strong>walang Wi-Fi o data</strong>: buksan ang naka-install na{' '}
                                <strong>JuanQuest App</strong> at i-scan ang QR na ito upang makasali at makapaglaro nang offline.
                                Pagkatapos ng Mapa 5, i-scan ang kanilang <strong>Result QR</strong> sa Live Monitor.
                            </p>

                            <div className="pt-1 flex items-center justify-center gap-2">
                                <button
                                    type="button"
                                    onClick={handleCopy}
                                    className="h-9 px-3.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5 cursor-pointer transition"
                                >
                                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                                    <span>{copied ? 'Nakopya ang PIN' : 'Kopyahin ang PIN'}</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setShowJoinQr(false)}
                                    className="h-9 px-5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer transition"
                                >
                                    Isara
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </TeacherLayout>
    );
}
