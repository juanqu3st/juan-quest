import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Award, CheckCircle2, Heart, TimerOff, Volume2, VolumeX } from 'lucide-react';
import { resolveStorageUrl } from '../../api/axiosClient';
import { studentApi } from '../../api/studentApi';
import {
    isAudioMuted,
    pickPraiseHeadline,
    playFeedbackAudio,
    setAudioMuted,
    stopAllFeedbackAudio,
    unlockAudio,
} from '../../utils/gameAudio';
import { clearStageResume, saveStageResume } from '../../utils/stageResume';
import { useToast } from '../../context/ToastContext';
import ScenePlaceholderGuide from './ScenePlaceholderGuide';
import PreGameTimerLobby from './PreGameTimerLobby';
import GameHudBar from './GameHudBar';
import HeartLifelineModal from './HeartLifelineModal';
import MultipleChoiceGame from './MultipleChoiceGame';
import DecisionQuestGame from './DecisionQuestGame';
import SequenceChallengeGame from './SequenceChallengeGame';
import MatchingGame from './MatchingGame';
import FourPicsWordGame from './FourPicsWordGame';

const stepMotion = {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -6 },
    transition: { duration: 0.14, ease: 'easeOut' },
};

function resolveInitialStep(map, initialResume) {
    if (map?.progress?.is_completed) return 'already_completed';
    if (map?.progress && !map.progress.is_completed) return 'active_gameplay';
    if (
        initialResume &&
        initialResume.mapId === map?.id &&
        ['scene_guide', 'pre_game_lobby'].includes(initialResume.step)
    ) {
        return initialResume.step;
    }
    return 'scene_guide';
}

function isPerQuestionStrategy(strategyType) {
    return ['multiple_choice', 'four_pics', 'decision_quest'].includes(strategyType);
}

function resolveInitialSeconds(map, initialResume) {
    const serverLimit = map?.progress?.time_limit_used ?? map?.time_limit_seconds ?? 60;
    const perQuestion = isPerQuestionStrategy(map?.strategy_type);

    if (perQuestion) {
        if (
            initialResume &&
            initialResume.mapId === map?.id &&
            typeof initialResume.secondsLeft === 'number' &&
            initialResume.secondsLeft > 0
        ) {
            return Math.min(serverLimit, initialResume.secondsLeft);
        }
        return serverLimit;
    }

    const serverRemaining =
        map?.progress && !map.progress.is_completed
            ? Math.max(1, map.progress.remaining_seconds ?? serverLimit - (map.progress.time_taken_seconds || 0))
            : serverLimit;

    if (
        initialResume &&
        initialResume.mapId === map?.id &&
        typeof initialResume.secondsLeft === 'number' &&
        initialResume.secondsLeft > 0
    ) {
        return Math.min(serverRemaining, initialResume.secondsLeft);
    }
    return serverRemaining;
}

/**
 * Full-screen flat modern stage workspace: scene -> panuto -> questions -> result.
 */
