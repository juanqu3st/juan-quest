import { useEffect, useState } from 'react';
import {
    DndContext,
    DragOverlay,
    PointerSensor,
    useDraggable,
    useDroppable,
    useSensor,
    useSensors,
} from '@dnd-kit/core';
import { CheckCircle2, GripVertical, Link2, RotateCcw, X, XCircle } from 'lucide-react';
import { resolveStorageUrl } from '../../api/axiosClient';

export default function MatchingGame({ challenges, onSubmit, busy, lastDetails, savedPairs, onSavePairs }) {
    const challenge = challenges[0];
    const [pairs, setPairs] = useState(() => savedPairs || {});
    const [selectedLeftId, setSelectedLeftId] = useState(null);
    const [activeDragItem, setActiveDragItem] = useState(null);

    // Single PointerSensor handles mouse, trackpad, pen, AND mobile touch cleanly with `touch-none`
    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

    useEffect(() => {
        onSavePairs?.(pairs);
    }, [pairs, onSavePairs]);

    if (!challenge) return null;

    const columnA = challenge.payload.column_a || [];
    const columnB = challenge.payload.column_b || [];
    const pairStatus = lastDetails?.pair_status || {};
    const imageUrl = resolveStorageUrl(challenge.payload.image);

    const assignPair = (leftId, rightId) => {
        setPairs((prev) => {
            const next = { ...prev };
            Object.keys(next).forEach((k) => {
                if (next[k] === rightId) delete next[k];
            });
            next[leftId] = rightId;
            return next;
        });
        setSelectedLeftId(null);
    };

    const unassignPair = (leftId) => {
        setPairs((prev) => {
            const next = { ...prev };
            delete next[leftId];
            return next;
        });
    };

    const handleDragStart = (event) => {
        const rightId = String(event.active.id).replace('right-', '');
        setActiveDragItem(columnB.find((b) => String(b.id) === rightId) || null);
    };

    const handleDragEnd = (event) => {
        const { active, over } = event;
        setActiveDragItem(null);
        if (!over) return;
        const rightId = String(active.id).replace('right-', '');
        const leftId = String(over.id).replace('left-', '');
        if (rightId && leftId) {
            assignPair(leftId, rightId);
        }
    };

    const usedRightIds = Object.values(pairs);
    const matchedCount = Object.keys(pairs).length;
    const allMatched = matchedCount === columnA.length && columnA.length > 0;

    return (
        <DndContext
            sensors={sensors}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={() => setActiveDragItem(null)}
        >
            <div className="flex-1 flex flex-col justify-between gap-5">
                <div className="space-y-4">
                    {/* Large crisp uncropped scene illustration */}
                    {imageUrl && (
                        <div className="w-full max-w-lg mx-auto aspect-video rounded-xl overflow-hidden border border-stone-200 bg-stone-100">
                            <img
                                src={imageUrl}
                                alt="Eksena ng Sanhi at Bunga"
                                className="w-full h-full object-cover object-center"
                                loading="eager"
                            />
                        </div>
                    )}

                    {/* Clean prompt & helper */}
                    <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                            <h3 className="text-base sm:text-lg font-bold text-stone-900 leading-snug">
                                {challenge.payload.prompt}
                            </h3>
                            <p className="text-xs sm:text-[13px] text-stone-500">
                                {selectedLeftId
                                    ? `Napili ang #${selectedLeftId} sa Hanay A — i-tap ngayon ang katugma sa Hanay B.`
                                    : `I-tap ang Hanay A at piliin ang katugma sa Hanay B, o i-drag sa handle (${matchedCount}/${columnA.length}).`}
                            </p>
                        </div>
                        <button
                            type="button"
                            disabled={matchedCount === 0}
                            onClick={() => {
                                setPairs({});
                                setSelectedLeftId(null);
                            }}
                            className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-stone-200 bg-white hover:bg-stone-50 text-xs font-semibold text-stone-600 disabled:opacity-40 transition cursor-pointer shrink-0 disabled:cursor-not-allowed"
                        >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>Ulitin</span>
                        </button>
                    </div>

                    {/* Two-Column Matching Board */}
                    <div className="grid md:grid-cols-2 gap-4">
                        <div className="space-y-2.5">
                            <h4 className="text-xs font-semibold text-stone-500">Hanay A — Pangyayari</h4>
                            {columnA.map((item) => {
                                const assignedRightId = pairs[item.id];
                                const assignedRight = columnB.find((b) => b.id === assignedRightId);
                                const status = pairStatus[item.id];

                                return (
                                    <DroppableLeftSlot
                                        key={item.id}
                                        item={item}
                                        isSelected={selectedLeftId === item.id}
                                        assignedRight={assignedRight}
                                        pairStatus={status}
                                        onClick={() =>
                                            setSelectedLeftId(selectedLeftId === item.id ? null : item.id)
                                        }
                                        onUnlink={() => unassignPair(item.id)}
                                    />
                                );
                            })}
                        </div>

                        <div className="space-y-2.5">
                            <h4 className="text-xs font-semibold text-stone-500">Hanay B — Paliwanag / Bunga</h4>
                            {columnB.map((item) => (
                                <DraggableRightCard
                                    key={item.id}
                                    item={item}
                                    isUsed={usedRightIds.includes(item.id)}
                                    canClickPair={Boolean(selectedLeftId)}
                                    onClick={() => {
                                        if (selectedLeftId) assignPair(selectedLeftId, item.id);
                                    }}
                                />
                            ))}
                        </div>
                    </div>
                </div>

                <div className="pt-2 border-t border-stone-200/80">
                    <button
                        type="button"
                        disabled={busy || !allMatched}
                        onClick={() => onSubmit(challenge.id, { pairs })}
                        className={`w-full min-h-[48px] py-2.5 px-6 rounded-xl font-semibold text-sm transition tabular-nums ${
                            busy || !allMatched
                                ? 'bg-stone-200 text-stone-500 cursor-not-allowed'
                                : 'bg-[#C2410C] hover:bg-[#9A3412] text-white cursor-pointer'
                        }`}
                    >
                        {busy
                            ? 'Sinusuri...'
                            : allMatched
                              ? 'Isumite ang Tugma'
                              : `Itugma ang lahat (${matchedCount}/${columnA.length})`}
                    </button>
                </div>
            </div>

            <DragOverlay dropAnimation={{ duration: 150, easing: 'ease-out' }}>
                {activeDragItem ? (
                    <div className="p-3.5 rounded-xl border-2 border-[#C2410C] bg-white shadow-lg text-[13px] flex items-start gap-2.5 cursor-grabbing select-none max-w-md">
                        <GripVertical className="w-4 h-4 text-[#C2410C] shrink-0 mt-0.5" />
                        <span className="w-5 h-5 rounded bg-stone-900 text-white text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                            {activeDragItem.id}
                        </span>
                        <span className="font-medium text-stone-900 leading-snug">{activeDragItem.text}</span>
                    </div>
                ) : null}
            </DragOverlay>
        </DndContext>
    );
}

