import { useEffect, useState } from 'react';
import { Check, Lock, Pencil, User, Users, X } from 'lucide-react';
import { studentApi } from '../../api/studentApi';
import { useToast } from '../../context/ToastContext';

function parseMemberList(memberNames) {
    if (!memberNames) return [];
    return memberNames
        .split(/[\n,;]+/)
        .map((s) => s.trim())
        .filter(Boolean);
}

export default function MyGroupModal({ open, onClose, session, onRenamed }) {
    const { showToast } = useToast();
    const [groupName, setGroupName] = useState(session?.group_name || '');
    const [memberNames, setMemberNames] = useState(session?.member_names || '');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (open) {
            setGroupName(session?.group_name || '');
            setMemberNames(session?.member_names || '');
            setError('');
        }
    }, [open, session?.group_id, session?.group_name, session?.member_names]);

    if (!open || !session || session.play_mode !== 'group') return null;

    const canRename = Boolean(session.can_rename_group);
    const trimmedName = groupName.replace(/\s+/g, ' ').trim();
    const trimmedMembers = memberNames.trim();
    const isUnchanged =
        trimmedName === (session.group_name || '').trim() &&
        trimmedMembers === (session.member_names || '').trim();
    const savedMemberList = parseMemberList(session.member_names);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!canRename || saving) return;

        if (trimmedName.length < 2) {
            setError('Ang pangalan ng pangkat ay dapat may hindi bababa sa 2 letra.');
            return;
        }
        if (trimmedName.length > 25) {
            setError('Ang pangalan ng pangkat ay hanggang 25 karakter lamang.');
            return;
        }

        setSaving(true);
        setError('');
        try {
            const res = await studentApi.renameGroup({
                group_name: trimmedName,
                member_names: trimmedMembers,
            });
            setGroupName(res.group_name);
            setMemberNames(res.member_names || '');
            if (onRenamed) {
                await onRenamed(res.group_name);
            }
            onClose();
        } catch (err) {
            const serverMsg =
                err?.response?.data?.errors?.group_name?.[0] ||
                err?.response?.data?.errors?.member_names?.[0] ||
                err?.response?.data?.message ||
                'Hindi na-save ang detalye ng pangkat.';
            setError(serverMsg);
            showToast('error', serverMsg, 'Hindi na-save.');
            if (onRenamed) {
                onRenamed(null).catch?.(() => {});
            }
        } finally {
            setSaving(false);
        }
    };

    return (
        <div
            className="fixed inset-0 z-50 bg-stone-950/45 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-0 sm:p-4"
            onClick={onClose}
        >
            <div
                className="w-full max-w-md bg-[#FAF8F5] border-t sm:border border-stone-200/90 rounded-t-3xl sm:rounded-2xl overflow-hidden shadow-xl max-h-[90dvh] flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Apple HIG Mobile Sheet Handle */}
                <div className="sm:hidden bg-white pt-2.5 pb-0.5 flex justify-center shrink-0">
                    <div className="w-10 h-1 rounded-full bg-stone-300" />
                </div>

                {/* Header */}
                <div className="bg-white border-b border-stone-200/80 px-5 py-3.5 sm:py-4 flex items-center justify-between gap-3 shrink-0">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-xl bg-orange-50 border border-orange-200/80 flex items-center justify-center shrink-0">
                            <Users className="w-4 h-4 text-[#C2410C]" />
                        </div>
                        <div className="min-w-0">
                            <h2 className="text-sm font-bold text-stone-900 truncate">
                                Aking Pangkat{' '}
                                <span className="font-normal text-stone-400">/ Team Setup</span>
                            </h2>
                            <p className="text-[11px] font-medium text-stone-500 truncate mt-0.5">
                                {session.class_name} · PIN {session.join_code}
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Isara"
                        className="w-10 h-10 rounded-xl text-stone-500 hover:bg-stone-100 hover:text-stone-800 inline-flex items-center justify-center cursor-pointer transition shrink-0"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Body */}
                <div className="p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] space-y-4 overflow-y-auto flex-1">
                    {/* Group summary card */}
                    <div className="rounded-2xl bg-white border border-stone-200/90 p-4">
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
                                    Pangkat #{session.group_number || 1} · 1 Device
                                </p>
                                <h3 className="text-lg font-extrabold text-stone-900 leading-tight mt-0.5 break-words">
                                    {session.group_name || 'Pangkat'}
                                </h3>
                                {session.leader_name && (
                                    <p className="text-[11px] text-stone-500 mt-1 inline-flex items-center gap-1.5">
                                        <User className="w-3 h-3 text-stone-400" />
                                        <span>
                                            Kinatawan: <strong className="text-stone-700">{session.leader_name}</strong>
                                        </span>
                                    </p>
                                )}
                            </div>
                        </div>

                        <div className="mt-3 pt-3 border-t border-stone-100">
                            {canRename ? (
                                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#15803D]">
                                    <Pencil className="w-3.5 h-3.5" />
                                    Puwedeng i-edit ang pangalan at miyembro habang Waiting pa
                                </span>
                            ) : (
                                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-stone-500">
                                    <Lock className="w-3.5 h-3.5" />
                                    {session.status === 'finished'
                                        ? 'Naka-lock — Tapos na ang laro'
                                        : 'Naka-lock — Nagsimula na ang laro'}
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Edit form — ONLY editable while Waiting */}
                    {canRename ? (
                        <form
                            onSubmit={handleSubmit}
                            className="rounded-2xl bg-white border border-amber-200/90 p-4 space-y-3.5"
                        >
                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <label
                                        htmlFor="student-group-name-input"
                                        className="text-xs font-bold text-stone-800"
                                    >
                                        Pangalan ng Inyong Pangkat
                                    </label>
                                    <span className="text-[10px] text-stone-400 tabular-nums">
                                        {groupName.length}/25
                                    </span>
                                </div>
                                <input
                                    id="student-group-name-input"
                                    type="text"
                                    maxLength={25}
                                    value={groupName}
                                    onChange={(e) => {
                                        setGroupName(e.target.value);
                                        setError('');
                                    }}
                                    placeholder="Hal. RIZZTAN"
                                    className="w-full h-9 rounded-xl border border-stone-300 bg-[#FAF8F5] px-3 text-xs font-semibold text-stone-900 focus:bg-white focus:outline-none focus:border-[#C2410C]"
                                />
                            </div>

                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <label
                                        htmlFor="student-group-members-input"
                                        className="text-xs font-bold text-stone-800"
                                    >
                                        Mga Miyembro ng Pangkat{' '}
                                        <span className="font-normal text-stone-400">(Optional)</span>
                                    </label>
                                    <span className="text-[10px] text-stone-400 tabular-nums">
                                        {memberNames.length}/400
                                    </span>
                                </div>
                                <textarea
                                    id="student-group-members-input"
                                    rows={3}
                                    maxLength={400}
                                    value={memberNames}
                                    onChange={(e) => {
                                        setMemberNames(e.target.value);
                                        setError('');
                                    }}
                                    placeholder="Ilista ang pangalan ng lahat ng kagrupo (hal. Ana Santos, Ben Cruz, Carl Reyes, Dan Lim, Eva Go)"
                                    className="w-full rounded-xl border border-stone-300 bg-[#FAF8F5] px-3 py-2 text-xs text-stone-900 leading-relaxed focus:bg-white focus:outline-none focus:border-[#C2410C]"
                                />
                                <p className="text-[11px] text-stone-400 mt-1">
                                    Makikita ito ng inyong guro sa Live Monitor at sa Score Record.
                                </p>
                            </div>

                            <div className="flex items-center justify-between gap-2 pt-1">
                                <div className="min-h-[16px] text-[11px]">
                                    {error && <span className="font-semibold text-rose-600">{error}</span>}
                                </div>
                                <button
                                    type="submit"
                                    disabled={saving || trimmedName.length < 2 || isUnchanged}
                                    className="min-h-[44px] sm:min-h-[38px] px-5 rounded-xl bg-[#C2410C] hover:bg-[#9A3412] disabled:opacity-45 text-white text-xs sm:text-xs font-bold inline-flex items-center gap-1.5 shrink-0 cursor-pointer transition"
                                >
                                    <Check className="w-3.5 h-3.5" />
                                    <span>{saving ? 'Sine-save...' : 'I-save'}</span>
                                </button>
                            </div>
                        </form>
                    ) : (
                        <div className="rounded-2xl bg-white border border-stone-200/90 p-4 space-y-2">
                            <p className="text-[11px] font-bold uppercase tracking-wider text-stone-400">
                                Mga Miyembro ng Pangkat
                            </p>
                            {savedMemberList.length > 0 ? (
                                <div className="flex flex-wrap gap-1.5">
                                    {savedMemberList.map((name, idx) => (
                                        <span
                                            key={`m-${idx}`}
                                            className="px-2.5 py-1 rounded-lg bg-[#FAF8F5] border border-stone-200 text-xs font-medium text-stone-800"
                                        >
                                            {name}
                                        </span>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-xs text-stone-400 italic">
                                    Walang karagdagang miyembrong nakalista.
                                </p>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
