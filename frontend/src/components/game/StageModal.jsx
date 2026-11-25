import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Award, CheckCircle2, Heart, KeyRound, Keyboard, LogOut, Map, QrCode, Settings, TimerOff, X } from 'lucide-react';
import { resolveStorageUrl } from '../../api/axiosClient';
import { studentApi } from '../../api/studentApi';
import { resetOfflineMapWithTeacherAuth } from '../../utils/offlineEngine';
import { resolveCachedAudioUrl } from '../../utils/videoCache';
import QrScannerBox from '../qr/QrScannerBox';
import {
    getAudioVolume,
    pickPraiseHeadline,
    playFeedbackAudio,
    preloadFeedbackAudio,
    setAudioVolume,
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
import VictoryConfettiCanvas, { useCountUp } from './VictoryConfettiCanvas';

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
    return ['multiple_choice', 'decision_quest'].includes(strategyType);
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
    onOfflineMapReset,
    onQuitSession,
}) {
    const [step, setStep] = useState(() => resolveInitialStep(map, initialResume));
    const [sceneIdx, setSceneIdx] = useState(() =>
        initialResume?.mapId === map?.id ? initialResume.sceneIdx || 0 : 0
    );
    const [loading, setLoading] = useState(false);
    const [volumePct, setVolumePct] = useState(() => Math.round(getAudioVolume() * 100));
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [quitConfirm, setQuitConfirm] = useState(false);
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
    const [lifelineDelaying, setLifelineDelaying] = useState(false);
    const [feedbackLock, setFeedbackLock] = useState(false);
    const [drafts, setDrafts] = useState(() =>
        initialResume?.mapId === map?.id ? initialResume.drafts || {} : {}
    );
    const { showToast, dismissToast } = useToast();
    const [shakeTrigger, setShakeTrigger] = useState(0);
    const [summaryResult, setSummaryResult] = useState(null);
    const [lastDetails, setLastDetails] = useState(null);
    const [showOfflineUnlock, setShowOfflineUnlock] = useState(false);
    const [offlineUnlockScan, setOfflineUnlockScan] = useState(true);
    const [offlineUnlockCode, setOfflineUnlockCode] = useState('');
    const [offlineUnlockError, setOfflineUnlockError] = useState('');

    const timeoutFiredRef = useRef(false);
    const levelEndedRef = useRef(false);
    const pendingLifelineRef = useRef(pendingLifeline);
    const lifelineDelayingRef = useRef(false);
    const feedbackLockRef = useRef(false);
    const feedbackSeqRef = useRef(0);
    const lifelineDelayTimerRef = useRef(null);
    const bgmRef = useRef(null);
    const secondsLeftRef = useRef(secondsLeft);
    const timeLimitRef = useRef(timeLimitUsed);
    const totalElapsedRef = useRef(map?.progress?.time_taken_seconds || 0);
    const draftsRef = useRef(drafts);

    secondsLeftRef.current = secondsLeft;
    timeLimitRef.current = timeLimitUsed;
    pendingLifelineRef.current = pendingLifeline;
    lifelineDelayingRef.current = lifelineDelaying;
    feedbackLockRef.current = feedbackLock;
    draftsRef.current = drafts;

    useEffect(() => {
        return () => {
            feedbackSeqRef.current += 1;
            clearTimeout(lifelineDelayTimerRef.current);
        };
    }, []);

    const perQuestionTimer = isPerQuestionStrategy(map?.strategy_type);

    const praiseAudioUrl = resolveStorageUrl(map?.praise_audio_path || lesson?.praise_audio_path);
    const wrongAudioUrl = resolveStorageUrl(map?.wrong_audio_path || lesson?.wrong_audio_path);
    const bgmAudioUrl = resolveStorageUrl(lesson?.bgm_audio_path);

    // Preload teacher praise/wrong audio into memory Blob URLs as soon as the map opens (0ms production playback!)
    useEffect(() => {
        preloadFeedbackAudio([praiseAudioUrl, wrongAudioUrl]);
    }, [praiseAudioUrl, wrongAudioUrl]);

    const handleVolumeChange = (nextPct) => {
        const clamped = Math.max(0, Math.min(100, Math.round(Number(nextPct) || 0)));
        setVolumePct(clamped);
        setAudioVolume(clamped / 100);
        if (bgmRef.current) {
            bgmRef.current.volume = (clamped / 100) * 0.22;
            bgmRef.current.muted = clamped <= 0;
        }
    };

    const openSettingsSheet = () => {
        setQuitConfirm(false);
        setSettingsOpen(true);
    };

    const closeSettingsSheet = () => {
        setSettingsOpen(false);
        setQuitConfirm(false);
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

    // Optional teacher-uploaded BGM during active gameplay (supports offline CacheStorage!)
    useEffect(() => {
        if (step !== 'active_gameplay' || !bgmAudioUrl) {
            if (bgmRef.current) {
                bgmRef.current.pause();
                bgmRef.current = null;
            }
            return undefined;
        }
        let cancelled = false;
        let bgmBlobUrl = null;
        let audio = null;

        resolveCachedAudioUrl(bgmAudioUrl)
            .then(({ url, isObjectUrl }) => {
                if (cancelled) {
                    if (isObjectUrl && url) URL.revokeObjectURL(url);
                    return;
                }
                if (isObjectUrl && url) bgmBlobUrl = url;
                const initialVol = getAudioVolume();
                audio = new Audio(url || bgmAudioUrl);
                audio.loop = true;
                audio.volume = initialVol * 0.22;
                audio.muted = initialVol <= 0;
                bgmRef.current = audio;
                audio.play().catch(() => {});
            })
            .catch(() => {});

        return () => {
            cancelled = true;
            if (audio) {
                audio.pause();
                if (bgmRef.current === audio) bgmRef.current = null;
            }
            if (bgmBlobUrl) {
                try {
                    URL.revokeObjectURL(bgmBlobUrl);
                } catch {
                    // ignore
                }
            }
        };
    }, [step, bgmAudioUrl]);

    // Countdown timer + keepalive sync on tab close/reload (pure state updater — timeout runs cleanly in effect below!)
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
            // Pause countdown cleanly while praise/wrong feedback plays OR while deciding on the Heart Lifeline modal
            if (pendingLifelineRef.current || lifelineDelayingRef.current || feedbackLockRef.current) {
                return;
            }
            totalElapsedRef.current += 1;
            setSecondsLeft((prev) => (prev <= 1 ? 0 : prev - 1));
        }, 1000);

        return () => {
            clearInterval(interval);
            window.removeEventListener('beforeunload', syncNow);
            window.removeEventListener('pagehide', syncNow);
            document.removeEventListener('visibilitychange', onVisibility);
        };
    }, [step, map?.id, perQuestionTimer]);

    // Pure side-effect trigger when countdown hits 0 (never inside setSecondsLeft updater!)
    useEffect(() => {
        if (
            step === 'active_gameplay' &&
            secondsLeft === 0 &&
            !pendingLifelineRef.current &&
            !lifelineDelayingRef.current &&
            !feedbackLockRef.current &&
            !timeoutFiredRef.current &&
            !levelEndedRef.current
        ) {
            timeoutFiredRef.current = true;
            handleTimeout();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [step, secondsLeft]);

    const handleDraftChange = useCallback((key, value) => {
        setDrafts((prev) => {
            if (prev[key] === value) return prev;
            try {
                if (JSON.stringify(prev[key]) === JSON.stringify(value)) return prev;
            } catch {
                // ignore non-serializable values
            }
            return { ...prev, [key]: value };
        });
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
            setLastDetails(data.details || null);

            const seq = ++feedbackSeqRef.current;

            if (data.awaiting_lifeline && data.pending_lifeline) {
                setCompletedChallengeIds(data.completed_challenge_ids || []);
                setResolvedChallengeIds(data.resolved_challenge_ids || data.completed_challenge_ids || []);
                setShakeTrigger((c) => c + 1);
                // Pause timer & wait cleanly for wrong feedback audio + shake animation before sliding up Heart Lifeline!
                lifelineDelayingRef.current = true;
                setLifelineDelaying(true);
                const nextLifeline = data.pending_lifeline;
                playFeedbackAudio('wrong', wrongAudioUrl, undefined, { minWaitMs: 520, maxWaitMs: 2600 }).then(() => {
                    if (feedbackSeqRef.current !== seq) return;
                    lifelineDelayingRef.current = false;
                    setLifelineDelaying(false);
                    setPendingLifeline(nextLifeline);
                });
                return data;
            }

            if (!data.is_correct) setShakeTrigger((c) => c + 1);

            if (data.level_ended) {
                levelEndedRef.current = true;
                setPendingLifeline(null);
                dismissToast();
                clearStageResume(userId);

                // Keep final question/board visible with green confirmation while full papuri/wrong audio finishes!
                feedbackLockRef.current = true;
                setFeedbackLock(true);
                if (data.is_correct) {
                    showToast('success', data.feedback, pickPraiseHeadline());
                }
                const nextSummary = {
                    score: data.final_score ?? 0,
                    hearts_remaining: data.hearts_remaining,
                    finish_reason: data.finish_reason,
                    next_map_number: data.current_map_number,
                    feedback: data.feedback,
                };
                playFeedbackAudio(
                    data.finish_reason === 'completed' ? 'complete' : 'wrong',
                    data.is_correct ? praiseAudioUrl : wrongAudioUrl,
                    undefined,
                    { minWaitMs: 650, maxWaitMs: 3800 }
                ).then(() => {
                    if (feedbackSeqRef.current !== seq) return;
                    feedbackLockRef.current = false;
                    setFeedbackLock(false);
                    dismissToast();
                    setCompletedChallengeIds(data.completed_challenge_ids || []);
                    setResolvedChallengeIds(data.resolved_challenge_ids || data.completed_challenge_ids || []);
                    setSummaryResult(nextSummary);
                    setStep('stage_summary');
                });
            } else {
                const toastHeading = data.is_correct
                    ? pickPraiseHeadline()
                    : isOfflineMode
                      ? 'Susunod na tanong.'
                      : '0 pts · Susunod.';
                const spokenLabel = data.is_correct ? toastHeading : 'Susunod na tanong.';

                // Pause countdown & let student see the green/red result AND hear the full praise before advancing!
                feedbackLockRef.current = true;
                setFeedbackLock(true);
                showToast(
                    data.is_correct ? 'success' : 'error',
                    data.feedback,
                    toastHeading
                );
                playFeedbackAudio(
                    data.is_correct ? 'correct' : 'wrong',
                    data.is_correct ? praiseAudioUrl : wrongAudioUrl,
                    spokenLabel,
                    { minWaitMs: 520, maxWaitMs: 3600 }
                ).then(() => {
                    if (feedbackSeqRef.current !== seq) return;
                    feedbackLockRef.current = false;
                    setFeedbackLock(false);
                    setCompletedChallengeIds(data.completed_challenge_ids || []);
                    setResolvedChallengeIds(data.resolved_challenge_ids || data.completed_challenge_ids || []);
                    if (perQuestionTimer) {
                        timeoutFiredRef.current = false;
                        setSecondsLeft(timeLimitRef.current);
                    }
                });
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
                    score: data.final_score ?? 0,
                    hearts_remaining: data.hearts_remaining,
                    finish_reason: data.finish_reason,
                    next_map_number: data.current_map_number,
                    feedback: data.feedback,
                });
                setStep('stage_summary');
            } else {
                if (perQuestionTimer) {
                    timeoutFiredRef.current = false;
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
        setLoading(true);
        dismissToast();
        try {
            let timeoutPayload = null;
            if (perQuestionTimer) {
                const activeCh = (map.challenges || []).find((c) => !resolvedChallengeIds.includes(c.id));
                if (activeCh) {
                    timeoutPayload = { challenge_id: activeCh.id };
                }
            } else if (map.strategy_type === 'matching' && draftsRef.current?.matchingPairs) {
                timeoutPayload = { submission: { pairs: draftsRef.current.matchingPairs } };
            } else if (map.strategy_type === 'sequence' && Array.isArray(draftsRef.current?.sequenceSlots)) {
                timeoutPayload = { submission: { order: draftsRef.current.sequenceSlots } };
            }

            const data = await studentApi.timeoutMap(map.id, timeoutPayload);
            setHeartsRemaining(data.hearts_remaining ?? heartsRemaining);
            if (data.projected_score !== undefined) setProjectedScore(data.projected_score);
            if (Array.isArray(data.completed_challenge_ids)) setCompletedChallengeIds(data.completed_challenge_ids);
            if (Array.isArray(data.resolved_challenge_ids)) {
                setResolvedChallengeIds(data.resolved_challenge_ids);
            } else if (Array.isArray(data.completed_challenge_ids)) {
                setResolvedChallengeIds(data.completed_challenge_ids);
            }

            // Per-question timeout with hearts remaining -> offer Heart Lifeline for fresh question time!
            if (data.awaiting_lifeline && data.pending_lifeline) {
                setShakeTrigger((c) => c + 1);
                playFeedbackAudio('wrong', wrongAudioUrl, 'Naubos na ang oras sa tanong.');
                setPendingLifeline(data.pending_lifeline);
                return;
            }

            // Per-question timeout with 0 hearts remaining -> auto 0 pts & immediately move to next question!
            if (!data.level_ended) {
                setShakeTrigger((c) => c + 1);
                timeoutFiredRef.current = false;
                setSecondsLeft(timeLimitRef.current);
                playFeedbackAudio('wrong', wrongAudioUrl, 'Naubos na ang oras.');
                showToast(
                    'error',
                    data.feedback || 'Naubos ang oras sa tanong na ito.',
                    isOfflineMode ? 'Susunod na tanong.' : '0 pts · Susunod.'
                );
                return;
            }

            // Whole-map timeout OR last question of a per-question map resolved
            levelEndedRef.current = true;
            setPendingLifeline(null);
            clearStageResume(userId);
            playFeedbackAudio(
                data.finish_reason === 'completed' ? 'complete' : 'wrong',
                data.finish_reason === 'completed' ? praiseAudioUrl : wrongAudioUrl,
                data.finish_reason === 'completed' ? 'Tapos na ang mapa!' : 'Naubos na ang oras.'
            );
            setSummaryResult({
                score: data.final_score ?? 0,
                hearts_remaining: data.hearts_remaining ?? 0,
                finish_reason: data.finish_reason || 'timeout',
                next_map_number: data.current_map_number,
                feedback: data.feedback,
            });
            setStep('stage_summary');
        } catch {
            // Never strand the student on a frozen 0:00 timer if the timeout request failed transiently
            levelEndedRef.current = false;
            timeoutFiredRef.current = false;
            showToast(
                'error',
                'Naubos ang oras pero mahina ang koneksyon. Sinusubukang itala muli...',
                'Koneksyon.'
            );
            setTimeout(() => {
                if (!levelEndedRef.current && !timeoutFiredRef.current) {
                    timeoutFiredRef.current = true;
                    handleTimeout();
                }
            }, 2500);
        } finally {
            setLoading(false);
        }
    };

    const syncElapsedBeforeExit = () => {
        if (step === 'active_gameplay' && map?.id && !levelEndedRef.current) {
            const elapsed = perQuestionTimer
                ? totalElapsedRef.current
                : Math.max(0, timeLimitRef.current - secondsLeftRef.current);
            studentApi.syncMapKeepalive(map.id, elapsed);
        }
    };

    const handleClose = () => {
        feedbackSeqRef.current += 1;
        feedbackLockRef.current = false;
        setFeedbackLock(false);
        syncElapsedBeforeExit();
        dismissToast();
        stopAllFeedbackAudio();
        clearStageResume(userId);
        studentApi.updateStatus('exploring_world').catch(() => {});
        if (step === 'stage_summary') onStageFinished?.(summaryResult?.next_map_number, map.map_number);
        else onClose();
    };

    const handleReturnToMapFromSettings = () => {
        closeSettingsSheet();
        handleClose();
    };

    const handleConfirmQuit = () => {
        feedbackSeqRef.current += 1;
        feedbackLockRef.current = false;
        setFeedbackLock(false);
        syncElapsedBeforeExit();
        dismissToast();
        stopAllFeedbackAudio();
        clearStageResume(userId);
        closeSettingsSheet();
        if (onQuitSession) {
            onQuitSession();
        } else {
            onClose();
        }
    };

    const handleOfflineTeacherUnlock = async ({ code = '', qrPayload = null }) => {
        setOfflineUnlockError('');
        const res = await resetOfflineMapWithTeacherAuth(map.id, map.map_number, { code, qrPayload });
        if (!res.ok) {
            setOfflineUnlockError(res.message);
            return;
        }
        setShowOfflineUnlock(false);
        setOfflineUnlockCode('');
        setOfflineUnlockError('');
        await onOfflineMapReset?.(res.resetAll);

        if (res.resetAll) {
            showToast('success', 'Na-reset ang buong laro! Maaari nang magsimula sa Mapa 1.', 'Na-unlock.');
            onClose();
            return;
        }

        // Immediately reopen this exact map from fresh Story / Panuto with full 3/3 hearts & timer!
        levelEndedRef.current = false;
        timeoutFiredRef.current = false;
        totalElapsedRef.current = 0;
        setHeartsRemaining(map.max_hearts ?? 3);
        setProjectedScore(0);
        setCompletedChallengeIds([]);
        setResolvedChallengeIds([]);
        setPendingLifeline(null);
        setDrafts({});
        setLastDetails(null);
        setSummaryResult(null);
        setTimeLimitUsed(map.time_limit_seconds ?? 60);
        setSecondsLeft(map.time_limit_seconds ?? 60);
        setSceneIdx(0);
        setStep('scene_guide');
        showToast('success', `Na-unlock ang Mapa ${map.map_number}! Maaari nang sagutan muli.`, 'Handa sa Retake.');
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
                            muted={volumePct <= 0}
                            onOpenSettings={openSettingsSheet}
                        />
                    ) : (
                        <button
                            type="button"
                            onClick={openSettingsSheet}
                            aria-label="Mga Setting ng Laro"
                            title="Mga Setting ng Laro"
                            className="w-10 h-10 rounded-xl text-stone-500 hover:text-stone-900 hover:bg-stone-100 active:scale-95 inline-flex items-center justify-center transition cursor-pointer shrink-0"
                        >
                            <Settings className="w-4 h-4" />
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

                                    {isOfflineMode && (
                                        <div className="pt-2 border-t border-stone-100">
                                            {!showOfflineUnlock ? (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setShowOfflineUnlock(true);
                                                        setOfflineUnlockScan(true);
                                                        setOfflineUnlockError('');
                                                    }}
                                                    className="inline-flex items-center gap-1.5 text-xs font-bold text-stone-400 hover:text-[#C2410C] cursor-pointer transition"
                                                >
                                                    <KeyRound className="w-3.5 h-3.5" />
                                                    <span>I-unlock ng Guro</span>
                                                </button>
                                            ) : (
                                                <div className="rounded-xl bg-stone-50 border border-stone-200 p-3.5 text-left space-y-2.5">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <span className="text-[11px] font-bold text-stone-700">
                                                            I-unlock ang Mapa {map.map_number} (Para sa Guro)
                                                        </span>
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setOfflineUnlockScan((v) => !v);
                                                                setOfflineUnlockError('');
                                                            }}
                                                            className="inline-flex items-center gap-1 text-[11px] font-bold text-[#C2410C] cursor-pointer"
                                                        >
                                                            {offlineUnlockScan ? (
                                                                <>
                                                                    <Keyboard className="w-3 h-3" />
                                                                    <span>I-type Code</span>
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <QrCode className="w-3 h-3" />
                                                                    <span>I-scan QR</span>
                                                                </>
                                                            )}
                                                        </button>
                                                    </div>

                                                    {offlineUnlockError && (
                                                        <p className="text-[11px] font-semibold text-rose-600">
                                                            {offlineUnlockError}
                                                        </p>
                                                    )}

                                                    {offlineUnlockScan ? (
                                                        <QrScannerBox
                                                            active={showOfflineUnlock && offlineUnlockScan}
                                                            onScan={(decoded) => {
                                                                try {
                                                                    const parsed = JSON.parse(decoded);
                                                                    handleOfflineTeacherUnlock({ qrPayload: parsed });
                                                                } catch {
                                                                    setOfflineUnlockError(
                                                                        'Hindi mabasa ang Teacher Unblock QR.'
                                                                    );
                                                                }
                                                            }}
                                                        />
                                                    ) : (
                                                        <div className="flex gap-2">
                                                            <input
                                                                type="text"
                                                                maxLength={12}
                                                                value={offlineUnlockCode}
                                                                onChange={(e) => {
                                                                    setOfflineUnlockCode(e.target.value.toUpperCase());
                                                                    setOfflineUnlockError('');
                                                                }}
                                                                placeholder="6-char code"
                                                                className="flex-1 min-w-0 h-9 rounded-lg border border-stone-200 bg-white px-3 text-xs font-mono font-bold tracking-widest uppercase text-stone-900 focus:border-[#C2410C] outline-none"
                                                            />
                                                            <button
                                                                type="button"
                                                                onClick={() =>
                                                                    handleOfflineTeacherUnlock({
                                                                        code: offlineUnlockCode,
                                                                    })
                                                                }
                                                                className="h-9 px-3.5 rounded-lg bg-[#C2410C] hover:bg-[#9A3412] text-white text-xs font-bold cursor-pointer shrink-0"
                                                            >
                                                                I-unlock
                                                            </button>
                                                        </div>
                                                    )}

                                                    <div className="text-right">
                                                        <button
                                                            type="button"
                                                            onClick={() => setShowOfflineUnlock(false)}
                                                            className="text-[11px] font-semibold text-stone-400 hover:text-stone-700 cursor-pointer"
                                                        >
                                                            Kanselahin
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
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
                                        busy={loading || Boolean(pendingLifeline) || lifelineDelaying || feedbackLock}
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
                                        busy={loading || Boolean(pendingLifeline) || lifelineDelaying || feedbackLock}
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
                                        busy={loading || Boolean(pendingLifeline) || lifelineDelaying || feedbackLock}
                                        savedOrder={drafts.sequenceSlots}
                                        onSaveOrder={(val) => handleDraftChange('sequenceSlots', val)}
                                    />
                                )}
                                {map.strategy_type === 'matching' && (
                                    <MatchingGame
                                        challenges={map.challenges}
                                        onSubmit={handleSubmit}
                                        busy={loading || Boolean(pendingLifeline) || lifelineDelaying || feedbackLock}
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
                                        busy={loading || Boolean(pendingLifeline) || lifelineDelaying || feedbackLock}
                                        savedPickedByChallenge={drafts.fourPicsPickedByChallenge}
                                        onSavePickedByChallenge={(val) =>
                                            handleDraftChange('fourPicsPickedByChallenge', val)
                                        }
                                    />
                                )}
                            </motion.div>
                        )}

                        {step === 'stage_summary' && summaryResult && (
                            <motion.div key="summary" {...stepMotion} className="my-auto relative">
                                {summaryResult.finish_reason !== 'timeout' &&
                                    summaryResult.finish_reason !== 'hearts_depleted' && (
                                        <VictoryConfettiCanvas active={true} intensity="normal" burstOriginY={0.34} />
                                    )}
                                <div className="relative z-20 max-w-md mx-auto bg-white border border-stone-200 rounded-2xl p-6 sm:p-8 text-center space-y-5">
                                    <div
                                        className={`w-12 h-12 rounded-xl mx-auto flex items-center justify-center border ${
                                            summaryResult.finish_reason === 'timeout'
                                                ? 'bg-amber-50 border-amber-200 text-amber-700'
                                                : summaryResult.finish_reason === 'hearts_depleted'
                                                  ? 'bg-rose-50 border-rose-200 text-rose-700'
                                                  : 'bg-emerald-50 border-emerald-200 text-[#15803D] jq-pop'
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
                                            animate={true}
                                        />
                                    )}

                                    <button
                                        type="button"
                                        onClick={handleClose}
                                        className="w-full min-h-[46px] px-6 py-2.5 rounded-xl bg-[#15803D] hover:bg-[#166534] active:scale-[0.99] text-white font-semibold text-sm inline-flex items-center justify-center gap-2 transition cursor-pointer"
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
                hideScores={isOfflineMode}
                busy={loading}
                onUseHeart={() => handleResolveLifeline('use_heart')}
                onSkip={() => handleResolveLifeline('skip')}
            />

            {/* Clean Settings Bottom Sheet (Volume + Return to 3D Map + Safe Mid-Game Quit) */}
            <AnimatePresence>
                {settingsOpen && (
                    <motion.div
                        key="stage-settings-backdrop"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.16 }}
                        onClick={closeSettingsSheet}
                        className="fixed inset-0 z-[72] bg-stone-950/45 backdrop-blur-[2px] flex items-end sm:items-center justify-center sm:p-4"
                    >
                        <motion.div
                            key="stage-settings-sheet"
                            initial={{ y: 28, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{ y: 24, opacity: 0 }}
                            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                            onClick={(e) => e.stopPropagation()}
                            className="w-full sm:max-w-sm rounded-t-3xl sm:rounded-2xl bg-white border-t sm:border border-stone-200 shadow-2xl overflow-hidden pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:pb-0"
                        >
                            {/* Mobile drag-handle indicator */}
                            <div className="sm:hidden flex justify-center pt-2.5 pb-0.5">
                                <div className="w-9 h-1 rounded-full bg-stone-200" />
                            </div>

                            <div className="px-5 py-3.5 border-b border-stone-100 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Settings className="w-4 h-4 text-[#C2410C]" />
                                    <h3 className="text-sm font-bold text-stone-900">Mga Setting ng Laro</h3>
                                </div>
                                <button
                                    type="button"
                                    onClick={closeSettingsSheet}
                                    aria-label="Isara ang setting"
                                    className="w-8 h-8 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 inline-flex items-center justify-center transition cursor-pointer"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>

                            <div className="p-5 space-y-4">
                                {/* Volume Slider (Zero Mute Icon) */}
                                <div className="rounded-xl bg-[#FAF8F5] border border-stone-200/90 p-3.5 space-y-2.5">
                                    <div className="flex items-center justify-between gap-2">
                                        <label
                                            htmlFor="jq-master-volume"
                                            className="text-xs font-bold text-stone-700"
                                        >
                                            Lakas ng Tunog
                                        </label>
                                        <span className="text-xs font-bold text-[#C2410C] tabular-nums">
                                            {volumePct === 0 ? 'Tahimik (0%)' : `${volumePct}%`}
                                        </span>
                                    </div>
                                    <input
                                        id="jq-master-volume"
                                        type="range"
                                        min={0}
                                        max={100}
                                        step={1}
                                        value={volumePct}
                                        onChange={(e) => handleVolumeChange(e.target.value)}
                                        className="w-full h-2 accent-[#C2410C] cursor-pointer"
                                    />
                                    <p className="text-[11px] text-stone-500 leading-snug">
                                        Kinokontrol ang boses ng guro, video, at tunog ng laro.
                                    </p>
                                </div>

                                {!quitConfirm ? (
                                    <div className="space-y-2">
                                        <button
                                            type="button"
                                            onClick={handleReturnToMapFromSettings}
                                            className="w-full min-h-[46px] px-4 py-2.5 rounded-xl border border-stone-200 bg-white hover:bg-stone-50 active:scale-[0.99] text-stone-800 flex items-center justify-between gap-3 transition cursor-pointer text-left"
                                        >
                                            <span className="inline-flex items-center gap-2.5 text-xs sm:text-sm font-semibold">
                                                <Map className="w-4 h-4 text-stone-500 shrink-0" />
                                                <span>Bumalik sa 3D Mapa</span>
                                            </span>
                                            <span className="text-[11px] text-stone-400 font-medium shrink-0">
                                                Naka-save
                                            </span>
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => setQuitConfirm(true)}
                                            className="w-full min-h-[46px] px-4 py-2.5 rounded-xl border border-rose-200 bg-rose-50/70 hover:bg-rose-100/70 active:scale-[0.99] text-rose-700 flex items-center justify-between gap-3 transition cursor-pointer text-left"
                                        >
                                            <span className="inline-flex items-center gap-2.5 text-xs sm:text-sm font-semibold">
                                                <LogOut className="w-4 h-4 text-rose-600 shrink-0" />
                                                <span>Lumabas ng Klase</span>
                                            </span>
                                            <span className="text-[11px] text-rose-500 font-medium shrink-0">
                                                Quit
                                            </span>
                                        </button>
                                    </div>
                                ) : (
                                    <div className="rounded-xl border border-rose-200 bg-rose-50/80 p-3.5 space-y-3">
                                        <div className="space-y-1">
                                            <p className="text-xs font-bold text-rose-900">
                                                Sigurado ka bang lalabas ng klase?
                                            </p>
                                            <p className="text-[11px] text-rose-700 leading-relaxed">
                                                {isOfflineMode
                                                    ? 'Babalik ka sa Login screen. Kung hindi pa tapos ang Mapa 5, mabubura ang kasalukuyang offline progress sa device na ito.'
                                                    : 'Babalik ka sa Login screen. Maaari kang pumasok muli gamit ang parehong Class PIN at pangalan.'}
                                            </p>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <button
                                                type="button"
                                                onClick={() => setQuitConfirm(false)}
                                                className="min-h-[40px] px-3 py-2 rounded-lg border border-stone-200 bg-white hover:bg-stone-50 text-stone-700 text-xs font-semibold transition cursor-pointer"
                                            >
                                                Kanselahin
                                            </button>
                                            <button
                                                type="button"
                                                onClick={handleConfirmQuit}
                                                className="min-h-[40px] px-3 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 active:scale-[0.99] text-white text-xs font-semibold transition cursor-pointer"
                                            >
                                                Oo, Lumabas
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}

function ScoreSummaryRow({ score, maxScore = 10, hearts, animate = false }) {
    const shownScore = useCountUp(score, animate, 680);

    return (
        <div className="grid grid-cols-2 divide-x divide-stone-200 rounded-xl bg-[#FAF8F5] border border-stone-200 py-3.5">
            <div>
                <p className="text-xs text-stone-500">Puntos</p>
                <p className="text-2xl font-bold text-[#C2410C] tabular-nums mt-0.5">
                    {shownScore} <span className="text-sm font-medium text-stone-400">/ {maxScore}</span>
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
