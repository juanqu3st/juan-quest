import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Captions, Maximize2, Minimize2, Pause, Play } from 'lucide-react';
import { resolveMediaUrl } from '../../api/axiosClient';
import { resolveCachedAudioUrl, resolveCachedVideoUrl } from '../../utils/videoCache';
import { getAudioVolume } from '../../utils/gameAudio';
import { buildTimedCues, buildWebVttText, splitDialogue } from '../../utils/subtitleCues';

function formatVideoClock(sec) {
    const s = Math.max(0, Math.floor(Number(sec) || 0));
    const m = Math.floor(s / 60);
    const r = String(s % 60).padStart(2, '0');
    return `${m}:${r}`;
}

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
    const playerBoxRef = useRef(null);
    const videoRef = useRef(null);
    const wholeAudioRef = useRef(null);
    const scenePlayersRef = useRef({});
    const activeSceneAudioIdxRef = useRef(-1);
    const customAudioActiveRef = useRef(false);
    const unlockedPlayersRef = useRef(false);
    const controlsHideTimerRef = useRef(null);
    const masterVolRef = useRef(getAudioVolume());

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
    const [isBoxFullscreen, setIsBoxFullscreen] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [controlsVisible, setControlsVisible] = useState(true);
    const [duration, setDuration] = useState(0);
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

    // Track fullscreen transitions (container fullscreen keeps our crisp YouTube-style overlay; native iOS fallback uses WebVTT track)
    useEffect(() => {
        const syncFs = () => {
            const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
            setIsFullscreen(Boolean(fsEl));
            setIsBoxFullscreen(Boolean(fsEl && playerBoxRef.current && fsEl === playerBoxRef.current));
        };
        document.addEventListener('fullscreenchange', syncFs);
        document.addEventListener('webkitfullscreenchange', syncFs);
        return () => {
            document.removeEventListener('fullscreenchange', syncFs);
            document.removeEventListener('webkitfullscreenchange', syncFs);
            clearTimeout(controlsHideTimerRef.current);
        };
    }, []);

    useEffect(() => {
        const video = videoRef.current;
        if (!video || !video.textTracks || video.textTracks.length === 0) return;
        const useNativeTrack = isFullscreen && !isBoxFullscreen && showCaptions;
        for (let i = 0; i < video.textTracks.length; i += 1) {
            video.textTracks[i].mode = useNativeTrack ? 'showing' : 'hidden';
        }
    }, [isFullscreen, isBoxFullscreen, showCaptions, vttTrackUrl, cachedVideoSrc]);

    // Sync live Settings volume slider immediately to video & Teacher VO tracks (with zero visible mute icon!)
    useEffect(() => {
        const applyVol = (v) => {
            const vol = Math.max(0, Math.min(1, Number(v)));
            masterVolRef.current = vol;
            const video = videoRef.current;
            if (video) {
                video.volume = vol;
                video.muted = customAudioActiveRef.current ? true : vol <= 0;
            }
            if (wholeAudioRef.current) {
                wholeAudioRef.current.volume = vol;
                wholeAudioRef.current.muted = vol <= 0;
            }
            Object.values(scenePlayersRef.current).forEach((el) => {
                if (!el) return;
                el.volume = vol;
                el.muted = vol <= 0;
            });
        };
        applyVol(getAudioVolume());
        const onVolEvt = (e) => applyVol(e.detail);
        window.addEventListener('juanquest:volume-change', onVolEvt);
        return () => window.removeEventListener('juanquest:volume-change', onVolEvt);
    }, [cachedVideoSrc]);

    const scheduleControlsAutoHide = (playingNow = true) => {
        clearTimeout(controlsHideTimerRef.current);
        if (!playingNow) return;
        controlsHideTimerRef.current = setTimeout(() => {
            setControlsVisible(false);
        }, 2500);
    };

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

    // Sync Teacher Voice-Over (Whole-Map OR Per-Scene) cleanly with the 3D Animated MP4 (supports offline CacheStorage!)
    useEffect(() => {
        const video = videoRef.current;
        if (!video || !hasMapVideo) return undefined;

        let cancelled = false;
        const createdBlobUrls = [];

        const createVoicePlayer = (rawUrl) => {
            const el = document.createElement('video');
            el.preload = 'auto';
            el.playsInline = true;
            el.setAttribute('playsinline', '');
            if (typeof navigator === 'undefined' || navigator.onLine !== false) {
                el.src = rawUrl;
            }
            resolveCachedAudioUrl(rawUrl)
                .then(({ url, isObjectUrl }) => {
                    if (cancelled) {
                        if (isObjectUrl && url) URL.revokeObjectURL(url);
                        return;
                    }
                    if (isObjectUrl && url) {
                        createdBlobUrls.push(url);
                        if (el.paused) {
                            el.src = url;
                        }
                    } else if (!el.src && url) {
                        el.src = url;
                    }
                })
                .catch(() => {
                    if (!cancelled && !el.src) el.src = rawUrl;
                });
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
            const vol = masterVolRef.current;
            a.volume = vol;
            a.muted = vol <= 0;
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
            const vol = masterVolRef.current;

            if (!activeScene || !player) {
                customAudioActiveRef.current = false;
                pauseAllScenePlayers(-1);
                video.volume = vol;
                video.muted = vol <= 0;
                if (fromPlayGesture) unlockUpcomingScenePlayers(-1);
                return;
            }

            customAudioActiveRef.current = true;
            video.muted = true;
            pauseAllScenePlayers(sceneIdx);
            activeSceneAudioIdxRef.current = sceneIdx;
            player.muted = vol <= 0;
            player.volume = vol;

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

        const onLoadedMetadata = () => {
            if (Number.isFinite(video.duration)) setDuration(video.duration);
            const vol = masterVolRef.current;
            video.volume = vol;
            video.muted = customAudioActiveRef.current ? true : vol <= 0;
        };

        const onPlay = () => {
            setIsPlaying(true);
            scheduleControlsAutoHide(true);
            if (useWholeVoiceover && wholeAudioRef.current) {
                syncWhole(video.currentTime, true);
            } else if (usePerSceneVoiceover) {
                syncPerScene(video.currentTime, true, true);
            } else {
                const vol = masterVolRef.current;
                video.volume = vol;
                video.muted = vol <= 0;
            }
        };

        const onPause = () => {
            setIsPlaying(false);
            clearTimeout(controlsHideTimerRef.current);
            setControlsVisible(true);
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
            if (Number.isFinite(video.duration) && video.duration > 0) {
                setDuration((d) => (d === video.duration ? d : video.duration));
            }
            if (useWholeVoiceover && wholeAudioRef.current && !video.paused) {
                syncWhole(t, true);
            } else if (usePerSceneVoiceover && !video.paused) {
                syncPerScene(t, true, false);
            }
        };

        const onEnded = () => {
            setIsPlaying(false);
            clearTimeout(controlsHideTimerRef.current);
            setControlsVisible(true);
            stopWholeAudio();
            pauseAllScenePlayers(-1);
        };

        if (video.readyState >= 1 && Number.isFinite(video.duration)) {
            setDuration(video.duration);
        }

        video.addEventListener('loadedmetadata', onLoadedMetadata);
        video.addEventListener('play', onPlay);
        video.addEventListener('pause', onPause);
        video.addEventListener('seeked', onSeeked);
        video.addEventListener('timeupdate', onTimeUpdate);
        video.addEventListener('ended', onEnded);

        return () => {
            cancelled = true;
            video.removeEventListener('loadedmetadata', onLoadedMetadata);
            video.removeEventListener('play', onPlay);
            video.removeEventListener('pause', onPause);
            video.removeEventListener('seeked', onSeeked);
            video.removeEventListener('timeupdate', onTimeUpdate);
            video.removeEventListener('ended', onEnded);
            stopWholeAudio();
            if (wholeAudioRef.current) {
                wholeAudioRef.current.removeAttribute('src');
                wholeAudioRef.current.load?.();
                wholeAudioRef.current = null;
            }
            Object.values(scenePlayersRef.current).forEach((el) => {
                if (!el) return;
                el.pause();
                el.removeAttribute('src');
                el.load?.();
            });
            scenePlayersRef.current = {};
            activeSceneAudioIdxRef.current = -1;
            customAudioActiveRef.current = false;
            createdBlobUrls.forEach((u) => {
                try {
                    URL.revokeObjectURL(u);
                } catch {
                    // ignore
                }
            });
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

    // 1. Built-in 3D Animated Story MP4 Player (Clean YouTube-Style Controls, Zero Mute Icon, Dynamic Subtitles!)
    if (hasMapVideo) {
        const activeCue = timedCues.find((c) => currentTime >= c.start && currentTime <= c.end) || null;
        const showControlsNow = controlsVisible || !isPlaying;
        const progressPct = duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;

        const handleTogglePlay = () => {
            const video = videoRef.current;
            if (!video) return;
            if (video.paused || video.ended) {
                setControlsVisible(true);
                video.play().catch(() => {});
            } else {
                video.pause();
            }
        };

        const handleVideoTap = () => {
            const video = videoRef.current;
            if (!video) return;
            if (video.paused || video.ended) {
                setControlsVisible(true);
                video.play().catch(() => {});
                return;
            }
            setControlsVisible((prev) => {
                const next = !prev;
                if (next) scheduleControlsAutoHide(true);
                else clearTimeout(controlsHideTimerRef.current);
                return next;
            });
        };

        const handleSeekInput = (e) => {
            const video = videoRef.current;
            if (!video || duration <= 0) return;
            const nextSec = Number(e.target.value);
            if (!Number.isFinite(nextSec)) return;
            video.currentTime = nextSec;
            setCurrentTime(nextSec);
            if (!video.paused) scheduleControlsAutoHide(true);
        };

        const handleToggleFullscreen = (e) => {
            e.stopPropagation();
            const box = playerBoxRef.current;
            const video = videoRef.current;
            const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
            if (fsEl) {
                (document.exitFullscreen || document.webkitExitFullscreen)?.call(document)?.catch?.(() => {});
                return;
            }
            if (box?.requestFullscreen) {
                box.requestFullscreen().catch(() => {});
            } else if (box?.webkitRequestFullscreen) {
                box.webkitRequestFullscreen();
            } else if (video?.webkitEnterFullscreen) {
                video.webkitEnterFullscreen();
            }
        };

        return (
            <div className="max-w-3xl mx-auto w-full flex-1 flex flex-col justify-between gap-4">
                <div className="my-auto space-y-3.5">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-stone-500">
                        <span className="font-medium text-stone-600">
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

                    {/* Clean YouTube-Style Video Container: Tap video to show/hide controls, subtitles glide smoothly in sync! */}
                    <div
                        ref={playerBoxRef}
                        onClick={handleVideoTap}
                        onMouseMove={() => {
                            if (isPlaying) {
                                setControlsVisible(true);
                                scheduleControlsAutoHide(true);
                            }
                        }}
                        className={`relative w-full aspect-video overflow-hidden bg-stone-950 select-none cursor-pointer ${
                            isBoxFullscreen ? 'rounded-none border-0' : 'rounded-2xl border border-stone-200'
                        }`}
                    >
                        {resolvingOfflineVideo ? (
                            <div className="w-full h-full flex items-center justify-center text-xs font-medium text-stone-300">
                                Inihahanda ang video...
                            </div>
                        ) : (
                            <video
                                key={rawMapVideoUrl || 'map-video'}
                                ref={videoRef}
                                src={cachedVideoSrc || rawMapVideoUrl}
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

                        {/* Center Play / Pause Button (Auto-hides cleanly while watching!) */}
                        {!resolvingOfflineVideo && (
                            <div
                                className={`absolute inset-0 z-10 flex items-center justify-center transition-opacity duration-200 ${
                                    showControlsNow
                                        ? 'opacity-100 bg-black/20'
                                        : 'opacity-0 pointer-events-none'
                                }`}
                            >
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleTogglePlay();
                                    }}
                                    aria-label={isPlaying ? 'I-pause ang video' : 'I-play ang video'}
                                    className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-black/60 hover:bg-black/75 active:scale-95 text-white flex items-center justify-center shadow-lg transition cursor-pointer"
                                >
                                    {isPlaying ? (
                                        <Pause className="w-5 h-5 sm:w-6 sm:h-6 fill-current" />
                                    ) : (
                                        <Play className="w-5 h-5 sm:w-6 sm:h-6 fill-current ml-0.5" />
                                    )}
                                </button>
                            </div>
                        )}

                        {/* Dynamic YouTube-Style Subtitles: glides down when focused on playing, lifts cleanly when controls show! */}
                        {showCaptions && (!isFullscreen || isBoxFullscreen) && (
                            <div
                                className={`pointer-events-none absolute inset-x-3 sm:inset-x-8 z-20 flex justify-center transition-[bottom] duration-300 ease-out ${
                                    showControlsNow ? 'bottom-12 sm:bottom-14' : 'bottom-3 sm:bottom-5'
                                }`}
                            >
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
                                                className={`${
                                                    isBoxFullscreen ? 'text-base sm:text-2xl' : 'text-xs sm:text-[17px]'
                                                } font-bold text-white leading-relaxed tracking-normal`}
                                                style={{
                                                    textShadow:
                                                        '0 1px 3px rgba(0, 0, 0, 0.92), 0 2px 8px rgba(0, 0, 0, 0.78), 0 0 1px rgba(0, 0, 0, 0.92)',
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

                        {/* Minimal YouTube-Style Bottom Bar (Time + Scrubber + Fullscreen ONLY — ZERO Mute Icon!) */}
                        {!resolvingOfflineVideo && (
                            <div
                                onClick={(e) => e.stopPropagation()}
                                className={`absolute inset-x-0 bottom-0 z-20 px-3 sm:px-4 pt-6 pb-2.5 flex items-center gap-2.5 sm:gap-3 text-white transition-opacity duration-200 ${
                                    showControlsNow ? 'opacity-100' : 'opacity-0 pointer-events-none'
                                }`}
                                style={{
                                    background: 'linear-gradient(to top, rgba(0, 0, 0, 0.72) 0%, rgba(0, 0, 0, 0) 100%)',
                                }}
                            >
                                <span className="text-[11px] sm:text-xs font-semibold tabular-nums shrink-0">
                                    {formatVideoClock(currentTime)} / {formatVideoClock(duration)}
                                </span>

                                <div className="relative flex-1 h-5 flex items-center">
                                    <div className="w-full h-1.5 rounded-full bg-white/30 overflow-hidden">
                                        <div
                                            className="h-full bg-[#EA580C] rounded-full"
                                            style={{ width: `${progressPct}%` }}
                                        />
                                    </div>
                                    <input
                                        type="range"
                                        min={0}
                                        max={duration || 0}
                                        step={0.1}
                                        value={Math.min(currentTime, duration || 0)}
                                        onChange={handleSeekInput}
                                        aria-label="Oras ng video"
                                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                    />
                                </div>

                                <button
                                    type="button"
                                    onClick={handleToggleFullscreen}
                                    aria-label={isBoxFullscreen ? 'Lumabas sa fullscreen' : 'Fullscreen'}
                                    className="w-8 h-8 rounded-lg hover:bg-white/15 inline-flex items-center justify-center shrink-0 cursor-pointer transition"
                                >
                                    {isBoxFullscreen ? (
                                        <Minimize2 className="w-4 h-4" />
                                    ) : (
                                        <Maximize2 className="w-4 h-4" />
                                    )}
                                </button>
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
