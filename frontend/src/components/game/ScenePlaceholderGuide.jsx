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
        let start = typeof scene.start_sec === 'number' ? scene.start_sec : null;
        let end = typeof scene.end_sec === 'number' ? scene.end_sec : null;

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
    const sceneAudioRef = useRef(null);
    const activeSceneAudioIdxRef = useRef(-1);

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
    const vttTrackUrl = useMemo(() => {
        if (!timedCues.length || typeof URL === 'undefined') return null;
        const blob = new Blob([buildWebVttText(timedCues)], { type: 'text/vtt;charset=utf-8' });
        return URL.createObjectURL(blob);
    }, [timedCues]);

    useEffect(() => {
        return () => {
            if (vttTrackUrl) URL.revokeObjectURL(vttTrackUrl);
        };
    }, [vttTrackUrl]);

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

        const stopSceneAudio = () => {
            if (sceneAudioRef.current) {
                sceneAudioRef.current.pause();
                sceneAudioRef.current = null;
            }
            activeSceneAudioIdxRef.current = -1;
        };

        const stopWholeAudio = () => {
            if (wholeAudioRef.current) {
                wholeAudioRef.current.pause();
            }
        };

        const createVoicePlayer = (url) => {
            const el = document.createElement('video');
            el.src = url;
            el.preload = 'auto';
            el.playsInline = true;
            el.setAttribute('playsinline', '');
            return el;
        };

        if (useWholeVoiceover && wholeVoiceoverUrl) {
            const audio = createVoicePlayer(wholeVoiceoverUrl);
            wholeAudioRef.current = audio;
            video.muted = true;
        } else {
            wholeAudioRef.current = null;
            if (!usePerSceneVoiceover) {
                video.muted = false;
            }
        }

        const syncWhole = (t, shouldPlay) => {
            const a = wholeAudioRef.current;
            if (!a) return;
            video.muted = true;
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

        const syncPerScene = (t, shouldPlay) => {
            const sceneIdx = timedScenes.findIndex((s) => t >= s._start && t < s._end);
            const activeScene = sceneIdx >= 0 ? timedScenes[sceneIdx] : null;
            const customUrl = activeScene?.audio_path ? resolveMediaUrl(activeScene.audio_path) : null;

            if (!customUrl) {
                stopSceneAudio();
                video.muted = false;
                return;
            }

            video.muted = true;
            const desired = t - activeScene._start - (activeScene._offset || 0);

            if (activeSceneAudioIdxRef.current !== sceneIdx || !sceneAudioRef.current) {
                stopSceneAudio();
                const a = createVoicePlayer(customUrl);
                sceneAudioRef.current = a;
                activeSceneAudioIdxRef.current = sceneIdx;
                const seekAndPlay = () => {
                    if (desired < 0) return;
                    if (desired > 0.15 && (!a.duration || desired < a.duration)) {
                        try {
                            a.currentTime = desired;
                        } catch {
                            // ignore seek error before metadata
                        }
                    }
                    if (shouldPlay && !video.paused && (!a.duration || desired < a.duration)) {
                        a.play().catch(() => {});
                    }
                };
                if (a.readyState >= 1) seekAndPlay();
                else a.addEventListener('loadedmetadata', seekAndPlay, { once: true });
            } else {
                const a = sceneAudioRef.current;
                if (desired < 0 || (a.duration && desired >= a.duration)) {
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
            }
        };

        const onPlay = () => {
            if (useWholeVoiceover && wholeAudioRef.current) {
                syncWhole(video.currentTime, true);
            } else if (usePerSceneVoiceover) {
                syncPerScene(video.currentTime, true);
            }
        };

        const onPause = () => {
            stopWholeAudio();
            if (sceneAudioRef.current) sceneAudioRef.current.pause();
        };

        const onSeeked = () => {
            setCurrentTime(video.currentTime);
            if (useWholeVoiceover && wholeAudioRef.current) {
                syncWhole(video.currentTime, !video.paused);
            } else if (usePerSceneVoiceover) {
                syncPerScene(video.currentTime, !video.paused);
            }
        };

        const onTimeUpdate = () => {
            const t = video.currentTime;
            setCurrentTime(t);
            if (useWholeVoiceover && wholeAudioRef.current && !video.paused) {
                syncWhole(t, true);
            } else if (usePerSceneVoiceover && !video.paused) {
                syncPerScene(t, true);
            }
        };

        const onEnded = () => {
            stopWholeAudio();
            stopSceneAudio();
        };

        video.addEventListener('play', onPlay);
        video.addEventListener('pause', onPause);
        video.addEventListener('seeked', onSeeked);
        video.addEventListener('timeupdate', onTimeUpdate);
        video.addEventListener('ended', onEnded);

        return () => {
            video.removeEventListener('play', onPlay);
            video.removeEventListener('pause', onPause);
            video.removeEventListener('seeked', onSeeked);
            video.removeEventListener('timeupdate', onTimeUpdate);
            video.removeEventListener('ended', onEnded);
            stopWholeAudio();
            stopSceneAudio();
        };
    }, [hasMapVideo, resolvingOfflineVideo, useWholeVoiceover, usePerSceneVoiceover, wholeVoiceoverUrl, wholeVoiceoverOffset, timedScenes]);

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
        const activeSceneIdx = Math.max(
            0,
            timedScenes.findIndex((s) => currentTime >= s._start && currentTime < s._end)
        );
        const activeCue = timedCues.find((c) => currentTime >= c.start && currentTime <= c.end) || null;

        const jumpToScene = (scene) => {
            const video = videoRef.current;
            if (!video) return;
            try {
                video.currentTime = scene._start;
                setCurrentTime(scene._start);
                video.play().catch(() => {});
            } catch {
                // ignore seek error before metadata
            }
        };

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
                            key={cachedVideoSrc || rawMapVideoUrl}
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

                    {/* Horizontally scrollable Scene Chapter Pills on mobile, wrapped on sm+ */}
                    {timedScenes.length > 1 && (
                        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-0.5 sm:flex-wrap">
                            {timedScenes.map((sc, i) => {
                                const isCurrent = i === activeSceneIdx;
                                const cleanTitle = String(sc.scene_title || `Eksena ${i + 1}`).replace(
                                    /^Scene\s*\d+:\s*/i,
                                    ''
                                );
                                return (
                                    <button
                                        key={i}
                                        type="button"
                                        onClick={() => jumpToScene(sc)}
                                        className={`shrink-0 min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                                            isCurrent
                                                ? 'bg-[#C2410C] text-white border-[#C2410C]'
                                                : 'bg-white text-stone-600 border-stone-200 hover:border-stone-300'
                                        }`}
                                    >
                                        Eksena {i + 1}: {cleanTitle}
                                    </button>
                                );
                            })}
                        </div>
                    )}
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
