import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
    DndContext,
    DragOverlay,
    PointerSensor,
    useDraggable,
    useDroppable,
    useSensor,
    useSensors,
} from '@dnd-kit/core';
import { CheckCircle2, GripVertical, Link2, Lock, RotateCcw, X } from 'lucide-react';
import { resolveStorageUrl } from '../../api/axiosClient';
import { playPairSnap, playUiTap } from '../../utils/gameAudio';

export default function MatchingGame({
    challenges,
    onSubmit,
    busy,
    lastDetails,
    savedPairs,
    onSavePairs,
    savedLockedIds,
    onSaveLockedIds,
}) {
    const challenge = challenges[0];
    const [pairs, setPairs] = useState(() => savedPairs || {});
    const [lockedIds, setLockedIds] = useState(() => (Array.isArray(savedLockedIds) ? savedLockedIds : []));
    const [selectedLeftId, setSelectedLeftId] = useState(null);
    const [floatingState, setFloatingState] = useState({ visible: false, top: 64 });
    const [activeDragItem, setActiveDragItem] = useState(null);
    const [justLockedIds, setJustLockedIds] = useState([]);
    const [wrongFlashIds, setWrongFlashIds] = useState([]);
    const lastProcessedDetailsRef = useRef(null);
    const wrongUnlinkTimerRef = useRef(null);
    const lockedPopTimerRef = useRef(null);
    const leftCardElsRef = useRef({});
    const onSavePairsRef = useRef(onSavePairs);
    const onSaveLockedIdsRef = useRef(onSaveLockedIds);
    const didMountPairsRef = useRef(false);
    const didMountLockedRef = useRef(false);
    onSavePairsRef.current = onSavePairs;
    onSaveLockedIdsRef.current = onSaveLockedIds;

    // Single PointerSensor handles mouse, trackpad, pen, AND mobile touch cleanly with `touch-none`
    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

    useEffect(() => {
        return () => {
            clearTimeout(wrongUnlinkTimerRef.current);
            clearTimeout(lockedPopTimerRef.current);
        };
    }, []);

    useEffect(() => {
        if (!didMountPairsRef.current) {
            didMountPairsRef.current = true;
            return;
        }
        onSavePairsRef.current?.(pairs);
    }, [pairs]);

    useEffect(() => {
        if (!didMountLockedRef.current) {
            didMountLockedRef.current = true;
            return;
        }
        onSaveLockedIdsRef.current?.(lockedIds);
    }, [lockedIds]);

    // Native mobile UX: buttery-smooth rAF-coalesced scroll check with hysteresis (zero sliver, zero boundary flicker!)
    useEffect(() => {
        if (!selectedLeftId) {
            setFloatingState((prev) => (prev.visible ? { ...prev, visible: false } : prev));
            return undefined;
        }
        const el = leftCardElsRef.current[String(selectedLeftId)];
        if (!el) {
            setFloatingState((prev) => (prev.visible ? { ...prev, visible: false } : prev));
            return undefined;
        }
        const scrollParent = el.closest('main') || null;
        let rafPending = null;

        const measure = () => {
            rafPending = null;
            const rect = el.getBoundingClientRect();
            const topBound = scrollParent ? scrollParent.getBoundingClientRect().top : 56;
            const dockTop = Math.max(56, Math.round(topBound)) + 8;

            setFloatingState((prev) => {
                // 20px hysteresis band: wait until card clears top before showing; require 26px visible before hiding
                const shouldFloat = prev.visible
                    ? rect.bottom < topBound + 26
                    : rect.bottom <= topBound + 6;
                if (prev.visible === shouldFloat && prev.top === dockTop) return prev;
                return { visible: shouldFloat, top: dockTop };
            });
        };

        const scheduleMeasure = () => {
            if (rafPending !== null) return;
            rafPending = requestAnimationFrame(measure);
        };

        measure();

        // Capture-phase passive listener catches scroll events on ANY scrolling container without blocking 60fps scroll
        document.addEventListener('scroll', scheduleMeasure, { capture: true, passive: true });
        window.addEventListener('resize', scheduleMeasure, { passive: true });

        let observer = null;
        if (typeof IntersectionObserver !== 'undefined') {
            observer = new IntersectionObserver(scheduleMeasure, {
                root: scrollParent,
                threshold: [0, 0.15, 0.5, 1],
            });
            observer.observe(el);
        }

        return () => {
            if (rafPending !== null) cancelAnimationFrame(rafPending);
            document.removeEventListener('scroll', scheduleMeasure, { capture: true });
            window.removeEventListener('resize', scheduleMeasure);
            observer?.disconnect();
        };
    }, [selectedLeftId]);

    // After a wrong check: lock every CORRECT match permanently with emerald pop, and flash+shake WRONG matches before returning them to Hanay B!
    useEffect(() => {
        const statusMap = lastDetails?.pair_status;
        if (!statusMap || lastDetails === lastProcessedDetailsRef.current) return;
        lastProcessedDetailsRef.current = lastDetails;

        const newlyCorrect = Object.keys(statusMap).filter((leftKey) => statusMap[leftKey] === true);
        const wrongKeys = Object.keys(statusMap).filter((leftKey) => statusMap[leftKey] === false);

        if (newlyCorrect.length > 0) {
            const correctStrs = newlyCorrect.map(String);
            setLockedIds((prev) => Array.from(new Set([...prev.map(String), ...correctStrs])));
            setJustLockedIds(correctStrs);
            clearTimeout(lockedPopTimerRef.current);
            lockedPopTimerRef.current = setTimeout(() => setJustLockedIds([]), 420);
        }

        if (wrongKeys.length > 0) {
            const wrongStrs = wrongKeys.map(String);
            const wrongSet = new Set(wrongStrs);
            setWrongFlashIds(wrongStrs);
            clearTimeout(wrongUnlinkTimerRef.current);
            wrongUnlinkTimerRef.current = setTimeout(() => {
                setWrongFlashIds([]);
                setPairs((prev) => {
                    const next = { ...prev };
                    Object.keys(next).forEach((k) => {
                        if (wrongSet.has(String(k))) {
                            delete next[k];
                        }
                    });
                    return next;
                });
                setSelectedLeftId((prev) => (prev && wrongSet.has(String(prev)) ? null : prev));
            }, 440);
        }
    }, [lastDetails]);

    const lockedSet = useMemo(() => new Set(lockedIds.map(String)), [lockedIds]);
    const justLockedSet = useMemo(() => new Set(justLockedIds), [justLockedIds]);
    const wrongFlashSet = useMemo(() => new Set(wrongFlashIds), [wrongFlashIds]);

    if (!challenge) return null;

    const columnA = challenge.payload.column_a || [];
    const columnB = challenge.payload.column_b || [];
    const imageUrl = resolveStorageUrl(challenge.payload.image);

    const lockedRightIds = new Set(
        Object.entries(pairs)
            .filter(([leftKey]) => lockedSet.has(String(leftKey)))
            .map(([, rightId]) => rightId)
    );

    const assignPair = (leftId, rightId) => {
        if (lockedSet.has(String(leftId)) || lockedRightIds.has(rightId)) return;
        playPairSnap();
        setPairs((prev) => {
            const next = { ...prev };
            Object.keys(next).forEach((k) => {
                if (!lockedSet.has(String(k)) && next[k] === rightId) {
                    delete next[k];
                }
            });
            next[leftId] = rightId;
            return next;
        });
        setSelectedLeftId(null);
    };

    const unassignPair = (leftId) => {
        if (lockedSet.has(String(leftId))) return;
        playUiTap();
        setPairs((prev) => {
            const next = { ...prev };
            delete next[leftId];
            return next;
        });
    };

    const handleResetUnlocked = () => {
        setPairs((prev) => {
            const next = {};
            Object.entries(prev).forEach(([k, v]) => {
                if (lockedSet.has(String(k))) {
                    next[k] = v;
                }
            });
            return next;
        });
        setSelectedLeftId(null);
    };

    const handleDragStart = (event) => {
        const rightId = String(event.active.id).replace('right-', '');
        if (lockedRightIds.has(rightId)) return;
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
    const unlockedMatchedCount = Object.keys(pairs).filter((k) => !lockedSet.has(String(k))).length;
    const allMatched = matchedCount === columnA.length && columnA.length > 0;
    const selectedLeftItem = selectedLeftId ? columnA.find((a) => a.id === selectedLeftId) || null : null;

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
                                {selectedLeftId ? (
                                    <>Napili ang #{selectedLeftId} sa Hanay A — i-tap ngayon ang katugma sa Hanay B.</>
                                ) : lockedSet.size > 0 ? (
                                    <>Nananatili ang {lockedSet.size} tamang tugma — itugma muli ang mga natirang aytem ({matchedCount}/{columnA.length}).</>
                                ) : (
                                    <>
                                        I-tap ang Hanay A at piliin ang katugma sa Hanay B
                                        <span className="hidden md:inline">, o i-drag sa handle</span> ({matchedCount}/{columnA.length}).
                                    </>
                                )}
                            </p>
                        </div>
                        <button
                            type="button"
                            disabled={unlockedMatchedCount === 0}
                            onClick={handleResetUnlocked}
                            className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-stone-200 bg-white hover:bg-stone-50 text-xs font-semibold text-stone-600 disabled:opacity-40 transition cursor-pointer shrink-0 disabled:cursor-not-allowed"
                        >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>Ulitin</span>
                        </button>
                    </div>

                    {/* Native Mobile Floating Dock: Portaled to document.body so parent transforms/scroll never clip it! */}
                    {typeof document !== 'undefined' &&
                        createPortal(
                            <AnimatePresence>
                                {selectedLeftItem && floatingState.visible && !busy && (
                                    <motion.div
                                        initial={{ opacity: 0, y: -18, scale: 0.98 }}
                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                        exit={{ opacity: 0, y: -14, scale: 0.98 }}
                                        transition={{ type: 'spring', stiffness: 460, damping: 36, mass: 0.7 }}
                                        style={{ top: `${floatingState.top}px`, willChange: 'transform, opacity' }}
                                        className="md:hidden fixed inset-x-0 z-[60] px-3.5 sm:px-6 pointer-events-none"
                                    >
                                        <div className="pointer-events-auto max-w-4xl mx-auto p-3.5 rounded-xl border border-[#C2410C] bg-[#FFF8F3]/95 backdrop-blur-sm shadow-md flex items-start justify-between gap-2.5">
                                            <div className="min-w-0 flex-1 space-y-1">
                                                <p className="text-[11px] font-semibold text-[#C2410C]">
                                                    Napili sa Hanay A · Pumili sa Hanay B
                                                </p>
                                                <div className="flex items-start gap-2">
                                                    <span className="text-xs font-bold text-[#C2410C] tabular-nums pt-0.5 shrink-0">
                                                        {selectedLeftItem.id}.
                                                    </span>
                                                    <p className="text-[13px] font-medium text-stone-800 leading-snug">
                                                        {selectedLeftItem.text}
                                                    </p>
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    playUiTap();
                                                    setSelectedLeftId(null);
                                                }}
                                                aria-label="Kanselahin ang napili"
                                                className="w-8 h-8 -mt-0.5 -mr-0.5 rounded-lg bg-white border border-stone-200 hover:border-rose-200 hover:bg-rose-50 text-stone-500 hover:text-rose-600 inline-flex items-center justify-center shrink-0 cursor-pointer active:scale-95 transition"
                                            >
                                                <X className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>,
                            document.body
                        )}

                    {/* Two-Column Matching Board */}
                    <div className="grid md:grid-cols-2 gap-4">
                        <div className="space-y-2.5">
                            <h4 className="text-xs font-semibold text-stone-500">Hanay A — Pangyayari</h4>
                            {columnA.map((item) => {
                                const isLocked = lockedSet.has(String(item.id));
                                const assignedRightId = pairs[item.id];
                                const assignedRight = columnB.find((b) => b.id === assignedRightId);

                                return (
                                    <DroppableLeftSlot
                                        key={item.id}
                                        item={item}
                                        isLocked={isLocked}
                                        justLocked={justLockedSet.has(String(item.id))}
                                        isWrongFlash={wrongFlashSet.has(String(item.id))}
                                        isSelected={!isLocked && selectedLeftId === item.id}
                                        assignedRight={assignedRight}
                                        registerEl={(el) => {
                                            if (el) leftCardElsRef.current[String(item.id)] = el;
                                            else delete leftCardElsRef.current[String(item.id)];
                                        }}
                                        onClick={() => {
                                            if (isLocked) return;
                                            playUiTap();
                                            setSelectedLeftId(selectedLeftId === item.id ? null : item.id);
                                        }}
                                        onUnlink={() => unassignPair(item.id)}
                                    />
                                );
                            })}
                        </div>

                        <div className="space-y-2.5">
                            <h4 className="text-xs font-semibold text-stone-500">Hanay B — Paliwanag / Bunga</h4>
                            {columnB.map((item) => {
                                const isLockedRight = lockedRightIds.has(item.id);
                                const isUsed = usedRightIds.includes(item.id);

                                return (
                                    <DraggableRightCard
                                        key={item.id}
                                        item={item}
                                        isLocked={isLockedRight}
                                        isUsed={isUsed}
                                        canClickPair={Boolean(selectedLeftId) && !isLockedRight}
                                        onClick={() => {
                                            if (selectedLeftId && !isLockedRight) {
                                                assignPair(selectedLeftId, item.id);
                                            }
                                        }}
                                    />
                                );
                            })}
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

function DroppableLeftSlot({
    item,
    isLocked,
    justLocked,
    isWrongFlash,
    isSelected,
    assignedRight,
    registerEl,
    onClick,
    onUnlink,
}) {
    const { isOver, setNodeRef } = useDroppable({
        id: `left-${item.id}`,
        disabled: isLocked,
    });

    return (
        <div
            ref={(el) => {
                setNodeRef(el);
                registerEl?.(el);
            }}
            onClick={onClick}
            className={`p-3.5 rounded-xl border transition-[colors,transform] ${
                isWrongFlash
                    ? 'border-rose-400 bg-rose-50/80 jq-shake'
                    : isLocked
                      ? `border-emerald-300 bg-emerald-50/70 cursor-default ${justLocked ? 'jq-pop' : ''}`
                      : isOver || isSelected
                        ? 'border-[#C2410C] bg-orange-50/50 cursor-pointer'
                        : 'border-stone-200 bg-white hover:border-stone-300 active:scale-[0.99] cursor-pointer'
            }`}
        >
            <div className="flex items-start gap-2.5">
                <span className="text-xs font-bold text-stone-400 tabular-nums pt-0.5">{item.id}.</span>
                <span className="text-[13px] font-medium text-stone-800 leading-snug flex-1">
                    {item.text}
                </span>
                {isLocked && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-100 text-[#15803D] text-[10px] font-bold shrink-0">
                        <CheckCircle2 className="w-3 h-3" />
                        Tama
                    </span>
                )}
            </div>

            <div className="mt-2.5 pt-2 border-t border-stone-100 flex items-center justify-between gap-2 text-xs">
                {assignedRight ? (
                    <>
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                            <span
                                className={`w-5 h-5 rounded text-white text-[11px] font-bold flex items-center justify-center shrink-0 ${
                                    isLocked ? 'bg-[#15803D]' : 'bg-stone-900'
                                }`}
                            >
                                {assignedRight.id}
                            </span>
                            <span className="font-medium text-stone-700 truncate">{assignedRight.text}</span>
                        </div>
                        {isLocked ? (
                            <Lock className="w-3.5 h-3.5 text-emerald-600/70 shrink-0" />
                        ) : (
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onUnlink();
                                }}
                                aria-label={`Alisin ang tugma sa ${item.id}`}
                                title="Alisin ang tugma"
                                className="w-9 h-9 -my-1.5 -mr-1.5 rounded-lg bg-stone-100/80 hover:bg-rose-50 text-stone-500 hover:text-rose-600 active:scale-90 inline-flex items-center justify-center transition cursor-pointer shrink-0"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        )}
                    </>
                ) : (
                    <span className="inline-flex items-center gap-1.5 text-[11px] text-stone-400">
                        <Link2 className="w-3.5 h-3.5 shrink-0" />
                        {isSelected ? (
                            'Pumili sa Hanay B...'
                        ) : (
                            <>
                                <span className="md:hidden">I-tap upang pumili ng katugma</span>
                                <span className="hidden md:inline">I-drag o i-click ang katugma</span>
                            </>
                        )}
                    </span>
                )}
            </div>
        </div>
    );
}

