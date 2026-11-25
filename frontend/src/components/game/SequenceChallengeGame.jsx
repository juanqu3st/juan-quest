import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
    DndContext,
    DragOverlay,
    MeasuringStrategy,
    MouseSensor,
    TouchSensor,
    closestCenter,
    pointerWithin,
    useDraggable,
    useDroppable,
    useSensor,
    useSensors,
} from '@dnd-kit/core';
import { RotateCcw, X } from 'lucide-react';
import { resolveStorageUrl } from '../../api/axiosClient';
import { playPairSnap, playUiTap, triggerHaptic } from '../../utils/gameAudio';

function restoreSlots(events, savedOrder) {
    const empty = Array(events.length).fill(null);
    if (!Array.isArray(savedOrder) || savedOrder.length !== events.length) return empty;
    const validIds = new Set(events.map((e) => e.id));
    const seen = new Set();
    return savedOrder.map((id) => {
        if (id === null || id === undefined) return null;
        if (!validIds.has(id) || seen.has(id)) return null;
        seen.add(id);
        return id;
    });
}

function firstEmptyIndex(slots) {
    const idx = slots.findIndex((s) => s === null);
    return idx === -1 ? null : idx;
}

function collisionDetectionStrategy(args) {
    const pointerHits = pointerWithin(args);
    if (pointerHits.length > 0) return pointerHits;
    return closestCenter(args);
}

function extractClientY(evt) {
    if (!evt) return null;
    if (typeof evt.clientY === 'number') return evt.clientY;
    if (evt.touches && evt.touches[0]) return evt.touches[0].clientY;
    if (evt.changedTouches && evt.changedTouches[0]) return evt.changedTouches[0].clientY;
    return null;
}

