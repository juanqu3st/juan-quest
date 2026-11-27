import { Users, X } from 'lucide-react';

function parseMemberList(memberNames) {
    if (!memberNames) return [];
    return memberNames
        .split(/[\n,;]+/)
        .map((s) => s.trim())
        .filter(Boolean);
}

export default function MyGroupModal({ open, onClose, session }) {
    if (!open || !session || session.play_mode !== 'group') return null;

    const savedMemberList = parseMemberList(session.member_names);

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
                                Aking Pangkat
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
                <div className="p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] space-y-3.5 overflow-y-auto flex-1">
                    {/* Group summary card */}
                    <div className="rounded-2xl bg-white border border-stone-200/90 p-4">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
                            {session.group_number
                                ? `Pangkat #${session.group_number} · 1 Device`
                                : 'Per Grupo · 1 Device'}
                        </p>
                        <h3 className="text-lg font-extrabold text-stone-900 leading-tight mt-0.5 break-words">
                            {session.group_name || 'Aking Pangkat'}
                        </h3>
                    </div>

                    {/* Member roster card (view-only) */}
                    <div className="rounded-2xl bg-white border border-stone-200/90 p-4 space-y-2.5">
                        <div className="flex items-center justify-between gap-2">
                            <p className="text-[11px] font-bold uppercase tracking-wider text-stone-400">
                                Mga Miyembro ng Pangkat
                            </p>
                            {savedMemberList.length > 0 && (
                                <span className="text-[11px] font-semibold text-stone-400 tabular-nums">
                                    {savedMemberList.length}
                                </span>
                            )}
                        </div>
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
                                Wala pang nakalistang miyembro.
                            </p>
                        )}
                    </div>

                    <p className="text-[11px] text-stone-500 text-center leading-relaxed px-2">
                        Kung may maling spelling sa pangalan ng pangkat o miyembro, ipaayos ito sa iyong guro.
                    </p>
                </div>
            </div>
        </div>
    );
}
