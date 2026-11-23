import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Delete, RotateCcw } from 'lucide-react';
import { resolveStorageUrl } from '../../api/axiosClient';

function LineArtIllustration({ orderIndex, slot }) {
    const variant = (orderIndex + slot) % 4;
    return (
        <svg viewBox="0 0 64 64" className="w-10 h-10 text-[#C2410C]" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            {variant === 0 && (
                <>
                    <rect x="18" y="10" width="28" height="44" rx="2" />
                    <circle cx="40" cy="34" r="2.5" />
                </>
            )}
            {variant === 1 && (
                <>
                    <path d="M32 54V28" />
                    <path d="M32 10C22 14 16 24 22 32C26 36 38 36 42 32C48 24 42 14 32 10Z" />
                </>
            )}
            {variant === 2 && (
                <>
                    <path d="M16 48L44 20" />
                    <path d="M36 14L50 28L40 32L32 24L36 14Z" />
                </>
            )}
            {variant === 3 && (
                <>
                    <circle cx="23" cy="24" r="6" />
                    <circle cx="41" cy="24" r="6" />
                    <path d="M13 48C13 40 18 36 23 36C28 36 33 40 33 48" />
                    <path d="M31 48C31 40 36 36 41 36C46 36 51 40 51 48" />
                </>
            )}
        </svg>
    );
}