export default function SequenceChallengeGame({ challenges, onSubmit, busy, savedOrder, onSaveOrder }) {
    const challenge = challenges[0];
    const events = useMemo(() => challenge?.payload?.events || [], [challenge]);
    const eventsById = useMemo(() => new Map(events.map((e) => [e.id, e])), [events]);

    const [slots, setSlots] = useState(() => restoreSlots(events, savedOrder));
    const [preferredSlotIdx, setPreferredSlotIdx] = useState(null);
    const [activeDrag, setActiveDrag] = useState(null);
    const [shakeWrong, setShakeWrong] = useState(false);

    const rootRef = useRef(null);
    const pointerYRef = useRef(null);
    const suppressNextTapRef = useRef(false);
    const shakeTimerRef = useRef(null);
    const onSaveOrderRef = useRef(onSaveOrder);
    const didMountSlotsRef = useRef(false);
    onSaveOrderRef.current = onSaveOrder;

    // Mouse drags quickly (5px); touch allows natural page scroll + instant 1-tap + smooth press-hold drag
    const sensors = useSensors(
        useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
        useSensor(TouchSensor, { activationConstraint: { delay: 140, tolerance: 8 } })
    );

    useEffect(() => {
        return () => clearTimeout(shakeTimerRef.current);
    }, []);

    useEffect(() => {
        if (!didMountSlotsRef.current) {
            didMountSlotsRef.current = true;
            return;
        }
        if (slots.length > 0) {
            onSaveOrderRef.current?.(slots);
        }
    }, [slots]);

    // Bulletproof fallback edge auto-scroll inside StageModal <main> while dragging (desktop + mobile)
    useEffect(() => {
        if (!activeDrag) return undefined;

        const scrollEl = rootRef.current?.closest('main') || document.scrollingElement;
        if (!scrollEl) return undefined;

        const updatePointer = (e) => {
            const y = extractClientY(e);
            if (y !== null) pointerYRef.current = y;
        };

        window.addEventListener('pointermove', updatePointer, { passive: true });
        window.addEventListener('mousemove', updatePointer, { passive: true });
        window.addEventListener('touchmove', updatePointer, { passive: true });

        let rafId = 0;
        let lastObservedScrollTop = scrollEl.scrollTop;

        const tick = () => {
            const y = pointerYRef.current;
            const currentTop = scrollEl.scrollTop;
            const dndKitAlreadyScrolled = Math.abs(currentTop - lastObservedScrollTop) >= 1;

            if (y !== null && !dndKitAlreadyScrolled) {
                const rect = scrollEl.getBoundingClientRect();
                const edgeZone = Math.min(108, Math.max(64, rect.height * 0.22));
                const maxScroll = Math.max(0, scrollEl.scrollHeight - scrollEl.clientHeight);

                if (y < rect.top + edgeZone && currentTop > 0) {
                    const depth = Math.min(1, Math.max(0.18, (rect.top + edgeZone - y) / edgeZone));
                    scrollEl.scrollTop = Math.max(0, currentTop - Math.round(depth * 14));
                } else if (y > rect.bottom - edgeZone && currentTop < maxScroll) {
                    const depth = Math.min(1, Math.max(0.18, (y - (rect.bottom - edgeZone)) / edgeZone));
                    scrollEl.scrollTop = Math.min(maxScroll, currentTop + Math.round(depth * 14));
                }
            }

            lastObservedScrollTop = scrollEl.scrollTop;
            rafId = requestAnimationFrame(tick);
        };

        rafId = requestAnimationFrame(tick);

        return () => {
            cancelAnimationFrame(rafId);
            window.removeEventListener('pointermove', updatePointer);
            window.removeEventListener('mousemove', updatePointer);
            window.removeEventListener('touchmove', updatePointer);
        };
    }, [activeDrag]);

    const placedIdSet = useMemo(() => new Set(slots.filter(Boolean)), [slots]);
    const bankEvents = useMemo(
        () => events.filter((ev) => !placedIdSet.has(ev.id)),
        [events, placedIdSet]
    );
    const filledCount = placedIdSet.size;
    const allFilled = events.length > 0 && filledCount === events.length;
    const activeSlotIdx =
        preferredSlotIdx !== null && slots[preferredSlotIdx] === null
            ? preferredSlotIdx
            : firstEmptyIndex(slots);

    const placeEventInSlot = useCallback((eventId, targetIdx) => {
        if (targetIdx === null || targetIdx === undefined || targetIdx < 0) return;
        playPairSnap();
        setPreferredSlotIdx(null);
        setSlots((prev) => {
            const next = [...prev];
            const existingIdx = next.indexOf(eventId);
            if (existingIdx !== -1) next[existingIdx] = null;
            next[targetIdx] = eventId;
            return next;
        });
    }, []);

    const handleTapBankCard = useCallback(
        (eventId) => {
            if (busy || suppressNextTapRef.current || activeSlotIdx === null) return;
            playPairSnap();
            const targetIdx = activeSlotIdx;
            setPreferredSlotIdx(null);
            setSlots((prev) => {
                const idx = prev[targetIdx] === null ? targetIdx : firstEmptyIndex(prev);
                if (idx === null || prev.includes(eventId)) return prev;
                const next = [...prev];
                next[idx] = eventId;
                return next;
            });
        },
        [activeSlotIdx, busy]
    );

    const handleRemoveSlot = useCallback(
        (slotIdx) => {
            if (busy) return;
            playUiTap(420);
            setPreferredSlotIdx(slotIdx);
            setSlots((prev) => {
                if (prev[slotIdx] === null) return prev;
                const next = [...prev];
                next[slotIdx] = null;
                return next;
            });
        },
        [busy]
    );

    const handleResetAll = useCallback(() => {
        if (busy || filledCount === 0) return;
        playUiTap(390);
        setPreferredSlotIdx(0);
        setSlots(Array(events.length).fill(null));
    }, [busy, filledCount, events.length]);

    const handleDragStart = (event) => {
        const data = event.active.data.current;
        if (!data) return;
        suppressNextTapRef.current = true;
        const startY = extractClientY(event.activatorEvent);
        if (startY !== null) pointerYRef.current = startY;
        triggerHaptic('tap');
        setActiveDrag(data);
    };

    const handleDragEnd = (event) => {
        const { active, over } = event;
        setActiveDrag(null);
        pointerYRef.current = null;
        requestAnimationFrame(() => {
            suppressNextTapRef.current = false;
        });
        if (!over || busy) return;

        const dragData = active.data.current;
        const overId = String(over.id);
        if (!dragData) return;

        if (overId.startsWith('slot:')) {
            const targetIdx = Number(overId.slice(5));
            if (!Number.isInteger(targetIdx) || targetIdx < 0 || targetIdx >= slots.length) return;

            if (dragData.source === 'bank') {
                placeEventInSlot(dragData.eventId, targetIdx);
            } else if (dragData.source === 'slot') {
                const fromIdx = dragData.slotIndex;
                if (fromIdx === targetIdx) return;
                playPairSnap();
                setPreferredSlotIdx(null);
                setSlots((prev) => {
                    const next = [...prev];
                    const temp = next[targetIdx];
                    next[targetIdx] = next[fromIdx];
                    next[fromIdx] = temp;
                    return next;
                });
            }
            return;
        }

        if (overId === 'bank-zone' && dragData.source === 'slot') {
            handleRemoveSlot(dragData.slotIndex);
        }
    };

    const handleDragCancel = () => {
        setActiveDrag(null);
        pointerYRef.current = null;
        requestAnimationFrame(() => {
            suppressNextTapRef.current = false;
        });
    };

    const handleSubmitOrder = async () => {
        if (busy || !allFilled) return;
        const res = await onSubmit(challenge.id, { order: slots });
        if (res && !res.is_correct && !res.level_ended) {
            setShakeWrong(true);
            clearTimeout(shakeTimerRef.current);
            shakeTimerRef.current = setTimeout(() => setShakeWrong(false), 400);
        }
    };

    if (!challenge) return null;
    const imageUrl = resolveStorageUrl(challenge.payload.image);
    const activeEvent = activeDrag ? eventsById.get(activeDrag.eventId) : null;

    return (
        <div ref={rootRef} className="max-w-2xl mx-auto w-full flex-1 flex flex-col justify-between gap-4">
            <div className="space-y-4">
                {imageUrl && (
                    <div className="w-full max-w-md mx-auto aspect-video rounded-xl overflow-hidden border border-stone-200 bg-stone-100">
                        <img
                            src={imageUrl}
                            alt="Eksena ng Banghay"
                            className="w-full h-full object-cover object-center"
                            loading="eager"
                        />
                    </div>
                )}

                <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1 min-w-0">
                        <h3 className="text-base sm:text-lg font-bold text-stone-900 leading-snug">
                            {challenge.payload.prompt}
                        </h3>
                        <p className="text-xs sm:text-[13px] text-stone-500 leading-relaxed">
                            I-drag o i-tap ang mga pangyayari sa ibaba upang ilagay sa tamang linya ({filledCount}/{events.length}).
                        </p>
                    </div>
                    <button
                        type="button"
                        disabled={busy || filledCount === 0}
                        onClick={handleResetAll}
                        aria-label="Ulitin ang lahat ng linya"
                        className="shrink-0 min-h-[34px] px-2.5 py-1.5 rounded-lg border border-stone-200 bg-white hover:bg-stone-50 disabled:opacity-40 text-stone-600 text-xs font-semibold inline-flex items-center gap-1.5 transition cursor-pointer disabled:cursor-not-allowed"
                    >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Ulitin</span>
                    </button>
                </div>

                <DndContext
                    sensors={sensors}
                    collisionDetection={collisionDetectionStrategy}
                    measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
                    autoScroll={{
                        threshold: { x: 0, y: 0.24 },
                        acceleration: 18,
                        interval: 5,
                        layoutShiftCompensation: false,
                    }}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                    onDragCancel={handleDragCancel}
                >
                    {/* TOP ZONE: 5 Numbered Drop Lines (1 Una -> 5 Huli) */}
                    <div className={`space-y-2 ${shakeWrong ? 'jq-shake' : ''}`}>
                        {slots.map((eventId, idx) => {
                            const item = eventId ? eventsById.get(eventId) : null;
                            const isTarget = !item && activeSlotIdx === idx;
                            return (
                                <DropLineSlot
                                    key={`slot-${idx}`}
                                    index={idx}
                                    total={events.length}
                                    item={item}
                                    isTarget={isTarget}
                                    disabled={busy}
                                    onSelectEmpty={() => {
                                        if (busy) return;
                                        setPreferredSlotIdx(idx);
                                        playUiTap(480);
                                    }}
                                    onRemove={() => handleRemoveSlot(idx)}
                                />
                            );
                        })}
                    </div>

                    {/* BOTTOM ZONE: Draggable & Tappable Event Bank */}
                    <EventBankZone
                        bankEvents={bankEvents}
                        isDraggingFromSlot={activeDrag?.source === 'slot'}
                        disabled={busy}
                        onTapCard={handleTapBankCard}
                    />

                    <DragOverlay dropAnimation={{ duration: 150, easing: 'ease-out' }}>
                        {activeEvent ? (
                            <div className="flex items-center px-4 py-3 rounded-xl border-2 border-[#C2410C] bg-white shadow-xl ring-4 ring-[#C2410C]/15 cursor-grabbing select-none">
                                <p className="text-[13px] sm:text-[15px] text-stone-900 font-semibold leading-snug flex-1">
                                    {activeEvent.text}
                                </p>
                            </div>
                        ) : null}
                    </DragOverlay>
                </DndContext>
            </div>

            <div className="pt-2 border-t border-stone-200/80">
                <button
                    type="button"
                    disabled={busy || !allFilled}
                    onClick={handleSubmitOrder}
                    className="w-full min-h-[48px] py-2.5 px-6 rounded-xl bg-[#C2410C] hover:bg-[#9A3412] active:scale-[0.99] disabled:bg-stone-200 disabled:text-stone-500 text-white font-semibold text-sm transition cursor-pointer disabled:cursor-not-allowed"
                >
                    {busy
                        ? 'Sinusuri...'
                        : allFilled
                          ? 'Isumite ang Pagkakasunod-sunod'
                          : `Punan muna ang lahat ng linya (${filledCount}/${events.length})`}
                </button>
            </div>
        </div>
    );
}