export default function StageModal({
    userId,
    map,
    lesson,
    totalMaps = 5,
    isOfflineMode = false,
    initialResume,
    onClose,
    onStageFinished,
}) {
    const [step, setStep] = useState(() => resolveInitialStep(map, initialResume));
    const [sceneIdx, setSceneIdx] = useState(() =>
        initialResume?.mapId === map?.id ? initialResume.sceneIdx || 0 : 0
    );
    const [loading, setLoading] = useState(false);
    const [muted, setMuted] = useState(() => isAudioMuted());
    const [heartsRemaining, setHeartsRemaining] = useState(
        map?.progress?.hearts_remaining ?? map?.max_hearts ?? 3
    );
    const [projectedScore, setProjectedScore] = useState(
        map?.progress?.earned_points ?? map?.progress?.score ?? 0
    );
    const [timeLimitUsed, setTimeLimitUsed] = useState(
        map?.progress?.time_limit_used ?? map?.time_limit_seconds ?? 60
    );
    const [secondsLeft, setSecondsLeft] = useState(() => resolveInitialSeconds(map, initialResume));
    const [completedChallengeIds, setCompletedChallengeIds] = useState(
        map?.progress?.completed_challenge_ids ?? []
    );
    const [resolvedChallengeIds, setResolvedChallengeIds] = useState(
        map?.progress?.resolved_challenge_ids ?? map?.progress?.completed_challenge_ids ?? []
    );
    const [pendingLifeline, setPendingLifeline] = useState(
        map?.progress?.pending_lifeline ?? null
    );
    const [drafts, setDrafts] = useState(() =>
        initialResume?.mapId === map?.id ? initialResume.drafts || {} : {}
    );
    const { showToast, dismissToast } = useToast();
    const [shakeTrigger, setShakeTrigger] = useState(0);
    const [summaryResult, setSummaryResult] = useState(null);
    const [lastDetails, setLastDetails] = useState(null);

    const timeoutFiredRef = useRef(false);
    const levelEndedRef = useRef(false);
    const pendingLifelineRef = useRef(pendingLifeline);
    const bgmRef = useRef(null);
    const secondsLeftRef = useRef(secondsLeft);
    const timeLimitRef = useRef(timeLimitUsed);
    const totalElapsedRef = useRef(map?.progress?.time_taken_seconds || 0);

    secondsLeftRef.current = secondsLeft;
    timeLimitRef.current = timeLimitUsed;
    pendingLifelineRef.current = pendingLifeline;

    const perQuestionTimer = isPerQuestionStrategy(map?.strategy_type);

    const praiseAudioUrl = resolveStorageUrl(map?.praise_audio_path || lesson?.praise_audio_path);
    const wrongAudioUrl = resolveStorageUrl(map?.wrong_audio_path || lesson?.wrong_audio_path);
    const bgmAudioUrl = resolveStorageUrl(lesson?.bgm_audio_path);

    const handleToggleMute = () => {
        const next = !muted;
        setMuted(next);
        setAudioMuted(next);
        if (bgmRef.current) {
            bgmRef.current.muted = next;
        }
    };

    // Preload all challenge images for the active map so question transitions are instant (0ms image fetch)
    useEffect(() => {
        if (!map?.challenges?.length) return;
        const urls = new Set();
        map.challenges.forEach((ch) => {
            if (ch.payload?.image) {
                const u = resolveStorageUrl(ch.payload.image);
                if (u) urls.add(u);
            }
            if (Array.isArray(ch.payload?.images)) {
                ch.payload.images.forEach((img) => {
                    const u = resolveStorageUrl(img);
                    if (u) urls.add(u);
                });
            }
        });
        urls.forEach((src) => {
            const img = new Image();
            img.src = src;
        });
    }, [map?.id]);

    // Persist resume state continuously for scene_guide, pre_game_lobby, and active_gameplay
    useEffect(() => {
        if (!userId || !map?.id) return;
        if (step === 'already_completed' || step === 'stage_summary') {
            clearStageResume(userId);
            return;
        }
        saveStageResume(userId, {
            mapId: map.id,
            mapNumber: map.map_number,
            step,
            sceneIdx,
            secondsLeft,
            drafts,
        });
    }, [userId, map?.id, map?.map_number, step, sceneIdx, secondsLeft, drafts]);

    // Sync activity status on mount
    useEffect(() => {
        if (!map) return;
        if (map.progress?.is_completed) {
            setStep('already_completed');
            return;
        }
        if (map.progress && !map.progress.is_completed) {
            studentApi.updateStatus('in_game').catch(() => {});
        } else {
            studentApi.updateStatus('viewing_scene_guide').catch(() => {});
        }
    }, [map?.id]);

    // Cleanup timers & audio on unmount
    useEffect(() => {
        return () => {
            dismissToast();
            stopAllFeedbackAudio();
            if (bgmRef.current) {
                bgmRef.current.pause();
                bgmRef.current = null;
            }
        };
    }, [dismissToast]);

    // Optional teacher-uploaded BGM during active gameplay
    useEffect(() => {
        if (step !== 'active_gameplay' || !bgmAudioUrl) {
            if (bgmRef.current) {
                bgmRef.current.pause();
                bgmRef.current = null;
            }
            return undefined;
        }
        const audio = new Audio(bgmAudioUrl);
        audio.loop = true;
        audio.volume = 0.22;
        audio.muted = muted;
        bgmRef.current = audio;
        audio.play().catch(() => {});
        return () => {
            audio.pause();
            if (bgmRef.current === audio) bgmRef.current = null;
        };
    }, [step, bgmAudioUrl]);

    // Countdown timer + keepalive sync on tab close/reload (no noisy background polling competing with submits)
    useEffect(() => {
        if (step !== 'active_gameplay' || !map?.id) return undefined;
        timeoutFiredRef.current = false;

        const syncNow = () => {
            if (levelEndedRef.current) return;
            const elapsed = perQuestionTimer
                ? totalElapsedRef.current
                : Math.max(0, timeLimitRef.current - secondsLeftRef.current);
            studentApi.syncMapKeepalive(map.id, elapsed);
        };

        const onVisibility = () => {
            if (document.visibilityState === 'hidden') syncNow();
        };

        window.addEventListener('beforeunload', syncNow);
        window.addEventListener('pagehide', syncNow);
        document.addEventListener('visibilitychange', onVisibility);

        const interval = setInterval(() => {
            if (levelEndedRef.current) {
                clearInterval(interval);
                return;
            }
            // Pause countdown cleanly while the student decides on the Heart Lifeline modal
            if (pendingLifelineRef.current) {
                return;
            }
            totalElapsedRef.current += 1;
            setSecondsLeft((prev) => {
                if (prev <= 1) {
                    clearInterval(interval);
                    if (!timeoutFiredRef.current && !levelEndedRef.current) {
                        timeoutFiredRef.current = true;
                        handleTimeout();
                    }
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => {
            clearInterval(interval);
            window.removeEventListener('beforeunload', syncNow);
            window.removeEventListener('pagehide', syncNow);
            document.removeEventListener('visibilitychange', onVisibility);
        };
    }, [step, map?.id, perQuestionTimer]);

    const handleDraftChange = useCallback((key, value) => {
        setDrafts((prev) => ({ ...prev, [key]: value }));
    }, []);

    const handleStartGame = async () => {
        unlockAudio();
        setLoading(true);
        dismissToast();
        try {
            const res = await studentApi.startMap(map.id);
            const p = res.progress;
            setHeartsRemaining(p.hearts_remaining);
            setProjectedScore(res.projected_score);
            setCompletedChallengeIds(p.completed_challenge_ids || []);
            setResolvedChallengeIds(p.resolved_challenge_ids || p.completed_challenge_ids || []);
            setPendingLifeline(p.pending_lifeline || null);
            setTimeLimitUsed(p.time_limit_used);
            totalElapsedRef.current = p.time_taken_seconds || 0;
            setSecondsLeft(perQuestionTimer ? p.time_limit_used : (p.remaining_seconds ?? p.time_limit_used));
            setStep('active_gameplay');
        } catch {
            showToast('error', 'Hindi masimulan ang hamon. Pakisubukan muli.', 'Koneksyon.');
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (challengeId, submission) => {
        unlockAudio();
        setLoading(true);
        try {
            const elapsedSeconds = perQuestionTimer
                ? totalElapsedRef.current
                : Math.max(0, timeLimitRef.current - secondsLeftRef.current);
            const data = await studentApi.submitChallenge(map.id, {
                challenge_id: challengeId,
                submission,
                elapsed_seconds: elapsedSeconds,
            });

            setHeartsRemaining(data.hearts_remaining);
            setProjectedScore(data.projected_score);
            setCompletedChallengeIds(data.completed_challenge_ids || []);
            setResolvedChallengeIds(data.resolved_challenge_ids || data.completed_challenge_ids || []);
            setLastDetails(data.details || null);

            if (data.awaiting_lifeline && data.pending_lifeline) {
                playFeedbackAudio('wrong', wrongAudioUrl);
                setPendingLifeline(data.pending_lifeline);
                return data;
            }

            if (!data.is_correct) setShakeTrigger((c) => c + 1);

            if (data.level_ended) {
                levelEndedRef.current = true;
                setPendingLifeline(null);
                dismissToast();
                clearStageResume(userId);
                playFeedbackAudio(
                    data.finish_reason === 'completed' ? 'complete' : 'wrong',
                    data.is_correct ? praiseAudioUrl : wrongAudioUrl
                );
                setSummaryResult({
                    score: data.final_score,
                    hearts_remaining: data.hearts_remaining,
                    finish_reason: data.finish_reason,
                    next_map_number: data.current_map_number,
                    feedback: data.feedback,
                });
                setStep('stage_summary');
            } else {
                // Reset per-question timer when advancing (either answered right OR 0-heart auto-advance)
                if (perQuestionTimer) {
                    setSecondsLeft(timeLimitRef.current);
                }
                const praiseWord = data.is_correct ? pickPraiseHeadline() : '0 pts · Susunod.';
                playFeedbackAudio(
                    data.is_correct ? 'correct' : 'wrong',
                    data.is_correct ? praiseAudioUrl : wrongAudioUrl,
                    praiseWord
                );
                showToast(
                    data.is_correct ? 'success' : 'error',
                    data.feedback,
                    praiseWord
                );
            }
            return data;
        } catch (err) {
            const msg =
                err?.response?.data?.errors?.lifeline?.[0] ||
                err?.response?.data?.message ||
                'Hindi naisumite ang sagot. Pakisuri ang koneksyon at subukan muli.';
            showToast('error', msg);
            return null;
        } finally {
            setLoading(false);
        }
    };

    const handleResolveLifeline = async (action) => {
        unlockAudio();
        setLoading(true);
        try {
            const data = await studentApi.resolveLifeline(map.id, action);
            setPendingLifeline(null);
            setHeartsRemaining(data.hearts_remaining);
            setProjectedScore(data.projected_score);
            setCompletedChallengeIds(data.completed_challenge_ids || []);
            setResolvedChallengeIds(data.resolved_challenge_ids || data.completed_challenge_ids || []);

            if (action === 'use_heart') {
                setShakeTrigger((c) => c + 1);
                showToast('warning', data.feedback, 'Gumamit ng 1 Puso.');
                return;
            }

            if (data.level_ended) {
                levelEndedRef.current = true;
                dismissToast();
                clearStageResume(userId);
                playFeedbackAudio('complete', praiseAudioUrl);
                setSummaryResult({
                    score: data.final_score,
                    hearts_remaining: data.hearts_remaining,
                    finish_reason: data.finish_reason,
                    next_map_number: data.current_map_number,
                    feedback: data.feedback,
                });
                setStep('stage_summary');
            } else {
                if (perQuestionTimer) {
                    setSecondsLeft(timeLimitRef.current);
                }
                showToast('info', data.feedback, 'Naitabi ang Puso.');
            }
        } catch (err) {
            showToast(
                'error',
                err?.response?.data?.message || 'Hindi maproseso ang desisyon sa puso. Subukan muli.'
            );
        } finally {
            setLoading(false);
        }
    };

    const handleTimeout = async () => {
        if (levelEndedRef.current) return;
        levelEndedRef.current = true;
        setLoading(true);
        dismissToast();
        clearStageResume(userId);
        try {
            const data = await studentApi.timeoutMap(map.id);
            playFeedbackAudio('wrong', wrongAudioUrl, 'Naubos na ang oras.');
            setSummaryResult({
                score: data.final_score ?? 2,
                hearts_remaining: data.hearts_remaining ?? 0,
                finish_reason: 'timeout',
                next_map_number: data.current_map_number,
                feedback: data.feedback,
            });
            setStep('stage_summary');
        } finally {
            setLoading(false);
        }
    };

    const handleClose = () => {
        dismissToast();
        stopAllFeedbackAudio();
        clearStageResume(userId);
        studentApi.updateStatus('exploring_world').catch(() => {});
        if (step === 'stage_summary') onStageFinished?.(summaryResult?.next_map_number, map.map_number);
        else onClose();
    };

    if (!map) return null;
    const inGame = step === 'active_gameplay';
    const isFinalMap = map.map_number >= totalMaps;
    const isMultiStep = ['multiple_choice', 'four_pics', 'decision_quest'].includes(map.strategy_type);
    const totalChallenges = map.challenges?.length || 0;
    const doneCount = resolvedChallengeIds.length;
    const progressPercent =
        inGame && isMultiStep && totalChallenges > 0
            ? Math.min(100, Math.round((doneCount / totalChallenges) * 100))
            : 0;

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.985 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
            className="fixed inset-0 z-50 h-dvh bg-[#FAF8F5] flex flex-col"
        >
            {/* Clean Flat Light Header (Safe-Area Aware) */}
            <header className="shrink-0 bg-white border-b border-stone-200 pt-safe px-safe">
                <div className="max-w-5xl mx-auto px-3 sm:px-6 h-14 sm:h-[60px] flex items-center justify-between gap-2 sm:gap-4">
                    <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                        {!inGame && step !== 'stage_summary' && (
                            <button
                                type="button"
                                onClick={handleClose}
                                aria-label="Bumalik"
                                className="shrink-0 min-h-[38px] min-w-[38px] px-2.5 sm:px-3 py-1.5 rounded-lg border border-stone-200 hover:border-stone-300 hover:bg-stone-50 text-stone-700 text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition cursor-pointer"
                            >
                                <ArrowLeft className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                                <span className="hidden sm:inline">Bumalik</span>
                            </button>
                        )}
                        <div className="min-w-0 flex items-baseline gap-1.5 sm:gap-2">
                            <span className="text-xs font-bold text-[#C2410C] shrink-0">
                                <span className="sm:hidden">M{map.map_number}</span>
                                <span className="hidden sm:inline">Mapa {map.map_number}</span>
                            </span>
                            <span className="text-stone-300 hidden sm:inline">/</span>
                            <h2 className="text-xs sm:text-[15px] font-bold text-stone-900 truncate">
                                {map.title}
                            </h2>
                        </div>
                    </div>

                    {inGame && isMultiStep && totalChallenges > 0 && (
                        <div className="hidden md:flex items-center gap-2.5 flex-1 max-w-xs mx-4">
                            <div className="flex-1 h-2 rounded-full bg-stone-200 overflow-hidden">
                                <motion.div
                                    className="h-full bg-[#C2410C] rounded-full"
                                    initial={false}
                                    animate={{ width: `${progressPercent}%` }}
                                    transition={{ duration: 0.2 }}
                                />
                            </div>
                            <span className="text-xs font-semibold text-stone-500 tabular-nums shrink-0">
                                {Math.min(doneCount + 1, totalChallenges)}/{totalChallenges}
                            </span>
                        </div>
                    )}

                    {inGame ? (
                        <GameHudBar
                            heartsRemaining={heartsRemaining}
                            maxHearts={map.max_hearts}
                            secondsLeft={secondsLeft}
                            projectedScore={projectedScore}
                            maxScore={map.perfect_score ?? 10}
                            hideScore={isOfflineMode}
                            shakeTrigger={shakeTrigger}
                            muted={muted}
                            onToggleMute={handleToggleMute}
                        />
                    ) : (
                        <button
                            type="button"
                            onClick={handleToggleMute}
                            aria-label={muted ? 'Buksan ang tunog' : 'I-mute ang tunog'}
                            title={muted ? 'Buksan ang tunog' : 'I-mute ang tunog'}
                            className="w-10 h-10 rounded-xl text-stone-500 hover:text-stone-900 hover:bg-stone-100 inline-flex items-center justify-center transition cursor-pointer shrink-0"
                        >
                            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                        </button>
                    )}
                </div>

                {inGame && isMultiStep && totalChallenges > 0 && (
                    <div className="md:hidden h-1 w-full bg-stone-200 overflow-hidden">
                        <motion.div
                            className="h-full bg-[#C2410C]"
                            initial={false}
                            animate={{ width: `${progressPercent}%` }}
                            transition={{ duration: 0.2 }}
                        />
                    </div>
                )}
            </header>

            {/* Clean Scrollable Workspace (Vertically Balanced, Zero Wasted Bottom Void) */}
            <main className="flex-1 overflow-y-auto px-safe">
                <div className="w-full max-w-4xl mx-auto px-3.5 sm:px-6 py-4 sm:py-6 min-h-full flex flex-col pb-[max(1.25rem,env(safe-area-inset-bottom))]">
                    <AnimatePresence mode="wait">
                        {step === 'already_completed' && (
                            <motion.div key="done" {...stepMotion} className="my-auto">
                                <div className="max-w-md mx-auto bg-white border border-stone-200 rounded-2xl p-6 sm:p-8 text-center space-y-5">
                                    <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-200 text-[#15803D] mx-auto flex items-center justify-center">
                                        <CheckCircle2 className="w-6 h-6" />
                                    </div>
                                    <div className="space-y-1">
                                        <h3 className="text-xl font-bold text-stone-900">Tapos mo na ang mapang ito</h3>
                                        <p className="text-sm text-stone-600">
                                            {isOfflineMode
                                                ? `Naitala na ang inyong sagot para sa Mapa ${map.map_number}.`
                                                : `Naitala na ang iyong puntos para sa Mapa ${map.map_number}.`}
                                        </p>
                                    </div>
                                    {!isOfflineMode && (
                                        <ScoreSummaryRow
                                            score={map.progress.score}
                                            maxScore={map.perfect_score ?? 10}
                                            hearts={map.progress.hearts_remaining}
                                        />
                                    )}
                                    <button
                                        type="button"
                                        onClick={onClose}
                                        className="w-full min-h-[44px] px-6 py-2.5 rounded-xl bg-[#1C1917] hover:bg-stone-800 text-white text-sm font-semibold transition cursor-pointer"
                                    >
                                        Bumalik sa Mapa
                                    </button>
                                </div>
                            </motion.div>
                        )}

                        {step === 'scene_guide' && (
                            <motion.div key="scene" {...stepMotion} className="flex-1 flex flex-col">
                                <ScenePlaceholderGuide
                                    map={map}
                                    lesson={lesson}
                                    initialSceneIdx={sceneIdx}
                                    onSceneIdxChange={setSceneIdx}
                                    onContinue={() => setStep('pre_game_lobby')}
                                />
                            </motion.div>
                        )}

                        {step === 'pre_game_lobby' && (
                            <motion.div key="lobby" {...stepMotion} className="my-auto">
                                <PreGameTimerLobby map={map} loading={loading} onStart={handleStartGame} />
                            </motion.div>
                        )}

                        {inGame && (
                            <motion.div key="game" {...stepMotion} className="flex-1 flex flex-col">
                                {map.strategy_type === 'multiple_choice' && (
                                    <MultipleChoiceGame
                                        challenges={map.challenges}
                                        completedChallengeIds={resolvedChallengeIds}
                                        onSubmit={handleSubmit}
                                        busy={loading || Boolean(pendingLifeline)}
                                        savedWrongByChallenge={drafts.wrongLettersByChallenge}
                                        onSaveWrongByChallenge={(val) =>
                                            handleDraftChange('wrongLettersByChallenge', val)
                                        }
                                    />
                                )}
                                {map.strategy_type === 'decision_quest' && (
                                    <DecisionQuestGame
                                        challenges={map.challenges}
                                        completedChallengeIds={resolvedChallengeIds}
                                        onSubmit={handleSubmit}
                                        busy={loading || Boolean(pendingLifeline)}
                                        savedWrongByChallenge={drafts.wrongLettersByChallenge}
                                        onSaveWrongByChallenge={(val) =>
                                            handleDraftChange('wrongLettersByChallenge', val)
                                        }
                                    />
                                )}
                                {map.strategy_type === 'sequence' && (
                                    <SequenceChallengeGame
                                        challenges={map.challenges}
                                        onSubmit={handleSubmit}
                                        busy={loading || Boolean(pendingLifeline)}
                                        savedOrder={drafts.sequenceOrder}
                                        onSaveOrder={(val) => handleDraftChange('sequenceOrder', val)}
                                    />
                                )}
                                {map.strategy_type === 'matching' && (
                                    <MatchingGame
                                        challenges={map.challenges}
                                        onSubmit={handleSubmit}
                                        busy={loading || Boolean(pendingLifeline)}
                                        lastDetails={lastDetails}
                                        savedPairs={drafts.matchingPairs}
                                        onSavePairs={(val) => handleDraftChange('matchingPairs', val)}
                                        savedLockedIds={drafts.matchingLockedIds}
                                        onSaveLockedIds={(val) => handleDraftChange('matchingLockedIds', val)}
                                    />
                                )}
                                {map.strategy_type === 'four_pics' && (
                                    <FourPicsWordGame
                                        challenges={map.challenges}
                                        completedChallengeIds={resolvedChallengeIds}
                                        onSubmit={handleSubmit}
                                        busy={loading || Boolean(pendingLifeline)}
                                        savedPickedByChallenge={drafts.fourPicsPickedByChallenge}
                                        onSavePickedByChallenge={(val) =>
                                            handleDraftChange('fourPicsPickedByChallenge', val)
                                        }
                                    />
                                )}
                            </motion.div>
                        )}

                        {step === 'stage_summary' && summaryResult && (
                            <motion.div key="summary" {...stepMotion} className="my-auto">
                                <div className="max-w-md mx-auto bg-white border border-stone-200 rounded-2xl p-6 sm:p-8 text-center space-y-5">
                                    <div
                                        className={`w-12 h-12 rounded-xl mx-auto flex items-center justify-center border ${
                                            summaryResult.finish_reason === 'timeout'
                                                ? 'bg-amber-50 border-amber-200 text-amber-700'
                                                : summaryResult.finish_reason === 'hearts_depleted'
                                                  ? 'bg-rose-50 border-rose-200 text-rose-700'
                                                  : 'bg-emerald-50 border-emerald-200 text-[#15803D]'
                                        }`}
                                    >
                                        {summaryResult.finish_reason === 'timeout' ? (
                                            <TimerOff className="w-6 h-6" />
                                        ) : (
                                            <Award className="w-6 h-6" />
                                        )}
                                    </div>

                                    <div className="space-y-1.5">
                                        <h3 className="text-xl sm:text-2xl font-bold text-stone-900">
                                            {summaryResult.finish_reason === 'timeout'
                                                ? 'Naubos na ang oras'
                                                : summaryResult.finish_reason === 'hearts_depleted'
                                                  ? 'Naubos na ang 3 puso'
                                                  : isFinalMap
                                                    ? 'Natapos mo ang huling mapa!'
                                                    : 'Tapos na ang mapa'}
                                        </h3>
                                        <p className="text-sm text-stone-600 leading-relaxed">
                                            {isOfflineMode
                                                ? summaryResult.finish_reason === 'timeout'
                                                    ? 'Naubos na ang oras. Naitala na ang inyong sagot at nabuksan ang susunod na mapa.'
                                                    : isFinalMap
                                                      ? 'Kumpleto na ang lahat ng 5 mapa! Kunin na ang iyong Result QR upang i-scan ng guro.'
                                                      : 'Naitala na ang inyong sagot! Handa na ang susunod na mapa.'
                                                : summaryResult.feedback}
                                        </p>
                                    </div>

                                    {!isOfflineMode && (
                                        <ScoreSummaryRow
                                            score={summaryResult.score}
                                            maxScore={map.perfect_score ?? 10}
                                            hearts={summaryResult.hearts_remaining}
                                        />
                                    )}

                                    <button
                                        type="button"
                                        onClick={handleClose}
                                        className="w-full min-h-[46px] px-6 py-2.5 rounded-xl bg-[#15803D] hover:bg-[#166534] text-white font-semibold text-sm inline-flex items-center justify-center gap-2 transition cursor-pointer"
                                    >
                                        <span>
                                            {isFinalMap
                                                ? isOfflineMode
                                                    ? 'Kunin ang Result QR'
                                                    : 'Tingnan ang Buod ng Puntos'
                                                : 'Magpatuloy sa Mapa'}
                                        </span>
                                        <ArrowRight className="w-4 h-4" />
                                    </button>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </main>

            <HeartLifelineModal
                open={inGame && Boolean(pendingLifeline)}
                heartsRemaining={heartsRemaining}
                maxHearts={map.max_hearts ?? 3}
                pendingLifeline={pendingLifeline}
                busy={loading}
                onUseHeart={() => handleResolveLifeline('use_heart')}
                onSkip={() => handleResolveLifeline('skip')}
            />
        </motion.div>
    );
}

function ScoreSummaryRow({ score, maxScore = 10, hearts }) {
    return (
        <div className="grid grid-cols-2 divide-x divide-stone-200 rounded-xl bg-[#FAF8F5] border border-stone-200 py-3.5">
            <div>
                <p className="text-xs text-stone-500">Puntos</p>
                <p className="text-2xl font-bold text-[#C2410C] tabular-nums mt-0.5">
                    {score} <span className="text-sm font-medium text-stone-400">/ {maxScore}</span>
                </p>
            </div>
            <div>
                <p className="text-xs text-stone-500">Natirang puso</p>
                <p className="text-2xl font-bold text-rose-600 inline-flex items-center justify-center gap-1.5 tabular-nums mt-0.5">
                    <Heart className="w-5 h-5 fill-rose-600" />
                    <span>{hearts}</span>
                    <span className="text-sm font-medium text-stone-400">/ 3</span>
                </p>
            </div>
        </div>
    );
}