function DroppableLeftSlot({ item, isSelected, assignedRight, pairStatus, onClick, onUnlink }) {
    const { isOver, setNodeRef } = useDroppable({ id: `left-${item.id}` });

    return (
        <div
            ref={setNodeRef}
            onClick={onClick}
            className={`p-3.5 rounded-xl border transition-colors cursor-pointer ${
                isOver || isSelected
                    ? 'border-[#C2410C] bg-orange-50/50'
                    : pairStatus === true
                      ? 'border-emerald-300 bg-emerald-50/60'
                      : pairStatus === false
                        ? 'border-rose-300 bg-rose-50/60'
                        : 'border-stone-200 bg-white hover:border-stone-300'
            }`}
        >
            <div className="flex items-start gap-2.5">
                <span className="text-xs font-bold text-stone-400 tabular-nums pt-0.5">{item.id}.</span>
                <span className="text-[13px] font-medium text-stone-800 leading-snug flex-1">
                    {item.text}
                </span>
                {pairStatus === true && <CheckCircle2 className="w-4 h-4 text-[#15803D] shrink-0 mt-0.5" />}
                {pairStatus === false && <XCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />}
            </div>

            <div className="mt-2.5 pt-2 border-t border-stone-100 flex items-center justify-between gap-2 text-xs">
                {assignedRight ? (
                    <>
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                            <span className="w-5 h-5 rounded bg-stone-900 text-white text-[11px] font-bold flex items-center justify-center shrink-0">
                                {assignedRight.id}
                            </span>
                            <span className="font-medium text-stone-700 truncate">{assignedRight.text}</span>
                        </div>
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                onUnlink();
                            }}
                            aria-label={`Alisin ang tugma sa ${item.id}`}
                            title="Alisin ang tugma"
                            className="p-0.5 rounded text-stone-400 hover:text-rose-600 transition cursor-pointer shrink-0"
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                    </>
                ) : (
                    <span className="inline-flex items-center gap-1.5 text-[11px] text-stone-400">
                        <Link2 className="w-3.5 h-3.5 shrink-0" />
                        {isSelected ? 'Pumili sa Hanay B...' : 'I-drag o i-click ang katugma'}
                    </span>
                )}
            </div>
        </div>
    );
}

function DraggableRightCard({ item, isUsed, canClickPair, onClick }) {
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id: `right-${item.id}`,
    });

    return (
        <div
            ref={setNodeRef}
            onClick={onClick}
            className={`p-3 sm:p-3.5 rounded-xl border text-[13px] transition-colors select-none flex items-start gap-2.5 ${
                isDragging
                    ? 'border-dashed border-[#C2410C]/60 bg-orange-50/40 opacity-40'
                    : isUsed
                      ? 'border-stone-200 bg-stone-100 text-stone-400 cursor-pointer'
                      : canClickPair
                        ? 'border-[#C2410C] bg-orange-50/40 hover:bg-orange-50 cursor-pointer'
                        : 'border-stone-200 bg-white hover:border-stone-400 cursor-pointer'
            }`}
        >
            {/* Dedicated drag handle keeps normal vertical page scrolling smooth on phones! */}
            <button
                type="button"
                {...listeners}
                {...attributes}
                onClick={(e) => e.stopPropagation()}
                aria-label={`I-drag ang ${item.id}`}
                className="hidden md:inline-flex w-7 h-7 rounded-md bg-stone-50 hover:bg-stone-100 text-stone-400 items-center justify-center shrink-0 touch-none cursor-grab active:cursor-grabbing"
            >
                <GripVertical className="w-4 h-4" />
            </button>
            <span
                className={`w-6 h-6 rounded-md text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5 ${
                    isUsed ? 'bg-stone-200 text-stone-500' : 'bg-stone-900 text-white'
                }`}
            >
                {item.id}
            </span>
            <span className={`leading-snug flex-1 pt-0.5 ${isUsed ? 'line-through' : 'font-medium text-stone-800'}`}>
                {item.text}
            </span>
        </div>
    );
}