function DropLineSlot({ index, total, item, isTarget, disabled, onSelectEmpty, onRemove }) {
    const { isOver, setNodeRef: setDropRef } = useDroppable({
        id: `slot:${index}`,
        disabled,
    });

    const isFirst = index === 0;
    const isLast = index === total - 1;

    return (
        <div ref={setDropRef} className="flex items-stretch gap-2 sm:gap-2.5">
            {/* Fixed Line Number Badge */}
            <div
                className={`w-11 sm:w-12 shrink-0 flex flex-col items-center justify-center rounded-xl border select-none transition-colors ${
                    isOver
                        ? 'bg-[#C2410C] border-[#C2410C] text-white'
                        : item
                          ? 'bg-[#FFF3EC] border-[#FDBA74] text-[#C2410C]'
                          : isTarget
                            ? 'bg-[#FFF8F3] border-[#C2410C] text-[#C2410C]'
                            : 'bg-stone-100/90 border-stone-200 text-stone-600'
                }`}
            >
                <span className="text-xs sm:text-sm font-extrabold tabular-nums leading-none">
                    {index + 1}
                </span>
                {(isFirst || isLast) && (
                    <span
                        className={`text-[9px] sm:text-[10px] font-semibold mt-1 leading-none ${
                            isOver ? 'text-orange-100' : item || isTarget ? 'text-[#C2410C]/80' : 'text-stone-500'
                        }`}
                    >
                        {isFirst ? 'Una' : 'Huli'}
                    </span>
                )}
            </div>

            {/* Slot Content: Either Filled Draggable Card OR Dashed Empty Drop Line */}
            {item ? (
                <FilledSlotCard
                    slotIndex={index}
                    item={item}
                    isOver={isOver}
                    disabled={disabled}
                    onRemove={onRemove}
                />
            ) : (
                <button
                    type="button"
                    disabled={disabled}
                    onClick={onSelectEmpty}
                    className={`flex-1 min-h-[54px] px-3.5 py-2.5 rounded-xl border-2 border-dashed text-left flex items-center justify-between gap-2 transition cursor-pointer ${
                        isOver
                            ? 'border-[#C2410C] bg-[#FFF1E8] text-[#C2410C] scale-[1.01]'
                            : isTarget
                              ? 'border-[#C2410C]/80 bg-[#FFF8F3] text-[#C2410C]'
                              : 'border-stone-300 bg-white/60 hover:border-stone-400 hover:bg-white text-stone-400'
                    }`}
                >
                    <span className="text-xs sm:text-[13px] font-medium leading-snug">
                        {isOver
                            ? `Bitawan dito para sa Linya ${index + 1}`
                            : isTarget
                              ? `I-drag o i-tap ang pangyayari para sa Linya ${index + 1}`
                              : `Linya ${index + 1} — bakante`}
                    </span>
                </button>
            )}
        </div>
    );
}

