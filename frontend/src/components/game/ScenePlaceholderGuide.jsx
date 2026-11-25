import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Captions, Play, Volume2 } from 'lucide-react';
import { resolveMediaUrl, resolveStorageUrl } from '../../api/axiosClient';
import { resolveCachedVideoUrl } from '../../utils/videoCache';
import { buildTimedCues, buildWebVttText, splitDialogue } from '../../utils/subtitleCues';

function parseClockSec(str) {
    const m = String(str || '').trim().match(/^(\d+):(\d{1,2})$/);
    if (!m) return null;
    return Number(m[1]) * 60 + Number(m[2]);
}

function normalizeScenesTiming(scenes, mapStartSec = 0) {
    return (scenes || []).map((scene, idx) => {
        let start =
            scene.start_sec !== undefined && scene.start_sec !== null && scene.start_sec !== ''
                ? Number(scene.start_sec)
                : null;
        let end =
            scene.end_sec !== undefined && scene.end_sec !== null && scene.end_sec !== ''
                ? Number(scene.end_sec)
                : null;
        if (start !== null && Number.isNaN(start)) start = null;
        if (end !== null && Number.isNaN(end)) end = null;

        if ((start === null || end === null) && scene.timestamp) {
            const parts = String(scene.timestamp).split(/[–\-]/);
            const s = parseClockSec(parts[0]);
            const e = parseClockSec(parts[1]);
            if (s !== null && e !== null) {
                start = Math.max(0, s - mapStartSec);
                end = Math.max(start + 1, e - mapStartSec);
            }
        }

        if (start === null) start = idx * 15;
        if (end === null) end = start + 15;

        return {
            ...scene,
            _start: start,
            _end: end,
            _offset: Number(scene.audio_offset_sec || 0),
            _lines: splitDialogue(scene.dialogue),
        };
    });
}

/**
 * Clean flat story view before Panuto & questions.
 * Priority:
 * 1. Per-map built-in 3D Animated MP4 (`map.story_video_path`) — cached locally via Cache API + synced Teacher Voice-Over (default / whole / per_scene) + Filipino subtitles.
 * 2. Lesson YouTube clip (`video_source_type === 'youtube'`).
 * 3. Lesson global uploaded MP4 (`video_source_type === 'upload'`).
 * 4. Interactive flat Scene Script cards fallback.
 */