function DraggableRightCard({ item, isLocked, isUsed, canClickPair, onClick }) {
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id: `right-${item.id}`,
        disabled: isLocked,
    });

    return (
        <div
            ref={setNodeRef}
            onClick={onClick}
            className={`p-3 sm:p-3.5 rounded-xl border text-[13px] transition-colors select-none flex items-start gap-2.5 ${
                isLocked
                    ? 'border-emerald-200 bg-emerald-50/50 text-emerald-800/70 cursor-default opacity-75'
                    : isDragging
                      ? 'border-dashed border-[#C2410C]/60 bg-orange-50/40 opacity-40'
                      : isUsed
                        ? 'border-stone-200 bg-stone-100 text-stone-400 cursor-pointer'
                        : canClickPair
                          ? 'border-[#C2410C] bg-orange-50/40 hover:bg-orange-50 cursor-pointer'
                          : 'border-stone-200 bg-white hover:border-stone-400 cursor-pointer'
            }`}
        >
            {/* Dedicated drag handle keeps normal vertical page scrolling smooth on phones! */}
            {!isLocked && (
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
            )}
            <span
                className={`w-6 h-6 rounded-md text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5 ${
                    isLocked
                        ? 'bg-[#15803D] text-white'
                        : isUsed
                          ? 'bg-stone-200 text-stone-500'
                          : 'bg-stone-900 text-white'
                }`}
            >
                {item.id}
            </span>
            <span
                className={`leading-snug flex-1 pt-0.5 ${
                    isLocked
                        ? 'font-medium text-emerald-900/80'
                        : isUsed
                          ? 'line-through'
                          : 'font-medium text-stone-800'
                }`}
            >
                {item.text}
            </span>
            {isLocked && <CheckCircle2 className="w-4 h-4 text-[#15803D] shrink-0 mt-0.5" />}
        </div>
    );
}
