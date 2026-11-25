import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, XCircle } from 'lucide-react';
import { resolveStorageUrl } from '../../api/axiosClient';

export default function DecisionQuestGame({
    challenges,
    completedChallengeIds,
    onSubmit,
    busy,
    savedWrongByChallenge,
    onSaveWrongByChallenge,
}) {
    const firstPendingIdx = Math.max(
        0,
        challenges.findIndex((c) => !completedChallengeIds.includes(c.id))
    );
    const [currentIndex, setCurrentIndex] = useState(firstPendingIdx);
    const [selectedLetter, setSelectedLetter] = useState(null);
    const [solvedLetter, setSolvedLetter] = useState(null);
    const [wrongByChallenge, setWrongByChallenge] = useState(() => savedWrongByChallenge || {});
    const advanceTimerRef = useRef(null);
    const onSaveWrongRef = useRef(onSaveWrongByChallenge);
    const didMountWrongRef = useRef(false);
    onSaveWrongRef.current = onSaveWrongByChallenge;

    useEffect(() => {
        if (!didMountWrongRef.current) {
            didMountWrongRef.current = true;
            return;
        }
        onSaveWrongRef.current?.(wrongByChallenge);
    }, [wrongByChallenge]);

    useEffect(() => {
        return () => clearTimeout(advanceTimerRef.current);
    }, []);

    useEffect(() => {
        const nextIdx = challenges.findIndex((c) => !completedChallengeIds.includes(c.id));
        if (nextIdx !== -1 && nextIdx !== currentIndex) {
            clearTimeout(advanceTimerRef.current);
            advanceTimerRef.current = setTimeout(() => {
                setCurrentIndex(nextIdx);
                setSelectedLetter(null);
                setSolvedLetter(null);
            }, 340);
        }
    }, [completedChallengeIds, challenges, currentIndex]);

    const current = challenges[currentIndex];
    const choices = Object.entries(current?.payload?.choices || {});
    const imageUrl = resolveStorageUrl(current?.payload?.image);
    const wrongLetters = (current && wrongByChallenge[current.id]) || [];

    const handleChoose = useCallback(
        async (letter) => {
            if (!current || busy || solvedLetter || wrongLetters.includes(letter)) return;
            setSelectedLetter(letter);
            const res = await onSubmit(current.id, { choice: letter });
            if (res?.is_correct) {
                setSolvedLetter(letter);
            } else if (res && !res.is_correct) {
                setSelectedLetter(null);
                setWrongByChallenge((prev) => {
                    const prevList = prev[current.id] || [];
                    if (prevList.includes(letter)) return prev;
                    return { ...prev, [current.id]: [...prevList, letter] };
                });
            }
        },
        [busy, current, onSubmit, solvedLetter, wrongLetters]
    );

    useEffect(() => {
        if (!current) return undefined;
        const onKeyDown = (e) => {
            if (busy || solvedLetter || e.ctrlKey || e.metaKey || e.altKey) return;
            if (['INPUT', 'TEXTAREA'].includes(e.target?.tagName)) return;
            const upper = e.key.toUpperCase();
            if (choices.some(([letter]) => letter.toUpperCase() === upper)) {
                e.preventDefault();
                handleChoose(upper);
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [busy, choices, current, handleChoose, solvedLetter]);

    if (!current) return null;

    return (
        <motion.div
            key={current.id}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.14 }}
            className="max-w-2xl mx-auto w-full flex-1 flex flex-col justify-between gap-5"
        >
            {/* Eye-Line Reading Zone */}
            <div className="my-auto space-y-4">
                {imageUrl && (
                    <div className="w-full max-w-lg mx-auto aspect-video rounded-xl overflow-hidden border border-stone-200 bg-stone-100">
                        <img
                            src={imageUrl}
                            alt={`Sitwasyon ${currentIndex + 1}`}
                            className="w-full h-full object-cover object-center"
                            loading="eager"
                        />
                    </div>
                )}

                <div className="space-y-1.5">
                    <p className="text-xs font-semibold text-[#15803D] tabular-nums">
                        Sitwasyon {currentIndex + 1} sa {challenges.length}
                    </p>
                    <h3 className="text-base sm:text-xl font-bold text-stone-900 leading-snug">
                        {current.payload.scenario}
                    </h3>
                </div>
            </div>

            {/* Thumb-Zone Answer Cards */}
            <div className="grid gap-2.5 sm:grid-cols-2 pt-1">
                {choices.map(([letter, text]) => {
                    const isWrong = wrongLetters.includes(letter);
                    const isSolved = solvedLetter === letter;
                    const isPicked = selectedLetter === letter && !isWrong && !isSolved;

                    return (
                        <button
                            key={letter}
                            type="button"
                            disabled={busy || Boolean(solvedLetter) || isWrong}
                            onClick={() => handleChoose(letter)}
                            className={`group w-full min-h-[60px] text-left p-3.5 sm:p-4 rounded-xl border transition-colors flex items-start gap-3 ${
                                isWrong
                                    ? 'border-rose-200 bg-rose-50/70 cursor-not-allowed'
                                    : isSolved
                                      ? 'border-[#15803D] bg-emerald-50 cursor-default'
                                      : isPicked
                                        ? 'border-[#C2410C] bg-orange-50/60 cursor-wait'
                                        : 'border-stone-200 bg-white hover:border-stone-400 hover:bg-stone-50 cursor-pointer disabled:opacity-70'
                            }`}
                        >
                            <span
                                className={`w-7 h-7 rounded-lg text-xs font-bold flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                                    isWrong
                                        ? 'bg-rose-600 text-white'
                                        : isSolved
                                          ? 'bg-[#15803D] text-white'
                                          : isPicked
                                            ? 'bg-[#C2410C] text-white'
                                            : 'bg-stone-100 text-stone-700 group-hover:bg-[#15803D] group-hover:text-white'
                                }`}
                            >
                                {letter}
                            </span>

                            <span
                                className={`text-sm sm:text-[15px] font-medium leading-snug pt-0.5 flex-1 ${
                                    isWrong ? 'text-rose-700/75 line-through' : 'text-stone-800'
                                }`}
                            >
                                {text}
                            </span>

                            {isWrong && <XCircle className="w-4 h-4 text-rose-500 shrink-0 mt-1" />}
                            {isSolved && <CheckCircle2 className="w-4 h-4 text-[#15803D] shrink-0 mt-1" />}
                        </button>
                    );
                })}
            </div>
        </motion.div>
    );
}
