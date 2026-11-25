import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
    DndContext,
    DragOverlay,
    KeyboardSensor,
    PointerSensor,
    closestCenter,
    useSensor,
    useSensors,
} from '@dnd-kit/core';
import {
    SortableContext,
    arrayMove,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronDown, ChevronUp, GripVertical } from 'lucide-react';
import { resolveStorageUrl } from '../../api/axiosClient';
import { playPairSnap } from '../../utils/gameAudio';

function restoreEventsOrder(events, savedOrder) {
    if (!Array.isArray(savedOrder) || savedOrder.length !== events.length) return events;
    const byId = new Map(events.map((e) => [e.id, e]));
    const ordered = savedOrder.map((id) => byId.get(id)).filter(Boolean);
    return ordered.length === events.length ? ordered : events;
}

export default function SequenceChallengeGame({ challenges, onSubmit, busy, savedOrder, onSaveOrder }) {
    const challenge = challenges[0];
    const [items, setItems] = useState(() =>
        restoreEventsOrder(challenge?.payload?.events || [], savedOrder)
    );
    const [activeId, setActiveId] = useState(null);
    const [shakeWrong, setShakeWrong] = useState(false);
    const shakeTimerRef = useRef(null);
    const onSaveOrderRef = useRef(onSaveOrder);
    const didMountOrderRef = useRef(false);
    onSaveOrderRef.current = onSaveOrder;

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    useEffect(() => {
        return () => clearTimeout(shakeTimerRef.current);
    }, []);

    useEffect(() => {
        if (!didMountOrderRef.current) {
            didMountOrderRef.current = true;
            return;
        }
        if (items.length > 0) {
            onSaveOrderRef.current?.(items.map((i) => i.id));
        }
    }, [items]);

    if (!challenge) return null;
    const imageUrl = resolveStorageUrl(challenge.payload.image);
    const activeItem = items.find((i) => i.id === activeId) || null;

    const handleDragStart = (event) => {
        setActiveId(event.active.id);
    };

    const handleDragEnd = (event) => {
        const { active, over } = event;
        setActiveId(null);
        if (!over || active.id === over.id) return;

        playPairSnap();
        setItems((prev) => {
            const oldIndex = prev.findIndex((i) => i.id === active.id);
            const newIndex = prev.findIndex((i) => i.id === over.id);
            if (oldIndex === -1 || newIndex === -1) return prev;
            return arrayMove(prev, oldIndex, newIndex);
        });
    };

    const moveItemBy = (idx, delta) => {
        const nextIdx = idx + delta;
        if (nextIdx < 0 || nextIdx >= items.length) return;
        playPairSnap();
        setItems((prev) => arrayMove(prev, idx, nextIdx));
    };

    const handleSubmitOrder = async () => {
        if (busy) return;
        const res = await onSubmit(challenge.id, { order: items.map((i) => i.id) });
        if (res && !res.is_correct && !res.level_ended) {
            setShakeWrong(true);
            clearTimeout(shakeTimerRef.current);
            shakeTimerRef.current = setTimeout(() => setShakeWrong(false), 380);
        }
    };

    return (
        <div className="max-w-2xl mx-auto w-full flex-1 flex flex-col justify-between gap-4">
            <div className="space-y-4">
                {imageUrl && (
                    <div className="w-full max-w-lg mx-auto aspect-video rounded-xl overflow-hidden border border-stone-200 bg-stone-100">
                        <img
                            src={imageUrl}
                            alt="Eksena ng Banghay"
                            className="w-full h-full object-cover object-center"
                            loading="eager"
                        />
                    </div>
                )}

                <div className="space-y-1">
                    <h3 className="text-base sm:text-lg font-bold text-stone-900 leading-snug">
                        {challenge.payload.prompt}
                    </h3>
                    <p className="text-xs sm:text-[13px] text-stone-500">
                        I-drag sa kaliwang handle o pindutin ang pataas/pababa (↑/↓) upang ayusin mula 1 (Una) hanggang {items.length} (Huli).
                    </p>
                </div>

                {/* FIXED Slot Numbers (1..5) + Scroll-Safe Draggable Cards (touch-none on handle only!) */}
                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                    onDragCancel={() => setActiveId(null)}
                >
                    <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
                        <div className={`space-y-2.5 ${shakeWrong ? 'jq-shake' : ''}`}>
                            {items.map((item, idx) => (
                                <motion.div
                                    key={item.id}
                                    layout={!activeId}
                                    transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                                    className="flex items-stretch gap-2 sm:gap-3"
                                >
                                    <div className="w-10 sm:w-12 shrink-0 flex flex-col items-center justify-center rounded-xl border border-stone-200 bg-stone-100/80 select-none">
                                        <span className="text-xs sm:text-sm font-bold text-stone-900 tabular-nums leading-none">
                                            {idx + 1}
                                        </span>
                                        {(idx === 0 || idx === items.length - 1) && (
                                            <span className="text-[9px] sm:text-[10px] font-semibold text-stone-500 mt-1 leading-none">
                                                {idx === 0 ? 'Una' : 'Huli'}
                                            </span>
                                        )}
                                    </div>

                                    <SortableEventCard
                                        item={item}
                                        canMoveUp={idx > 0}
                                        canMoveDown={idx < items.length - 1}
                                        onMoveUp={() => moveItemBy(idx, -1)}
                                        onMoveDown={() => moveItemBy(idx, 1)}
                                    />
                                </motion.div>
                            ))}
                        </div>
                    </SortableContext>

                    <DragOverlay dropAnimation={{ duration: 160, easing: 'ease-out' }}>
                        {activeItem ? (
                            <div className="flex items-center gap-3 px-4 py-3.5 rounded-xl border-2 border-[#C2410C] bg-white shadow-lg cursor-grabbing select-none">
                                <GripVertical className="w-4 h-4 text-[#C2410C] shrink-0" aria-hidden="true" />
                                <p className="text-sm sm:text-[15px] text-stone-900 font-medium leading-snug flex-1">
                                    {activeItem.text}
                                </p>
                            </div>
                        ) : null}
                    </DragOverlay>
                </DndContext>
            </div>

            <div className="pt-2 border-t border-stone-200/80">
                <button
                    type="button"
                    disabled={busy}
                    onClick={handleSubmitOrder}
                    className="w-full min-h-[48px] py-2.5 px-6 rounded-xl bg-[#C2410C] hover:bg-[#9A3412] active:scale-[0.99] disabled:bg-stone-200 disabled:text-stone-500 text-white font-semibold text-sm transition cursor-pointer disabled:cursor-not-allowed"
                >
                    {busy ? 'Sinusuri...' : 'Isumite ang Pagkakasunod-sunod'}
                </button>
            </div>
        </div>
    );
}