export default function FourPicsWordGame({
    challenges,
    completedChallengeIds,
    onSubmit,
    busy,
    savedPickedByChallenge,
    onSavePickedByChallenge,
}) {
    const firstPendingIdx = Math.max(
        0,
        challenges.findIndex((c) => !completedChallengeIds.includes(c.id))
    );
    const [currentIndex, setCurrentIndex] = useState(firstPendingIdx);
    const [pickedByChallenge, setPickedByChallenge] = useState(() => savedPickedByChallenge || {});

    useEffect(() => {
        const nextIdx = challenges.findIndex((c) => !completedChallengeIds.includes(c.id));
        if (nextIdx !== -1 && nextIdx !== currentIndex) {
            setCurrentIndex(nextIdx);
        }
    }, [completedChallengeIds, challenges, currentIndex]);

    const current = challenges[currentIndex];
    const payload = current?.payload || {};
    const { clue = '', images = [], visual_hints = [], word_length = 5, scrambled_letters = [] } = payload;
    const pickedIndices = (current && pickedByChallenge[current.id]) || [];
    const currentWord = pickedIndices.map((idx) => scrambled_letters[idx]).join('');
    const isWordComplete = currentWord.length === word_length;

    const updatePicked = useCallback(
        (updater) => {
            if (!current) return;
            setPickedByChallenge((prev) => {
                const curList = prev[current.id] || [];
                const nextList = typeof updater === 'function' ? updater(curList) : updater;
                const next = { ...prev, [current.id]: nextList };
                onSavePickedByChallenge?.(next);
                return next;
            });
        },
        [current, onSavePickedByChallenge]
    );

    const handleSubmitWord = useCallback(async () => {
        if (!current || busy || currentWord.length < word_length) return;
        const res = await onSubmit(current.id, { word: currentWord });
        if (res && !res.is_correct && !res.level_ended) {
            setTimeout(() => updatePicked([]), 360);
        }
    }, [busy, current, currentWord, onSubmit, updatePicked, word_length]);

    useEffect(() => {
        if (!current) return undefined;
        const onKeyDown = (e) => {
            if (busy || e.ctrlKey || e.metaKey || e.altKey) return;
            if (['INPUT', 'TEXTAREA'].includes(e.target?.tagName)) return;
            if (e.key === 'Backspace') {
                e.preventDefault();
                updatePicked((prev) => prev.slice(0, -1));
                return;
            }
            if (e.key === 'Enter' && currentWord.length === word_length) {
                e.preventDefault();
                handleSubmitWord();
                return;
            }
            const upper = e.key.toUpperCase();
            if (/^[A-Z]$/.test(upper) && pickedIndices.length < word_length) {
                const matchIdx = scrambled_letters.findIndex(
                    (ch, idx) => ch.toUpperCase() === upper && !pickedIndices.includes(idx)
                );
                if (matchIdx !== -1) {
                    updatePicked((prev) => [...prev, matchIdx]);
                }
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [busy, current, currentWord.length, handleSubmitWord, pickedIndices, scrambled_letters, updatePicked, word_length]);

    if (!current) return null;

    const handlePickTile = (idx) => {
        if (pickedIndices.includes(idx) || pickedIndices.length >= word_length) return;
        updatePicked((prev) => [...prev, idx]);
    };

    const isLongWord = word_length >= 8;

    return (
        <motion.div
            key={current.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.16 }}
            className="max-w-2xl mx-auto w-full flex-1 flex flex-col justify-between gap-4"
        >
            {/* Eye-Line Clue + 2x2 Visual Grid */}
            <div className="my-auto space-y-4">
                <div className="space-y-1">
                    <p className="text-xs font-semibold text-stone-500 tabular-nums">
                        Palaisipan {currentIndex + 1} sa {challenges.length} · {word_length} titik
                    </p>
                    <h3 className="text-base sm:text-lg font-bold text-stone-900 leading-snug">{clue}</h3>
                </div>

                {/* Classic 2-column (2x2) 4 Pics 1 Word grid */}
                <div className="grid grid-cols-2 gap-2 sm:gap-2.5 max-w-[270px] sm:max-w-[350px] mx-auto">
                    {[0, 1, 2, 3].map((slot) => {
                        const imgUrl = resolveStorageUrl(images[slot]);
                        const hint = visual_hints[slot] || `Larawan ${slot + 1}`;
                        return (
                            <div
                                key={slot}
                                className="relative aspect-square rounded-xl border border-stone-200 bg-white overflow-hidden flex flex-col items-center justify-center"
                            >
                                {imgUrl ? (
                                    <>
                                        <img
                                            src={imgUrl}
                                            alt={hint}
                                            className="w-full h-full object-cover"
                                            loading="eager"
                                        />
                                        <span className="absolute inset-x-1.5 bottom-1.5 px-2 py-0.5 rounded-md bg-stone-900/75 text-white text-[10px] sm:text-[11px] font-medium text-center leading-tight truncate">
                                            {hint}
                                        </span>
                                    </>
                                ) : (
                                    <div className="p-2 text-center flex flex-col items-center gap-1.5">
                                        <LineArtIllustration orderIndex={current.order_index} slot={slot} />
                                        <span className="text-[11px] font-semibold text-stone-700 leading-tight">
                                            {hint}
                                        </span>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Thumb-Zone Slots + Keyboard Tiles + Action Bar */}
            <div className="space-y-3.5 pt-1">
                {/* Adaptive single-row answer slots (fits even 10-letter MAGKAPATID in 1 row on phones!) */}
                <div
                    className={`flex items-center justify-center ${
                        isLongWord ? 'flex-nowrap gap-1 sm:gap-2' : 'flex-wrap gap-1.5 sm:gap-2'
                    }`}
                >
                    {Array.from({ length: word_length }).map((_, i) => {
                        const tileIdx = pickedIndices[i];
                        const letter = tileIdx !== undefined ? scrambled_letters[tileIdx] : '';
                        const isNextActive = i === pickedIndices.length;

                        return (
                            <button
                                key={i}
                                type="button"
                                onClick={() => {
                                    if (tileIdx !== undefined) {
                                        updatePicked((prev) => prev.filter((_, idx) => idx !== i));
                                    }
                                }}
                                title={letter ? 'Alisin ang titik' : undefined}
                                className={`${
                                    isLongWord
                                        ? 'w-7 h-9 min-[390px]:w-8 min-[390px]:h-10 sm:w-11 sm:h-12 text-xs min-[390px]:text-sm sm:text-base'
                                        : 'w-10 h-11 sm:w-11 sm:h-12 text-base'
                                } rounded-lg border font-bold flex items-center justify-center transition-colors shrink-0 ${
                                    letter
                                        ? 'bg-[#1C1917] text-white border-[#1C1917] hover:bg-rose-700 hover:border-rose-700 cursor-pointer'
                                        : isNextActive
                                          ? 'bg-white text-stone-400 border-[#C2410C]'
                                          : 'bg-white text-stone-400 border-stone-300'
                                }`}
                            >
                                {letter}
                            </button>
                        );
                    })}
                </div>

                {/* Flat letter tiles */}
                <div className="flex flex-wrap justify-center gap-1.5 sm:gap-2">
                    {scrambled_letters.map((letter, idx) => {
                        const used = pickedIndices.includes(idx);
                        return (
                            <button
                                key={idx}
                                type="button"
                                disabled={used || pickedIndices.length >= word_length}
                                onClick={() => handlePickTile(idx)}
                                className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl border font-bold text-sm transition-colors ${
                                    used
                                        ? 'bg-stone-100 text-transparent border-stone-200 cursor-not-allowed'
                                        : 'bg-white text-stone-900 border-stone-300 hover:border-stone-900 hover:bg-stone-50 cursor-pointer disabled:opacity-50'
                                }`}
                            >
                                {letter}
                            </button>
                        );
                    })}
                </div>

                {/* Aligned flat action row */}
                <div className="flex items-center gap-2 pt-2 border-t border-stone-200/80">
                    <button
                        type="button"
                        disabled={pickedIndices.length === 0 || busy}
                        onClick={() => updatePicked((prev) => prev.slice(0, -1))}
                        className="min-h-[46px] px-3 sm:px-4 rounded-xl bg-white border border-stone-200 hover:border-stone-300 hover:bg-stone-50 text-xs sm:text-sm font-semibold text-stone-700 disabled:opacity-40 inline-flex items-center gap-1.5 transition cursor-pointer disabled:cursor-not-allowed shrink-0"
                    >
                        <Delete className="w-4 h-4" />
                        <span>Bura</span>
                    </button>

                    <button
                        type="button"
                        disabled={pickedIndices.length === 0 || busy}
                        onClick={() => updatePicked([])}
                        className="min-h-[46px] px-3 sm:px-4 rounded-xl bg-white border border-stone-200 hover:border-stone-300 hover:bg-stone-50 text-xs sm:text-sm font-semibold text-stone-700 disabled:opacity-40 inline-flex items-center gap-1.5 transition cursor-pointer disabled:cursor-not-allowed shrink-0"
                    >
                        <RotateCcw className="w-4 h-4" />
                        <span className="hidden min-[390px]:inline">Reset</span>
                    </button>

                    <button
                        type="button"
                        disabled={busy || !isWordComplete}
                        onClick={handleSubmitWord}
                        className={`min-h-[46px] flex-1 px-4 sm:px-6 rounded-xl font-semibold text-xs sm:text-sm transition ${
                            busy || !isWordComplete
                                ? 'bg-stone-200 text-stone-500 cursor-not-allowed'
                                : 'bg-[#C2410C] hover:bg-[#9A3412] text-white cursor-pointer'
                        }`}
                    >
                        {busy ? 'Sinusuri...' : 'Isumite ang Salita'}
                    </button>
                </div>
            </div>
        </motion.div>
    );
}