export default function ScenePlaceholderGuide({
    map,
    lesson,
    initialSceneIdx = 0,
    onSceneIdxChange,
    onContinue,
}) {
    const videoRef = useRef(null);
    const wholeAudioRef = useRef(null);
    const scenePlayersRef = useRef({});
    const activeSceneAudioIdxRef = useRef(-1);
    const customAudioActiveRef = useRef(false);
    const unlockedPlayersRef = useRef(false);

    const sourceType = lesson?.video_source_type || 'placeholder';
    const rawMapVideoUrl = resolveMediaUrl(map?.story_video_path);
    const uploadedLessonVideoUrl = resolveMediaUrl(lesson?.uploaded_video_path);
    const wholeVoiceoverUrl = resolveMediaUrl(map?.whole_voiceover_path);
    const wholeVoiceoverOffset = Number(map?.whole_voiceover_offset_sec || 0);
    const voiceoverMode = map?.voiceover_mode || 'default';

    const timedScenes = useMemo(
        () => normalizeScenesTiming(map?.scene_script || [], map?.youtube_start_sec || 0),
        [map?.scene_script, map?.youtube_start_sec]
    );

    const isOfflineNow = typeof navigator !== 'undefined' && navigator.onLine === false;
    const [cachedVideoSrc, setCachedVideoSrc] = useState(() => (isOfflineNow ? null : rawMapVideoUrl));
    const [resolvingOfflineVideo, setResolvingOfflineVideo] = useState(() => Boolean(isOfflineNow && rawMapVideoUrl));
    const [videoUnavailableOffline, setVideoUnavailableOffline] = useState(false);
    const [showCaptions, setShowCaptions] = useState(true);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);

    // Line-by-line timed cues (for crisp bottom-center overlay + native WebVTT fullscreen track)
    const timedCues = useMemo(() => buildTimedCues(timedScenes), [timedScenes]);
    const [vttTrackUrl, setVttTrackUrl] = useState(null);

    // Create & revoke WebVTT blob URL inside the same useEffect so React StrictMode double-mount never uses a revoked URL
    useEffect(() => {
        if (!timedCues.length || typeof URL === 'undefined') {
            setVttTrackUrl(null);
            return undefined;
        }
        const blob = new Blob([buildWebVttText(timedCues)], { type: 'text/vtt;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        setVttTrackUrl(url);
        return () => {
            URL.revokeObjectURL(url);
        };
    }, [timedCues]);

    // Track fullscreen transitions so native <track> shows ONLY in fullscreen (preventing duplicate captions)
    useEffect(() => {
        const syncFs = () => {
            const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
            setIsFullscreen(Boolean(fsEl));
        };
        document.addEventListener('fullscreenchange', syncFs);
        document.addEventListener('webkitfullscreenchange', syncFs);
        return () => {
            document.removeEventListener('fullscreenchange', syncFs);
            document.removeEventListener('webkitfullscreenchange', syncFs);
        };
    }, []);

    useEffect(() => {
        const video = videoRef.current;
        if (!video || !video.textTracks || video.textTracks.length === 0) return;
        for (let i = 0; i < video.textTracks.length; i += 1) {
            video.textTracks[i].mode = isFullscreen && showCaptions ? 'showing' : 'hidden';
        }
    }, [isFullscreen, showCaptions, vttTrackUrl, cachedVideoSrc]);

    const safeInitial = Math.min(Math.max(0, initialSceneIdx || 0), Math.max(0, timedScenes.length - 1));
    const [idx, setIdx] = useState(safeInitial);

    useEffect(() => {
        onSceneIdxChange?.(idx);
    }, [idx, onSceneIdxChange]);

    // Resolve cached Blob URL for per-map MP4 video (0 bandwidth on reload/revisit)
    useEffect(() => {
        let cancelled = false;
        let objUrlToRevoke = null;

        if (!rawMapVideoUrl) {
            setCachedVideoSrc(null);
            setResolvingOfflineVideo(false);
            return undefined;
        }

        const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
        setCachedVideoSrc(offline ? null : rawMapVideoUrl);
        setResolvingOfflineVideo(offline);
        setVideoUnavailableOffline(false);
        resolveCachedVideoUrl(rawMapVideoUrl).then(({ url, isObjectUrl, fromCache }) => {
            if (cancelled) {
                if (isObjectUrl) URL.revokeObjectURL(url);
                return;
            }
            // Avoid interrupting active playback if student already pressed Play before Cache API resolved
            if (videoRef.current && !videoRef.current.paused && !offline) {
                if (isObjectUrl) URL.revokeObjectURL(url);
                setResolvingOfflineVideo(false);
                return;
            }
            if (isObjectUrl) objUrlToRevoke = url;
            setCachedVideoSrc(url);
            setResolvingOfflineVideo(false);
            if (!fromCache && typeof navigator !== 'undefined' && navigator.onLine === false) {
                setVideoUnavailableOffline(true);
            }
        });

        return () => {
            cancelled = true;
            if (objUrlToRevoke) URL.revokeObjectURL(objUrlToRevoke);
        };
    }, [rawMapVideoUrl]);

    const hasMapVideo = Boolean(rawMapVideoUrl) && !videoUnavailableOffline;
    const isOnlineNow = typeof navigator === 'undefined' || navigator.onLine !== false;
    const hasYoutube = !hasMapVideo && isOnlineNow && sourceType === 'youtube' && lesson?.youtube_video_id;
    const hasLessonUpload = !hasMapVideo && isOnlineNow && sourceType === 'upload' && uploadedLessonVideoUrl;

    const useWholeVoiceover = hasMapVideo && voiceoverMode === 'whole' && Boolean(wholeVoiceoverUrl);
    const hasAnySceneVoiceover = useMemo(
        () => timedScenes.some((s) => Boolean(s.audio_path)),
        [timedScenes]
    );
    const usePerSceneVoiceover = hasMapVideo && voiceoverMode === 'per_scene' && hasAnySceneVoiceover;

    // Sync Teacher Voice-Over (Whole-Map OR Per-Scene) cleanly with the 3D Animated MP4
    useEffect(() => {
        const video = videoRef.current;
        if (!video || !hasMapVideo) return undefined;

        const createVoicePlayer = (url) => {
            const el = document.createElement('video');
            el.src = url;
            el.preload = 'auto';
            el.playsInline = true;
            el.setAttribute('playsinline', '');
            return el;
        };

        const pauseAllScenePlayers = (exceptIdx = -1) => {
            Object.entries(scenePlayersRef.current).forEach(([k, el]) => {
                if (Number(k) !== exceptIdx && el && !el.paused) {
                    el.pause();
                }
            });
            if (exceptIdx === -1) {
                activeSceneAudioIdxRef.current = -1;
            }
        };

        const stopWholeAudio = () => {
            if (wholeAudioRef.current) {
                wholeAudioRef.current.pause();
            }
        };

        // Preload per-scene audio players so student Play tap unlocks every scene cleanly on iOS/Android/Desktop
        const preloadedScenes = {};
        if (usePerSceneVoiceover) {
            timedScenes.forEach((sc, i) => {
                if (sc.audio_path) {
                    preloadedScenes[i] = createVoicePlayer(resolveMediaUrl(sc.audio_path));
                }
            });
        }
        scenePlayersRef.current = preloadedScenes;
        activeSceneAudioIdxRef.current = -1;
        unlockedPlayersRef.current = false;

        if (useWholeVoiceover && wholeVoiceoverUrl) {
            wholeAudioRef.current = createVoicePlayer(wholeVoiceoverUrl);
            customAudioActiveRef.current = true;
            video.muted = true;
        } else {
            wholeAudioRef.current = null;
            const startsWithCustomScene =
                usePerSceneVoiceover &&
                Boolean(
                    timedScenes.find((s) => (video.currentTime || 0) >= s._start && (video.currentTime || 0) < s._end)
                        ?.audio_path
                );
            customAudioActiveRef.current = startsWithCustomScene;
            video.muted = startsWithCustomScene;
        }

        const unlockUpcomingScenePlayers = (activeIdx) => {
            if (unlockedPlayersRef.current) return;
            unlockedPlayersRef.current = true;
            Object.entries(scenePlayersRef.current).forEach(([k, el]) => {
                if (Number(k) === activeIdx || !el) return;
                const prevMuted = el.muted;
                el.muted = true;
                const p = el.play();
                if (p && typeof p.then === 'function') {
                    p.then(() => {
                        el.pause();
                        try {
                            el.currentTime = 0;
                        } catch {
                            // ignore
                        }
                        el.muted = prevMuted;
                    }).catch(() => {
                        el.muted = prevMuted;
                    });
                } else {
                    el.muted = prevMuted;
                }
            });
        };

        const syncWhole = (t, shouldPlay) => {
            const a = wholeAudioRef.current;
            if (!a) return;
            customAudioActiveRef.current = true;
            video.muted = true;
            a.volume = video.volume;
            const desired = t - wholeVoiceoverOffset;
            if (desired < 0) {
                if (!a.paused) a.pause();
                return;
            }
            if (a.duration && desired >= a.duration) {
                if (!a.paused) a.pause();
                return;
            }
            if (Math.abs((a.currentTime || 0) - desired) > 0.35) {
                try {
                    a.currentTime = desired;
                } catch {
                    // ignore
                }
            }
            if (shouldPlay && !video.paused && a.paused) {
                a.play().catch(() => {});
            }
        };

        const syncPerScene = (t, shouldPlay, fromPlayGesture = false) => {
            const sceneIdx = timedScenes.findIndex((s) => t >= s._start && t < s._end);
            const activeScene = sceneIdx >= 0 ? timedScenes[sceneIdx] : null;
            const player = sceneIdx >= 0 ? scenePlayersRef.current[sceneIdx] || null : null;

            if (!activeScene || !player) {
                customAudioActiveRef.current = false;
                pauseAllScenePlayers(-1);
                video.muted = false;
                if (fromPlayGesture) unlockUpcomingScenePlayers(-1);
                return;
            }

            customAudioActiveRef.current = true;
            video.muted = true;
            pauseAllScenePlayers(sceneIdx);
            activeSceneAudioIdxRef.current = sceneIdx;
            player.muted = false;
            player.volume = video.volume;

            if (fromPlayGesture) unlockUpcomingScenePlayers(sceneIdx);

            const desired = t - activeScene._start - (activeScene._offset || 0);
            if (desired < 0 || (player.duration && desired >= player.duration)) {
                if (!player.paused) player.pause();
                return;
            }

            const applySeekAndPlay = () => {
                if (activeSceneAudioIdxRef.current !== sceneIdx) return;
                const liveT = video.currentTime;
                const liveDesired = liveT - activeScene._start - (activeScene._offset || 0);
                if (liveDesired < 0 || (player.duration && liveDesired >= player.duration)) return;
                if (Math.abs((player.currentTime || 0) - liveDesired) > 0.35) {
                    try {
                        player.currentTime = liveDesired;
                    } catch {
                        // ignore
                    }
                }
                if (shouldPlay && !video.paused && player.paused) {
                    player.play().catch(() => {});
                }
            };

            if (player.readyState >= 1) {
                applySeekAndPlay();
            } else {
                if (shouldPlay && !video.paused && player.paused) {
                    // Trigger play synchronously inside user gesture on mobile Safari/Chrome
                    player.play().catch(() => {});
                }
                player.addEventListener('loadedmetadata', applySeekAndPlay, { once: true });
            }
        };

        const onPlay = () => {
            if (useWholeVoiceover && wholeAudioRef.current) {
                syncWhole(video.currentTime, true);
            } else if (usePerSceneVoiceover) {
                syncPerScene(video.currentTime, true, true);
            }
        };

        const onPause = () => {
            stopWholeAudio();
            pauseAllScenePlayers(-1);
        };

        const onSeeked = () => {
            setCurrentTime(video.currentTime);
            if (useWholeVoiceover && wholeAudioRef.current) {
                syncWhole(video.currentTime, !video.paused);
            } else if (usePerSceneVoiceover) {
                syncPerScene(video.currentTime, !video.paused, false);
            }
        };

        const onTimeUpdate = () => {
            const t = video.currentTime;
            setCurrentTime(t);
            if (useWholeVoiceover && wholeAudioRef.current && !video.paused) {
                syncWhole(t, true);
            } else if (usePerSceneVoiceover && !video.paused) {
                syncPerScene(t, true, false);
            }
        };

        const onVolumeChange = () => {
            const vol = video.volume;
            if (wholeAudioRef.current) wholeAudioRef.current.volume = vol;
            Object.values(scenePlayersRef.current).forEach((el) => {
                if (el) el.volume = vol;
            });
            // Prevent old AI voice from bleeding through if student clicks native unmute while Teacher VO is active
            if (customAudioActiveRef.current && !video.muted) {
                video.muted = true;
            }
        };

        const onEnded = () => {
            stopWholeAudio();
            pauseAllScenePlayers(-1);
        };

        video.addEventListener('play', onPlay);
        video.addEventListener('pause', onPause);
        video.addEventListener('seeked', onSeeked);
        video.addEventListener('timeupdate', onTimeUpdate);
        video.addEventListener('volumechange', onVolumeChange);
        video.addEventListener('ended', onEnded);

        return () => {
            video.removeEventListener('play', onPlay);
            video.removeEventListener('pause', onPause);
            video.removeEventListener('seeked', onSeeked);
            video.removeEventListener('timeupdate', onTimeUpdate);
            video.removeEventListener('volumechange', onVolumeChange);
            video.removeEventListener('ended', onEnded);
            stopWholeAudio();
            pauseAllScenePlayers(-1);
            scenePlayersRef.current = {};
            customAudioActiveRef.current = false;
        };
    }, [
        hasMapVideo,
        resolvingOfflineVideo,
        cachedVideoSrc,
        useWholeVoiceover,
        usePerSceneVoiceover,
        wholeVoiceoverUrl,
        wholeVoiceoverOffset,
        timedScenes,
    ]);

    // Legacy global lesson MP4 start/end clamp
    useEffect(() => {
        const video = videoRef.current;
        if (!video || !hasLessonUpload) return undefined;
        const onLoaded = () => {
            video.currentTime = map.youtube_start_sec || 0;
        };
        const onTimeUpdate = () => {
            if (map.youtube_end_sec && video.currentTime >= map.youtube_end_sec) video.pause();
        };
        video.addEventListener('loadedmetadata', onLoaded);
        video.addEventListener('timeupdate', onTimeUpdate);
        return () => {
            video.removeEventListener('loadedmetadata', onLoaded);
            video.removeEventListener('timeupdate', onTimeUpdate);
        };
    }, [map.youtube_start_sec, map.youtube_end_sec, hasLessonUpload]);

    const continueButton = (
        <button
            type="button"
            onClick={onContinue}
            className="w-full sm:w-auto min-h-[48px] px-6 py-2.5 rounded-xl bg-[#C2410C] hover:bg-[#9A3412] text-white font-semibold text-sm inline-flex items-center justify-center gap-2 transition cursor-pointer shrink-0"
        >
            <Play className="w-4 h-4 fill-current" />
            <span>Tumuloy sa Panuto</span>
        </button>
    );

    // 1. Built-in 3D Animated Story MP4 Player (with modern YouTube-style in-video subtitles!)
    if (hasMapVideo) {
        const activeCue = timedCues.find((c) => currentTime >= c.start && currentTime <= c.end) || null;

        return (
            <div className="max-w-3xl mx-auto w-full flex-1 flex flex-col justify-between gap-4">
                <div className="my-auto space-y-3.5">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-stone-500">
                        <span className="inline-flex items-center gap-1.5 font-medium">
                            <Volume2 className="w-3.5 h-3.5 text-[#C2410C]" />
                            {useWholeVoiceover
                                ? 'Boses ng Guro (Buong Mapa)'
                                : usePerSceneVoiceover
                                  ? 'Boses ng Guro (Bawat Eksena)'
                                  : '3D Story-Animation Video'}
                        </span>
                        <button
                            type="button"
                            onClick={() => setShowCaptions((v) => !v)}
                            className={`inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1 rounded-xl border text-xs font-semibold transition cursor-pointer ${
                                showCaptions
                                    ? 'bg-stone-900 text-white border-stone-900'
                                    : 'bg-white text-stone-600 border-stone-200 hover:border-stone-300'
                            }`}
                        >
                            <Captions className="w-3.5 h-3.5" />
                            <span>Subtitles {showCaptions ? 'On' : 'Off'}</span>
                        </button>
                    </div>

                    {/* Video container with modern YouTube-style bottom-center translucent caption overlay */}
                    <div className="relative w-full aspect-video rounded-2xl overflow-hidden bg-stone-950 border border-stone-200">
                        {resolvingOfflineVideo ? (
                            <div className="w-full h-full flex items-center justify-center text-xs font-medium text-stone-300">
                                Inihahanda ang video...
                            </div>
                        ) : (
                        <video
                            key={rawMapVideoUrl || 'map-video'}
                            ref={videoRef}
                            src={cachedVideoSrc || rawMapVideoUrl}
                            controls
                            playsInline
                            preload="auto"
                            className="w-full h-full object-contain"
                        >
                            {vttTrackUrl && (
                                <track
                                    kind="subtitles"
                                    label="Filipino"
                                    srcLang="fil"
                                    src={vttTrackUrl}
                                    default={false}
                                />
                            )}
                        </video>
                        )}

                        {/* Modern bottom-center in-video subtitle (Pure white text, zero black box) */}
                        {showCaptions && !isFullscreen && (
                            <div className="pointer-events-none absolute inset-x-2.5 sm:inset-x-6 bottom-7 sm:bottom-10 z-10 flex justify-center">
                                <AnimatePresence mode="wait">
                                    {activeCue && (
                                        <motion.div
                                            key={activeCue.id}
                                            initial={{ opacity: 0, y: 4 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: -2 }}
                                            transition={{ duration: 0.14 }}
                                            className="max-w-[94%] sm:max-w-[84%] bg-transparent p-0 text-center select-none"
                                        >
                                            <p
                                                className="text-xs sm:text-[17px] font-bold text-white leading-relaxed tracking-normal"
                                                style={{
                                                    textShadow:
                                                        '0 1px 3px rgba(0, 0, 0, 0.9), 0 2px 8px rgba(0, 0, 0, 0.75), 0 0 1px rgba(0, 0, 0, 0.9)',
                                                }}
                                            >
                                                {activeCue.who && (
                                                    <span className="font-extrabold text-[#FDE047] mr-1.5">
                                                        {activeCue.who}:
                                                    </span>
                                                )}
                                                <span>{activeCue.who ? `“${activeCue.text}”` : activeCue.text}</span>
                                            </p>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        )}
                    </div>
                </div>

                {/* Anchored Thumb-Zone Continue Bar */}
                <div className="pt-2 border-t border-stone-200/80 flex justify-end">
                    {continueButton}
                </div>
            </div>
        );
    }

    // 2. YouTube or Global Lesson MP4 Fallback
    if (hasYoutube || hasLessonUpload) {
        return (
            <div className="max-w-3xl mx-auto w-full my-auto space-y-5">
                <div className="w-full aspect-video rounded-2xl overflow-hidden bg-stone-950 border border-stone-200">
                    {hasYoutube ? (
                        <iframe
                            className="w-full h-full"
                            src={`https://www.youtube.com/embed/${lesson.youtube_video_id}?start=${map.youtube_start_sec}&end=${map.youtube_end_sec}&rel=0`}
                            title={map.title}
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                        />
                    ) : (
                        <video ref={videoRef} src={uploadedLessonVideoUrl} controls playsInline className="w-full h-full" />
                    )}
                </div>
                <div className="flex justify-end">{continueButton}</div>
            </div>
        );
    }

    if (timedScenes.length === 0) {
        return <div className="my-auto flex justify-center">{continueButton}</div>;
    }

    // 3. Interactive Flat Scene Script Reader (for maps awaiting 3D video render)
    const scene = timedScenes[idx];
    const lines = scene._lines;
    const isLast = idx === timedScenes.length - 1;

    return (
        <div className="max-w-2xl mx-auto w-full my-auto space-y-6">
            <div className="flex items-center justify-between gap-4">
                <span className="text-xs font-semibold text-stone-500 tabular-nums">
                    Eksena {idx + 1} ng {timedScenes.length}
                </span>
                <div className="flex items-center gap-1.5">
                    {timedScenes.map((_, i) => (
                        <button
                            key={i}
                            type="button"
                            onClick={() => setIdx(i)}
                            aria-label={`Eksena ${i + 1}`}
                            className={`h-1.5 rounded-full transition-all cursor-pointer ${
                                i === idx
                                    ? 'w-7 bg-[#C2410C]'
                                    : i < idx
                                      ? 'w-3 bg-stone-400'
                                      : 'w-2 bg-stone-200 hover:bg-stone-300'
                            }`}
                        />
                    ))}
                </div>
            </div>

            <AnimatePresence mode="wait">
                <motion.div
                    key={idx}
                    initial={{ opacity: 0, x: 12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -12 }}
                    transition={{ duration: 0.16 }}
                    className="space-y-4"
                >
                    <h3 className="text-xl sm:text-2xl font-bold text-stone-900 tracking-tight">
                        {String(scene.scene_title || '').replace(/^Scene\s*\d+:\s*/i, '')}
                    </h3>

                    <div className="space-y-3">
                        {lines.map((line, i) => {
                            const isNarrator = /narrator/i.test(line.who) || !line.who;
                            return (
                                <div
                                    key={i}
                                    className={`rounded-xl p-4 sm:p-5 border ${
                                        isNarrator
                                            ? 'bg-white border-stone-200'
                                            : 'bg-stone-100/75 border-stone-200'
                                    }`}
                                >
                                    <p
                                        className={`text-xs font-semibold mb-1.5 ${
                                            isNarrator ? 'text-stone-400' : 'text-[#C2410C]'
                                        }`}
                                    >
                                        {isNarrator ? 'Tagapagsalaysay' : line.who}
                                    </p>
                                    <p className="text-[15px] sm:text-base text-stone-800 leading-relaxed">
                                        {isNarrator ? line.text : `“${line.text}”`}
                                    </p>
                                </div>
                            );
                        })}
                    </div>
                </motion.div>
            </AnimatePresence>

            <div className="flex items-center justify-between gap-3 pt-2 border-t border-stone-200">
                <button
                    type="button"
                    disabled={idx === 0}
                    onClick={() => setIdx((i) => Math.max(0, i - 1))}
                    className="min-h-[44px] px-4 py-2 rounded-xl bg-white border border-stone-200 hover:border-stone-300 hover:bg-stone-50 text-stone-700 font-semibold text-sm inline-flex items-center gap-1.5 transition cursor-pointer disabled:opacity-0 disabled:pointer-events-none"
                >
                    <ArrowLeft className="w-4 h-4" />
                    <span>Nakaraan</span>
                </button>

                {isLast ? (
                    continueButton
                ) : (
                    <button
                        type="button"
                        onClick={() => setIdx((i) => Math.min(timedScenes.length - 1, i + 1))}
                        className="min-h-[44px] px-6 py-2.5 rounded-xl bg-[#1C1917] hover:bg-stone-800 text-white font-semibold text-sm inline-flex items-center gap-2 transition cursor-pointer"
                    >
                        <span>Susunod</span>
                        <ArrowRight className="w-4 h-4" />
                    </button>
                )}
            </div>
        </div>
    );
}