function FilledSlotCard({ slotIndex, item, isOver, disabled, onRemove }) {
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id: `slot-item:${slotIndex}`,
        disabled,
        data: {
            source: 'slot',
            slotIndex,
            eventId: item.id,
        },
    });

    return (
        <motion.div
            ref={setNodeRef}
            initial={{ opacity: 0.7, scale: 0.98 }}
            animate={{ opacity: isDragging ? 0.35 : 1, scale: 1 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            {...attributes}
            {...listeners}
            className={`flex-1 min-h-[54px] flex items-center gap-2.5 pl-3.5 pr-2 py-2.5 rounded-xl border select-none touch-pan-y transition-colors cursor-grab active:cursor-grabbing ${
                isOver
                    ? 'border-2 border-[#C2410C] bg-[#FFF1E8]'
                    : isDragging
                      ? 'border-dashed border-[#C2410C]/60 bg-orange-50/40'
                      : 'border-stone-200 bg-white hover:border-[#FDBA74] shadow-[0_1px_2px_rgba(28,25,23,0.04)]'
            }`}
        >
            <p className="text-[13px] sm:text-[14.5px] text-stone-800 font-medium leading-snug flex-1">
                {item.text}
            </p>

            <button
                type="button"
                disabled={disabled}
                onPointerDown={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
                onClick={(e) => {
                    e.stopPropagation();
                    onRemove();
                }}
                aria-label={`Alisin sa Linya ${slotIndex + 1}`}
                title="Ibalik sa ibaba"
                className="w-9 h-9 rounded-lg text-stone-400 hover:text-rose-600 hover:bg-rose-50 active:scale-90 inline-flex items-center justify-center shrink-0 transition cursor-pointer"
            >
                <X className="w-4 h-4" />
            </button>
        </motion.div>
    );
}

function EventBankZone({ bankEvents, isDraggingFromSlot, disabled, onTapCard }) {
    const { isOver, setNodeRef } = useDroppable({
        id: 'bank-zone',
        disabled,
    });

    return (
        <div
            ref={setNodeRef}
            className={`rounded-2xl border p-3 sm:p-3.5 space-y-2.5 transition-colors ${
                isOver && isDraggingFromSlot
                    ? 'border-[#C2410C] bg-[#FFF5EE]'
                    : 'border-stone-200/90 bg-stone-100/55'
            }`}
        >
            <div className="flex items-center justify-between gap-2 px-0.5">
                <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-stone-500">
                    Mga Pangyayari
                </span>
                <span className="text-[11px] font-semibold text-[#C2410C]">
                    {bankEvents.length > 0
                        ? 'I-drag pataas o i-tap'
                        : 'Kumpleto na ang mga linya'}
                </span>
            </div>

            {bankEvents.length > 0 ? (
                <div className="space-y-2">
                    {bankEvents.map((ev) => (
                        <DraggableBankCard
                            key={ev.id}
                            item={ev}
                            disabled={disabled}
                            onTap={() => onTapCard(ev.id)}
                        />
                    ))}
                </div>
            ) : (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/75 px-3.5 py-2.5 text-center">
                    <p className="text-xs font-semibold text-[#15803D]">
                        {isDraggingFromSlot && isOver
                            ? 'Bitawan dito upang ibalik ang pangyayari sa ibaba.'
                            : 'Nakalagay na ang lahat ng pangyayari! Maaari mo pa ring i-drag ang mga linya upang pagpalitin.'}
                    </p>
                </div>
            )}
        </div>
    );
}

function DraggableBankCard({ item, disabled, onTap }) {
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id: `bank:${item.id}`,
        disabled,
        data: {
            source: 'bank',
            eventId: item.id,
        },
    });

    return (
        <div
            ref={setNodeRef}
            {...attributes}
            {...listeners}
            onClick={() => {
                if (!disabled && !isDragging) onTap();
            }}
            role="button"
            tabIndex={disabled ? -1 : 0}
            onKeyDown={(e) => {
                if ((e.key === 'Enter' || e.key === ' ') && !disabled) {
                    e.preventDefault();
                    onTap();
                }
            }}
            className={`flex items-center px-3.5 sm:px-4 py-3 rounded-xl border select-none touch-pan-y transition cursor-grab active:cursor-grabbing ${
                isDragging
                    ? 'border-dashed border-[#C2410C]/60 bg-orange-50/40 opacity-35'
                    : 'border-stone-200 bg-white hover:border-[#C2410C]/60 hover:bg-[#FFFDFB] active:scale-[0.99] shadow-[0_1px_2px_rgba(28,25,23,0.04)]'
            }`}
        >
            <p className="text-[13px] sm:text-[14.5px] text-stone-800 font-medium leading-snug flex-1">
                {item.text}
            </p>
        </div>
    );
}