function SortableEventCard({ item, canMoveUp, canMoveDown, onMoveUp, onMoveDown }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: item.id,
    });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`flex-1 flex items-center gap-2 sm:gap-3 px-2.5 sm:px-3.5 py-2.5 sm:py-3 rounded-xl border select-none transition-colors ${
                isDragging
                    ? 'border-dashed border-[#C2410C]/60 bg-orange-50/40 opacity-40'
                    : 'border-stone-200 bg-white hover:border-stone-300'
            }`}
        >
            {/* Dedicated 40px+ Touch-Safe Drag Handle (keeps normal vertical page scroll intact on text!) */}
            <button
                type="button"
                {...attributes}
                {...listeners}
                aria-label="I-drag upang ilipat"
                className="w-9 h-10 rounded-lg bg-stone-50 hover:bg-stone-100 text-stone-400 hover:text-stone-700 inline-flex items-center justify-center shrink-0 touch-none cursor-grab active:cursor-grabbing"
            >
                <GripVertical className="w-4 h-4" aria-hidden="true" />
            </button>

            <p className="text-[13px] sm:text-[15px] text-stone-800 font-medium leading-snug flex-1">
                {item.text}
            </p>

            {/* Quick Single-Hand Mobile / Accessibility Reorder Controls */}
            <div className="flex flex-col gap-1 shrink-0">
                <button
                    type="button"
                    disabled={!canMoveUp}
                    onClick={onMoveUp}
                    aria-label="Ilipat pataas"
                    className="w-8 h-7 rounded-md border border-stone-200 bg-stone-50 hover:bg-stone-100 active:scale-90 disabled:opacity-30 text-stone-700 inline-flex items-center justify-center transition cursor-pointer disabled:cursor-not-allowed"
                >
                    <ChevronUp className="w-4 h-4" />
                </button>
                <button
                    type="button"
                    disabled={!canMoveDown}
                    onClick={onMoveDown}
                    aria-label="Ilipat pababa"
                    className="w-8 h-7 rounded-md border border-stone-200 bg-stone-50 hover:bg-stone-100 active:scale-90 disabled:opacity-30 text-stone-700 inline-flex items-center justify-center transition cursor-pointer disabled:cursor-not-allowed"
                >
                    <ChevronDown className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
}
