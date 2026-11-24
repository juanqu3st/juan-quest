import { useEffect, useMemo, useRef, useState } from 'react';
import {
    Check,
    ChevronDown,
    ChevronUp,
    Clock,
    Mic,
    Play,
    Plus,
    RotateCcw,
    Save,
    Sliders,
    Square,
    Trash2,
    Upload,
    Video,
    Volume2,
} from 'lucide-react';
import { resolveMediaUrl } from '../../api/axiosClient';
import { buildTimedCues } from '../../utils/subtitleCues';

function createVoiceMediaElement(url) {
    const el = document.createElement('video');
    el.src = url;
    el.preload = 'auto';
    el.playsInline = true;
    el.setAttribute('playsinline', '');
    return el;
}

function isVideoLikeFile(file) {
    if (!file) return false;
    if (String(file.type || '').startsWith('video/')) return true;
    return /\.(mp4|mov|m4v|webm|mkv|avi|3gp)$/i.test(String(file.name || ''));
}

function parseClockSec(str) {
    const m = String(str || '').trim().match(/^(\d+):(\d{1,2})$/);
    if (!m) return null;
    return Number(m[1]) * 60 + Number(m[2]);
}

function formatClock(sec) {
    const safe = Math.max(0, Math.floor(Number(sec) || 0));
    const m = Math.floor(safe / 60);
    const s = safe % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
}

function getSceneBounds(scene, idx, mapStartSec = 0) {
    let start =
        scene?.start_sec !== undefined && scene?.start_sec !== null && scene?.start_sec !== ''
            ? Number(scene.start_sec)
            : null;
    let end =
        scene?.end_sec !== undefined && scene?.end_sec !== null && scene?.end_sec !== ''
            ? Number(scene.end_sec)
            : null;

    if ((start === null || end === null) && scene?.timestamp) {
        const parts = String(scene.timestamp).split(/[–\-]/);
        const s = parseClockSec(parts[0]);
        const e = parseClockSec(parts[1]);
        if (s !== null && e !== null) {
            start = Math.max(0, s - mapStartSec);
            end = Math.max(start + 1, e - mapStartSec);
        }
    }

    if (start === null || Number.isNaN(start)) start = idx * 15;
    if (end === null || Number.isNaN(end)) end = start + 15;
    return { start, end: Math.max(start + 1, end) };
}

/**
 * Flat HIG Light Teacher Dubbing Studio:
 * - Side-by-side 3D Story-Animation Video + Editable Script Teleprompter
 * - Live Video-Synced Recording (3-2-1 countdown -> muted 3D video plays exact scene/whole range while mic records)
 * - Live Synced Preview (layers teacher recording/upload on top of 3D video before saving!)
 * - Fine Timing Adjuster (Start sec, End sec, Audio Offset ±0.1s)
 */
export default function SyncedDubbingStudio({
    mapNumber,
    mapStartSec = 0,
    existingVideoPath,
    storyVideoFile,
    removeStoryVideo,
    onStoryVideoSelect,
    onStoryVideoRemove,
    voiceoverMode,
    onModeChange,
    existingWholePath,
    wholeVoiceoverFile,
    removeWholeVoiceover,
    wholeOffsetSec,
    onWholeFileSelect,
    onWholeRemove,
    onWholeOffsetChange,
    scenes,
    sceneAudioFiles,
    removedSceneIndices,
    dirtySceneIndices = [],
    savingSceneIdx = null,
    onSaveScene,
    onSceneUpdate,
    onSceneAudioSelect,
    onSceneAudioRemove,
    onAddScene,
    onRemoveScene,
}) {
    const videoRef = useRef(null);
    const previewAudioRef = useRef(null);
    const mediaRecorderRef = useRef(null);
    const streamRef = useRef(null);
    const chunksRef = useRef([]);
    const countdownTimerRef = useRef(null);
    const recordRangeRef = useRef({ start: 0, end: 50, target: 'whole', sceneIdx: 0 });
    const previewRangeRef = useRef({
        active: false,
        seeking: false,
        start: 0,
        end: 50,
        offset: 0,
        mode: 'whole', // 'whole' | 'per_scene' | 'all_scenes'
        activeSceneIdx: -1,
    });
    const previewTokenRef = useRef(0);
    const onWholeFileSelectRef = useRef(onWholeFileSelect);
    const onSceneAudioSelectRef = useRef(onSceneAudioSelect);
    onWholeFileSelectRef.current = onWholeFileSelect;
    onSceneAudioSelectRef.current = onSceneAudioSelect;
    const timedScenesRef = useRef([]);
    const sceneAudioMapRef = useRef({});

    const [selectedSceneIdx, setSelectedSceneIdx] = useState(0);
    const [videoDuration, setVideoDuration] = useState(50);
    const [videoTime, setVideoTime] = useState(0);
    const [countdown, setCountdown] = useState(0);
    const [recording, setRecording] = useState(false);
    const [recordSeconds, setRecordSeconds] = useState(0);
    const [previewing, setPreviewing] = useState(false);
    const [previewMode, setPreviewMode] = useState('single'); // 'single' | 'all'
    const [micError, setMicError] = useState('');
    const [showAdvancedTiming, setShowAdvancedTiming] = useState(false);

    // Keep selectedSceneIdx in bounds when scenes change
    useEffect(() => {
        if (selectedSceneIdx >= scenes.length && scenes.length > 0) {
            setSelectedSceneIdx(scenes.length - 1);
        }
    }, [scenes.length, selectedSceneIdx]);

    // Resolve video URL (local picked file takes precedence over saved path)
    const videoSrc = useMemo(() => {
        if (storyVideoFile) return URL.createObjectURL(storyVideoFile);
        if (!removeStoryVideo && existingVideoPath) return resolveMediaUrl(existingVideoPath);
        return null;
    }, [storyVideoFile, removeStoryVideo, existingVideoPath]);

    useEffect(() => {
        return () => {
            if (storyVideoFile && videoSrc) URL.revokeObjectURL(videoSrc);
        };
    }, [storyVideoFile, videoSrc]);

    // Normalized scene timing list
    const timedScenes = useMemo(
        () =>
            (scenes || []).map((sc, idx) => {
                const bounds = getSceneBounds(sc, idx, mapStartSec);
                return {
                    ...sc,
                    _idx: idx,
                    _start: bounds.start,
                    _end: bounds.end,
                    _offset: Number(sc.audio_offset_sec || 0),
                };
            }),
        [scenes, mapStartSec]
    );

    const activeScene = timedScenes[selectedSceneIdx] || timedScenes[0] || null;

    // Resolve active teacher audio source for preview (Whole OR Selected Per-Scene)
    const wholeAudioObj = useMemo(() => {
        if (wholeVoiceoverFile) {
            return {
                url: URL.createObjectURL(wholeVoiceoverFile),
                isBlob: true,
                isVideo: isVideoLikeFile(wholeVoiceoverFile),
                label: wholeVoiceoverFile.name,
            };
        }
        if (!removeWholeVoiceover && existingWholePath) {
            return {
                url: resolveMediaUrl(existingWholePath),
                isBlob: false,
                isVideo: false,
                label: 'Naka-save na Buong Voice-Over',
            };
        }
        return null;
    }, [wholeVoiceoverFile, removeWholeVoiceover, existingWholePath]);

    useEffect(() => {
        return () => {
            if (wholeAudioObj?.isBlob) URL.revokeObjectURL(wholeAudioObj.url);
        };
    }, [wholeAudioObj]);

    // Build preview URLs for ALL scenes so teacher can test single scene OR all scenes before saving!
    const sceneAudioMap = useMemo(() => {
        const mapObj = {};
        (timedScenes || []).forEach((sc, idx) => {
            const picked = sceneAudioFiles?.[idx];
            if (picked) {
                mapObj[idx] = {
                    url: URL.createObjectURL(picked),
                    isBlob: true,
                    isVideo: isVideoLikeFile(picked),
                    label: picked.name,
                };
            } else if (!removedSceneIndices?.includes(idx) && sc.audio_path) {
                mapObj[idx] = {
                    url: resolveMediaUrl(sc.audio_path),
                    isBlob: false,
                    isVideo: false,
                    label: `Naka-save (Eksena ${idx + 1})`,
                };
            }
        });
        return mapObj;
    }, [timedScenes, sceneAudioFiles, removedSceneIndices]);

    useEffect(() => {
        return () => {
            Object.values(sceneAudioMap).forEach((entry) => {
                if (entry?.isBlob && entry.url) URL.revokeObjectURL(entry.url);
            });
        };
    }, [sceneAudioMap]);

    timedScenesRef.current = timedScenes;
    sceneAudioMapRef.current = sceneAudioMap;

    const activeSceneAudioObj = activeScene ? sceneAudioMap[activeScene._idx] || null : null;
    const anyPerSceneAudioCount = Object.keys(sceneAudioMap).length;

    const currentTargetAudio = voiceoverMode === 'whole' ? wholeAudioObj : voiceoverMode === 'per_scene' ? activeSceneAudioObj : null;
    const targetStart = voiceoverMode === 'per_scene' && activeScene ? activeScene._start : 0;
    const targetEnd =
        voiceoverMode === 'per_scene' && activeScene
            ? activeScene._end
            : Math.max(videoDuration || 50, timedScenes[timedScenes.length - 1]?._end || 50);
    const targetDuration = Math.max(1, targetEnd - targetStart);
    const currentOffset =
        voiceoverMode === 'whole'
            ? Number(wholeOffsetSec || 0)
            : voiceoverMode === 'per_scene' && activeScene
              ? activeScene._offset
              : 0;

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
            if (previewAudioRef.current) {
                previewAudioRef.current.pause();
                previewAudioRef.current = null;
            }
            if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
                mediaRecorderRef.current.stop();
            }
            if (streamRef.current) {
                streamRef.current.getTracks().forEach((t) => t.stop());
            }
        };
    }, []);

    // Recording elapsed timer
    useEffect(() => {
        if (!recording) return undefined;
        const id = setInterval(() => setRecordSeconds((s) => s + 1), 1000);
        return () => clearInterval(id);
    }, [recording]);

    const stopSyncedPreview = () => {
        previewTokenRef.current += 1;
        previewRangeRef.current.active = false;
        previewRangeRef.current.seeking = false;
        previewRangeRef.current.activeSceneIdx = -1;
        setPreviewing(false);
        setPreviewMode('single');
        if (previewAudioRef.current) {
            previewAudioRef.current.pause();
            previewAudioRef.current = null;
        }
        if (videoRef.current) {
            videoRef.current.pause();
            videoRef.current.muted = false;
        }
    };

    const stopRecording = () => {
        if (countdownTimerRef.current) {
            clearInterval(countdownTimerRef.current);
            countdownTimerRef.current = null;
        }
        setCountdown(0);
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
        }
        if (videoRef.current) {
            videoRef.current.pause();
            videoRef.current.muted = false;
        }
        setRecording(false);
    };

    // Start live video-synced mic recording with 3-2-1 countdown
    const startSyncedRecording = async () => {
        setMicError('');
        stopSyncedPreview();

        if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
            setMicError('Hindi suportado ng browser ang mic recording. Gumamit na lang ng Mag-upload Audio/Video.');
            return;
        }

        let stream;
        try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;
        } catch {
            setMicError('Hindi nabuksan ang mikropono. Paki-allow ang Microphone permission sa browser.');
            return;
        }

        const recMode = voiceoverMode === 'per_scene' ? 'per_scene' : 'whole';
        const recIdx = selectedSceneIdx;
        const recStart = recMode === 'per_scene' && activeScene ? activeScene._start : 0;
        const recEnd =
            recMode === 'per_scene' && activeScene
                ? activeScene._end
                : Math.max(videoDuration || 50, timedScenes[timedScenes.length - 1]?._end || 50);

        recordRangeRef.current = { start: recStart, end: recEnd, target: recMode, sceneIdx: recIdx };

        // Seek video to exact start frame while counting down
        if (videoRef.current) {
            videoRef.current.pause();
            videoRef.current.muted = true;
            try {
                videoRef.current.currentTime = recStart;
            } catch {
                // ignore seek error if metadata not ready
            }
        }

        setCountdown(3);
        let tick = 3;
        countdownTimerRef.current = setInterval(() => {
            tick -= 1;
            if (tick > 0) {
                setCountdown(tick);
                return;
            }
            clearInterval(countdownTimerRef.current);
            countdownTimerRef.current = null;
            setCountdown(0);

            const preferredTypes = [
                'audio/webm;codecs=opus',
                'audio/webm',
                'audio/mp4',
                'audio/ogg;codecs=opus',
                'audio/ogg',
            ];
            const mime = preferredTypes.find((t) => MediaRecorder.isTypeSupported(t)) || '';
            const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
            chunksRef.current = [];
            recorder.ondataavailable = (ev) => {
                if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
            };
            recorder.onstop = () => {
                const blobType = recorder.mimeType || mime || 'audio/webm';
                const blob = new Blob(chunksRef.current, { type: blobType });
                const lower = blobType.toLowerCase();
                const ext =
                    lower.includes('mp4') || lower.includes('aac') || lower.includes('m4a')
                        ? 'm4a'
                        : lower.includes('ogg')
                          ? 'ogg'
                          : 'webm';
                const { target, sceneIdx } = recordRangeRef.current;
                if (blob.size > 0) {
                    const fileName =
                        target === 'whole'
                            ? `mapa${mapNumber}_whole_vo_${Date.now()}.${ext}`
                            : `mapa${mapNumber}_eksena${sceneIdx + 1}_vo_${Date.now()}.${ext}`;
                    const file = new File([blob], fileName, { type: blobType.split(';')[0] });
                    if (target === 'whole') {
                        onWholeFileSelectRef.current?.(file);
                    } else {
                        onSceneAudioSelectRef.current?.(sceneIdx, file);
                    }
                } else {
                    setMicError('Walang nakuhang tunog sa recording. Pakiulit at tiyaking nakabukas ang mic.');
                }
                if (streamRef.current) {
                    streamRef.current.getTracks().forEach((t) => t.stop());
                    streamRef.current = null;
                }
                setRecording(false);
            };

            mediaRecorderRef.current = recorder;
            setRecordSeconds(0);
            setRecording(true);
            recorder.start(250);

            if (videoRef.current) {
                videoRef.current.muted = true;
                try {
                    videoRef.current.currentTime = recStart;
                } catch {
                    // ignore
                }
                videoRef.current.play().catch(() => {});
            }
        }, 850);
    };

    // Seek 3D video safely without triggering a premature timeupdate stop on the previous timestamp
    const seekVideoAndRun = (video, targetSec, token, onReady) => {
        const needsSeek = Math.abs((video.currentTime || 0) - targetSec) > 0.15;
        if (!needsSeek) {
            previewRangeRef.current.seeking = false;
            if (token === previewTokenRef.current && previewRangeRef.current.active) onReady();
            return;
        }

        previewRangeRef.current.seeking = true;
        let done = false;
        const finishSeek = () => {
            if (done) return;
            done = true;
            previewRangeRef.current.seeking = false;
            if (token === previewTokenRef.current && previewRangeRef.current.active) {
                onReady();
            }
        };
        video.addEventListener('seeked', finishSeek, { once: true });
        setTimeout(finishSeek, 350);
        try {
            video.currentTime = targetSec;
        } catch {
            finishSeek();
        }
    };

    // Sync active scene voice-over during "I-preview Lahat" full-map per-scene test
    const syncAllScenesAtTime = (t, video, token) => {
        const scenesList = timedScenesRef.current || [];
        const sc = scenesList.find((item) => t >= item._start && t < item._end) || null;

        if (!sc) {
            if (previewAudioRef.current) {
                previewAudioRef.current.pause();
                previewAudioRef.current = null;
            }
            previewRangeRef.current.activeSceneIdx = -1;
            video.muted = false;
            return;
        }

        if (sc._idx !== previewRangeRef.current.activeSceneIdx) {
            previewRangeRef.current.activeSceneIdx = sc._idx;
            setSelectedSceneIdx(sc._idx);

            if (previewAudioRef.current) {
                previewAudioRef.current.pause();
                previewAudioRef.current = null;
            }

            const entry = sceneAudioMapRef.current?.[sc._idx] || null;
            if (!entry) {
                // Keep 3D video's built-in voice audible for scenes without custom audio
                video.muted = false;
                return;
            }

            video.muted = true;
            const el = createVoiceMediaElement(entry.url);
            el.addEventListener(
                'error',
                () => {
                    if (token === previewTokenRef.current) {
                        setMicError(
                            `Hindi ma-play ang audio ng Eksena ${sc._idx + 1} sa browser na ito. Subukan ang MP4, MP3, WAV, o M4A.`
                        );
                    }
                },
                { once: true }
            );
            previewAudioRef.current = el;

            let started = false;
            const startSceneAudio = () => {
                if (started) return;
                started = true;
                if (
                    token !== previewTokenRef.current ||
                    !previewRangeRef.current.active ||
                    previewAudioRef.current !== el
                ) {
                    return;
                }
                const liveT = videoRef.current?.currentTime ?? t;
                const liveDesired = liveT - sc._start - Number(sc._offset || 0);
                if (liveDesired < 0) return;
                if (!el.duration || liveDesired < el.duration) {
                    try {
                        el.currentTime = liveDesired;
                    } catch {
                        // ignore
                    }
                    if (!video.paused) el.play().catch(() => {});
                }
            };

            if (el.readyState >= 1) {
                startSceneAudio();
            } else {
                el.addEventListener('loadedmetadata', startSceneAudio, { once: true });
                el.addEventListener('canplay', startSceneAudio, { once: true });
                setTimeout(startSceneAudio, 350);
            }
            return;
        }

        const a = previewAudioRef.current;
        if (!a) return;

        const desired = t - sc._start - Number(sc._offset || 0);
        if (desired < 0) {
            if (!a.paused) a.pause();
        } else if (!a.duration || desired < a.duration) {
            if (Math.abs((a.currentTime || 0) - desired) > 0.35) {
                try {
                    a.currentTime = desired;
                } catch {
                    // ignore
                }
            }
            if (a.paused && !video.paused) {
                a.play().catch(() => {});
            }
        } else if (!a.paused) {
            a.pause();
        }
    };

    // Preview teacher's audio/video VO layered directly on top of the 3D video at exact offset!
    const startSyncedPreview = () => {
        if (!videoRef.current || !currentTargetAudio) return;
        setMicError('');
        if (recording) stopRecording();
        stopSyncedPreview();

        const token = ++previewTokenRef.current;
        const video = videoRef.current;
        const audio = createVoiceMediaElement(currentTargetAudio.url);
        audio.addEventListener(
            'error',
            () => {
                if (token === previewTokenRef.current) {
                    setMicError(
                        'Hindi ma-play ang audio ng napiling file sa browser na ito. Subukan ang MP4, MP3, WAV, o M4A.'
                    );
                    stopSyncedPreview();
                }
            },
            { once: true }
        );
        previewAudioRef.current = audio;

        previewRangeRef.current = {
            active: true,
            seeking: false,
            start: targetStart,
            end: targetEnd,
            offset: currentOffset,
            mode: voiceoverMode,
            activeSceneIdx: voiceoverMode === 'per_scene' ? selectedSceneIdx : -1,
        };
        setPreviewMode('single');
        video.muted = true;

        const initialAudioTime = -currentOffset;
        let audioReadyDone = false;
        const beginPlayback = () => {
            if (audioReadyDone) return;
            audioReadyDone = true;
            if (token !== previewTokenRef.current || !previewRangeRef.current.active) return;

            seekVideoAndRun(video, targetStart, token, () => {
                setPreviewing(true);
                video.play().catch(() => {});
                if (initialAudioTime >= 0) {
                    try {
                        audio.currentTime = initialAudioTime;
                    } catch {
                        // ignore
                    }
                    audio.play().catch(() => {});
                }
            });
        };

        if (audio.readyState >= 1) {
            beginPlayback();
        } else {
            audio.addEventListener('loadedmetadata', beginPlayback, { once: true });
            audio.addEventListener('canplay', beginPlayback, { once: true });
            setTimeout(beginPlayback, 350);
        }
    };

    // Preview ALL scenes continuously from 0:00 to end before saving!
    const startFullMapPreview = () => {
        if (!videoRef.current || timedScenesRef.current.length === 0) return;
        setMicError('');
        if (recording) stopRecording();
        stopSyncedPreview();

        const token = ++previewTokenRef.current;
        const video = videoRef.current;
        const fullEnd = Math.max(
            videoDuration || 50,
            timedScenesRef.current[timedScenesRef.current.length - 1]?._end || 50
        );

        previewRangeRef.current = {
            active: true,
            seeking: false,
            start: 0,
            end: fullEnd,
            offset: 0,
            mode: 'all_scenes',
            activeSceneIdx: -1,
        };
        setPreviewMode('all');

        seekVideoAndRun(video, 0, token, () => {
            setPreviewing(true);
            video.play().catch(() => {});
            syncAllScenesAtTime(0, video, token);
        });
    };

    // Video timeupdate listener: auto-stops recording/preview at end & syncs teacher audio with offset!
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return undefined;

        const onLoadedMetadata = () => {
            if (video.duration && Number.isFinite(video.duration)) {
                setVideoDuration(Math.round(video.duration));
            }
        };

        const onTimeUpdate = () => {
            const t = video.currentTime;
            setVideoTime(t);

            // Auto-stop recording when reaching end of scene/map
            if (recording && t >= recordRangeRef.current.end - 0.08) {
                stopRecording();
                return;
            }

            if (!previewRangeRef.current.active || previewRangeRef.current.seeking) {
                return;
            }

            // Full-map per-scene test mode ("I-preview Lahat")
            if (previewRangeRef.current.mode === 'all_scenes') {
                if (t >= previewRangeRef.current.end - 0.08) {
                    stopSyncedPreview();
                    return;
                }
                syncAllScenesAtTime(t, video, previewTokenRef.current);
                return;
            }

            // Single scene / whole map synced preview
            if (previewAudioRef.current) {
                const { start, end, offset } = previewRangeRef.current;
                if (t >= end - 0.08) {
                    stopSyncedPreview();
                    return;
                }
                const a = previewAudioRef.current;
                const desired = t - start - offset;
                if (desired < 0) {
                    if (!a.paused) a.pause();
                } else if (!a.duration || desired < a.duration) {
                    if (Math.abs((a.currentTime || 0) - desired) > 0.35) {
                        try {
                            a.currentTime = desired;
                        } catch {
                            // ignore
                        }
                    }
                    if (a.paused && !video.paused) {
                        a.play().catch(() => {});
                    }
                } else if (!a.paused) {
                    a.pause();
                }
            }
        };

        const onPause = () => {
            if (previewRangeRef.current.active && previewAudioRef.current && !previewAudioRef.current.paused) {
                previewAudioRef.current.pause();
            }
        };

        const onEnded = () => {
            if (recording) stopRecording();
            if (previewRangeRef.current.active) stopSyncedPreview();
        };

        video.addEventListener('loadedmetadata', onLoadedMetadata);
        video.addEventListener('timeupdate', onTimeUpdate);
        video.addEventListener('pause', onPause);
        video.addEventListener('ended', onEnded);
        return () => {
            video.removeEventListener('loadedmetadata', onLoadedMetadata);
            video.removeEventListener('timeupdate', onTimeUpdate);
            video.removeEventListener('pause', onPause);
            video.removeEventListener('ended', onEnded);
        };
    }, [recording, videoSrc]);

    // Update live preview offset dynamically when teacher nudges offset while playing
    useEffect(() => {
        previewRangeRef.current.offset = currentOffset;
    }, [currentOffset]);

    const jumpVideoTo = (sec) => {
        if (!videoRef.current) return;
        try {
            videoRef.current.currentTime = Math.max(0, Number(sec) || 0);
            setVideoTime(Math.max(0, Number(sec) || 0));
        } catch {
            // ignore
        }
    };

    const nudgeOffset = (delta) => {
        const next = Math.round((currentOffset + delta) * 10) / 10;
        if (voiceoverMode === 'whole') {
            onWholeOffsetChange(Math.max(-30, Math.min(30, next)));
        } else if (voiceoverMode === 'per_scene' && activeScene) {
            onSceneUpdate(activeScene._idx, 'audio_offset_sec', Math.max(-15, Math.min(15, next)));
        }
    };

    const activeBarStart = previewing && previewMode === 'all' ? 0 : targetStart;
    const activeBarEnd =
        previewing && previewMode === 'all'
            ? Math.max(videoDuration || 50, timedScenes[timedScenes.length - 1]?._end || 50)
            : targetEnd;
    const recordingPct = Math.min(
        100,
        Math.max(0, ((videoTime - activeBarStart) / Math.max(1, activeBarEnd - activeBarStart)) * 100)
    );

    const activeTeleprompterIdx = timedScenes.findIndex((s) => videoTime >= s._start && videoTime < s._end);
    const liveStudioCues = useMemo(() => buildTimedCues(timedScenes), [timedScenes]);
    const activeStudioCue = liveStudioCues.find((c) => videoTime >= c.start && videoTime <= c.end) || null;
    const isCurrentSceneDirty =
        voiceoverMode === 'per_scene' &&
        (dirtySceneIndices.includes(selectedSceneIdx) ||
            Boolean(sceneAudioFiles?.[selectedSceneIdx]) ||
            removedSceneIndices.includes(selectedSceneIdx));
    const isSavingCurrentScene = savingSceneIdx === selectedSceneIdx || savingSceneIdx === 'all';

    return (
        <div className="space-y-3.5">
            {/* Compact Voice-Over Mode Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    <Mic className="w-4 h-4 text-[#C2410C]" />
                    <h4 className="text-xs font-bold text-[#1E293B]">Voice-Over Mode</h4>
                </div>
                <div className="inline-flex rounded-lg bg-[#F3F4F6] p-0.5 border border-[#E5E7EB]">
                    {[
                        { id: 'default', label: 'Default' },
                        { id: 'whole', label: 'Whole' },
                        { id: 'per_scene', label: 'Per-Scene' },
                    ].map((opt) => (
                        <button
                            key={opt.id}
                            type="button"
                            onClick={() => {
                                stopSyncedPreview();
                                if (recording) stopRecording();
                                onModeChange(opt.id);
                            }}
                            className={`px-3 py-1 rounded-md text-[11px] font-semibold transition cursor-pointer ${
                                voiceoverMode === opt.id
                                    ? 'bg-white text-[#1E293B] shadow-2xs'
                                    : 'text-slate-600 hover:text-[#1E293B]'
                            }`}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Per-Scene Selector Strip + Compact 3-Dot Legend */}
            {voiceoverMode === 'per_scene' && timedScenes.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                    {timedScenes.map((sc, i) => {
                        const hasPending = Boolean(sceneAudioFiles?.[i]) || dirtySceneIndices.includes(i);
                        const hasSaved = !removedSceneIndices?.includes(i) && Boolean(sc.audio_path);
                        const isSel = i === selectedSceneIdx;
                        return (
                            <button
                                key={i}
                                type="button"
                                onClick={() => {
                                    stopSyncedPreview();
                                    if (recording) stopRecording();
                                    setSelectedSceneIdx(i);
                                    jumpVideoTo(sc._start);
                                }}
                                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                                    isSel
                                        ? 'bg-[#1E293B] text-white border-[#1E293B] shadow-2xs'
                                        : 'bg-white text-slate-700 border-[#E5E7EB] hover:border-slate-400'
                                }`}
                            >
                                <span
                                    className={`w-2 h-2 rounded-full ${
                                        hasPending
                                            ? 'bg-amber-400'
                                            : hasSaved
                                              ? 'bg-emerald-500'
                                              : isSel
                                                ? 'bg-slate-400'
                                                : 'bg-slate-300'
                                    }`}
                                />
                                <span>Eksena {i + 1}</span>
                                <span className={`text-[10px] font-mono ${isSel ? 'text-slate-300' : 'text-slate-400'}`}>
                                    {formatClock(sc._start)}–{formatClock(sc._end)}
                                </span>
                            </button>
                        );
                    })}
                    <div className="inline-flex items-center gap-3 text-[11px] text-slate-500 ml-auto">
                        <span className="inline-flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-emerald-500" />
                            Naka-save
                        </span>
                        <span className="inline-flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-amber-400" />
                            Di pa na-save
                        </span>
                        <span className="inline-flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-slate-300" />
                            Default
                        </span>
                    </div>
                </div>
            )}

            {/* Main 2-Column Synced Dubbing Deck */}
            <div className="grid lg:grid-cols-12 gap-4 items-start">
                {/* LEFT COLUMN: 3D Video Monitor + Clean 2-Row Controls */}
                <div className="lg:col-span-7 rounded-xl border border-[#E5E7EB] bg-[#FAFAFA] p-3.5 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[11px] font-bold text-slate-700 inline-flex items-center gap-1.5">
                            <Video className="w-3.5 h-3.5 text-[#C2410C]" />
                            <span>3D Story Video</span>
                            {videoSrc && (
                                <span className="font-mono text-slate-400 font-normal">
                                    ({formatClock(videoTime)} / {formatClock(videoDuration)})
                                </span>
                            )}
                        </span>
                        <div className="flex items-center gap-2">
                            <label className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-[#E5E7EB] bg-white hover:bg-slate-50 text-[11px] font-semibold text-slate-700 cursor-pointer">
                                <Upload className="w-3 h-3" />
                                <span className="truncate max-w-[140px]">
                                    {storyVideoFile ? storyVideoFile.name : 'Palitan Video'}
                                </span>
                                <input
                                    type="file"
                                    accept="video/*,.mp4,.mov,.webm"
                                    className="hidden"
                                    onChange={(e) => {
                                        const f = e.target.files?.[0];
                                        e.target.value = '';
                                        if (f) onStoryVideoSelect(f);
                                    }}
                                />
                            </label>
                            {videoSrc && (
                                <button
                                    type="button"
                                    onClick={onStoryVideoRemove}
                                    className="text-[11px] font-semibold text-rose-600 hover:underline cursor-pointer"
                                >
                                    Alisin
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Video Viewport + Live Status Overlays */}
                    <div className="relative w-full aspect-video rounded-lg overflow-hidden bg-slate-950 border border-[#E5E7EB]">
                        {videoSrc ? (
                            <video
                                ref={videoRef}
                                src={videoSrc}
                                controls={!recording && countdown === 0}
                                playsInline
                                preload="metadata"
                                className="w-full h-full object-contain"
                            />
                        ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 text-xs gap-1.5 px-4 text-center">
                                <Video className="w-6 h-6 opacity-60" />
                                <span>Wala pang 3D MP4 video sa mapang ito. Mag-upload ng MP4 o gamitin ang script sa kanan.</span>
                            </div>
                        )}

                        {/* 3-2-1 Countdown Overlay */}
                        {countdown > 0 && (
                            <div className="absolute inset-0 bg-slate-950/75 flex flex-col items-center justify-center text-white">
                                <span className="text-xs uppercase tracking-widest text-orange-300 font-semibold">
                                    Humanda sa Pagbasa
                                </span>
                                <span className="text-6xl font-extrabold tabular-nums mt-1">{countdown}</span>
                            </div>
                        )}

                        {/* Live Recording Pill */}
                        {recording && (
                            <div className="absolute top-3 left-3 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-600 text-white text-xs font-bold">
                                <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                                <span className="tabular-nums">
                                    REC {formatClock(recordSeconds)} / {formatClock(targetDuration)}
                                </span>
                            </div>
                        )}

                        {/* Live Synced Preview Pill */}
                        {previewing && !recording && (
                            <div className="absolute top-3 left-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#C2410C] text-white text-xs font-bold">
                                <Volume2 className="w-3.5 h-3.5" />
                                <span>
                                    {previewMode === 'all'
                                        ? `Preview Whole — Eksena ${selectedSceneIdx + 1} (${
                                              activeSceneAudioObj ? 'Boses ng Guro' : 'Default'
                                          })`
                                        : `Preview: ${
                                              voiceoverMode === 'per_scene'
                                                  ? `Eksena ${selectedSceneIdx + 1}`
                                                  : 'Whole'
                                          } (Offset ${currentOffset >= 0 ? `+${currentOffset}` : currentOffset}s)`}
                                </span>
                            </div>
                        )}

                        {/* Live In-Video Subtitle Preview (clean pure-white text positioned cleanly above video controls) */}
                        {videoSrc && countdown === 0 && activeStudioCue && (
                            <div className="pointer-events-none absolute inset-x-4 bottom-14 z-10 flex justify-center">
                                <div className="max-w-[92%] text-center">
                                    <p
                                        className="text-xs sm:text-sm font-bold text-white leading-snug"
                                        style={{
                                            textShadow:
                                                '0 1px 3px rgba(0,0,0,0.9), 0 2px 8px rgba(0,0,0,0.75), 0 0 1px rgba(0,0,0,0.9)',
                                        }}
                                    >
                                        {activeStudioCue.who && (
                                            <span className="font-extrabold text-[#FDE047] mr-1">
                                                {activeStudioCue.who}:
                                            </span>
                                        )}
                                        <span>
                                            {activeStudioCue.who ? `“${activeStudioCue.text}”` : activeStudioCue.text}
                                        </span>
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Scene Progress Bar during recording or preview */}
                    {(recording || previewing) && (
                        <div className="space-y-1">
                            <div className="h-1.5 w-full rounded-full bg-slate-200 overflow-hidden">
                                <div
                                    className={`h-full transition-all duration-150 ${recording ? 'bg-rose-600' : 'bg-[#C2410C]'}`}
                                    style={{ width: `${recordingPct}%` }}
                                />
                            </div>
                            <div className="flex justify-between text-[10px] font-mono text-slate-500">
                                <span>Simula: {formatClock(activeBarStart)}</span>
                                <span>Kasalukuyan: {formatClock(videoTime)}</span>
                                <span>Dulo: {formatClock(activeBarEnd)}</span>
                            </div>
                        </div>
                    )}

                    {/* Clean 2-Row Studio Controls Deck (Record/Upload/Save + Aligned Preview Pair) */}
                    {voiceoverMode !== 'default' && (
                        <div className="space-y-2.5 pt-2 border-t border-[#E5E7EB]">
                            {/* ROW 1: Input Actions (Record + Upload) & Per-Scene Save */}
                            <div className="flex flex-wrap items-center gap-2">
                                {!recording && countdown === 0 ? (
                                    <button
                                        type="button"
                                        onClick={startSyncedRecording}
                                        className="h-9 inline-flex items-center gap-1.5 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition cursor-pointer"
                                    >
                                        <Mic className="w-3.5 h-3.5 text-orange-400" />
                                        <span>
                                            {voiceoverMode === 'per_scene'
                                                ? `I-record Eksena ${selectedSceneIdx + 1}`
                                                : 'I-record Whole'}
                                        </span>
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={stopRecording}
                                        className="h-9 inline-flex items-center gap-1.5 px-3 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold transition cursor-pointer"
                                    >
                                        <Square className="w-3.5 h-3.5 fill-current" />
                                        <span>Ihinto ({formatClock(recordSeconds)})</span>
                                    </button>
                                )}

                                <label className="h-9 inline-flex items-center gap-1.5 px-3 rounded-lg border border-[#E5E7EB] bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer transition">
                                    <Upload className="w-3.5 h-3.5 text-slate-500" />
                                    <span>Mag-upload Audio/Video</span>
                                    <input
                                        type="file"
                                        accept="audio/*,video/*,.mp3,.wav,.ogg,.m4a,.aac,.webm,.mp4,.mov,.mkv,.3gp"
                                        className="hidden"
                                        onChange={(e) => {
                                            const f = e.target.files?.[0];
                                            e.target.value = '';
                                            if (!f) return;
                                            stopSyncedPreview();
                                            setMicError('');
                                            if (voiceoverMode === 'whole') onWholeFileSelectRef.current?.(f);
                                            else onSceneAudioSelectRef.current?.(selectedSceneIdx, f);
                                        }}
                                    />
                                </label>

                                {voiceoverMode === 'per_scene' && onSaveScene && (
                                    <button
                                        type="button"
                                        disabled={isSavingCurrentScene || recording || countdown > 0}
                                        onClick={() => {
                                            stopSyncedPreview();
                                            onSaveScene(selectedSceneIdx);
                                        }}
                                        className={`h-9 sm:ml-auto inline-flex items-center gap-1.5 px-3.5 rounded-lg text-xs font-semibold transition cursor-pointer disabled:opacity-60 ${
                                            isCurrentSceneDirty
                                                ? 'bg-[#C2410C] hover:bg-[#9A3412] text-white shadow-xs'
                                                : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200'
                                        }`}
                                    >
                                        {isCurrentSceneDirty || isSavingCurrentScene ? (
                                            <Save className="w-3.5 h-3.5" />
                                        ) : (
                                            <Check className="w-3.5 h-3.5" />
                                        )}
                                        <span>
                                            {isSavingCurrentScene
                                                ? `Sine-save Eksena ${selectedSceneIdx + 1}...`
                                                : isCurrentSceneDirty
                                                  ? `I-save Eksena ${selectedSceneIdx + 1}`
                                                  : `Na-save Eksena ${selectedSceneIdx + 1}`}
                                        </span>
                                    </button>
                                )}
                            </div>

                            {/* ROW 2: Aligned Preview Pair (I-preview Eksena X + I-preview Whole) + Alisin Audio */}
                            {videoSrc && !recording && countdown === 0 && (
                                <div className="flex flex-wrap items-center gap-2">
                                    {voiceoverMode === 'per_scene' ? (
                                        <div className="inline-flex flex-wrap items-center gap-2">
                                            <button
                                                type="button"
                                                disabled={!currentTargetAudio}
                                                onClick={
                                                    previewing && previewMode === 'single'
                                                        ? stopSyncedPreview
                                                        : startSyncedPreview
                                                }
                                                className={`h-9 inline-flex items-center gap-1.5 px-3.5 rounded-lg border text-xs font-semibold transition ${
                                                    !currentTargetAudio
                                                        ? 'bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed'
                                                        : previewing && previewMode === 'single'
                                                          ? 'bg-slate-900 text-white border-slate-900 cursor-pointer'
                                                          : 'bg-white text-[#1E293B] border-[#E5E7EB] hover:border-slate-400 cursor-pointer'
                                                }`}
                                            >
                                                {previewing && previewMode === 'single' ? (
                                                    <>
                                                        <Square className="w-3 h-3 fill-current" />
                                                        <span>Ihinto Eksena {selectedSceneIdx + 1}</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <Play className="w-3.5 h-3.5 fill-current text-[#C2410C]" />
                                                        <span>I-preview Eksena {selectedSceneIdx + 1}</span>
                                                    </>
                                                )}
                                            </button>

                                            <button
                                                type="button"
                                                onClick={
                                                    previewing && previewMode === 'all'
                                                        ? stopSyncedPreview
                                                        : startFullMapPreview
                                                }
                                                className={`h-9 inline-flex items-center gap-1.5 px-3.5 rounded-lg border text-xs font-semibold transition cursor-pointer ${
                                                    previewing && previewMode === 'all'
                                                        ? 'bg-slate-900 text-white border-slate-900'
                                                        : 'bg-white text-[#1E293B] border-[#E5E7EB] hover:border-slate-400'
                                                }`}
                                            >
                                                {previewing && previewMode === 'all' ? (
                                                    <>
                                                        <Square className="w-3 h-3 fill-current" />
                                                        <span>Ihinto Whole</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <Play className="w-3.5 h-3.5 fill-current text-emerald-600" />
                                                        <span>I-preview Whole</span>
                                                    </>
                                                )}
                                            </button>
                                        </div>
                                    ) : (
                                        currentTargetAudio && (
                                            <button
                                                type="button"
                                                onClick={
                                                    previewing && previewMode === 'single'
                                                        ? stopSyncedPreview
                                                        : startSyncedPreview
                                                }
                                                className={`h-9 inline-flex items-center gap-1.5 px-3.5 rounded-lg border text-xs font-semibold transition cursor-pointer ${
                                                    previewing && previewMode === 'single'
                                                        ? 'bg-slate-900 text-white border-slate-900'
                                                        : 'bg-white text-[#1E293B] border-[#E5E7EB] hover:border-slate-400'
                                                }`}
                                            >
                                                {previewing && previewMode === 'single' ? (
                                                    <>
                                                        <Square className="w-3 h-3 fill-current" />
                                                        <span>Ihinto Whole</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <Play className="w-3.5 h-3.5 fill-current text-[#C2410C]" />
                                                        <span>I-preview Whole</span>
                                                    </>
                                                )}
                                            </button>
                                        )
                                    )}

                                    {currentTargetAudio && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                stopSyncedPreview();
                                                if (voiceoverMode === 'whole') onWholeRemove();
                                                else onSceneAudioRemove(selectedSceneIdx);
                                            }}
                                            className="h-9 ml-auto inline-flex items-center gap-1 px-2.5 rounded-lg text-[11px] font-semibold text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                            <span>Alisin Audio</span>
                                        </button>
                                    )}
                                </div>
                            )}

                            {micError && <p className="text-[11px] text-rose-600 font-medium">{micError}</p>}

                            {currentTargetAudio && (
                                <div className="rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 space-y-1.5">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div className="flex items-center gap-2 min-w-0 max-w-[260px]">
                                            <span
                                                className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                                                    currentTargetAudio.isBlob
                                                        ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                                        : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                                }`}
                                            >
                                                {currentTargetAudio.isBlob ? 'Di pa na-save' : 'Naka-save'}
                                            </span>
                                            <span className="text-[11px] font-semibold text-slate-700 truncate">
                                                {currentTargetAudio.label}
                                            </span>
                                        </div>
                                        <audio
                                            key={currentTargetAudio.url}
                                            controls
                                            src={currentTargetAudio.url}
                                            className="h-8 flex-1 min-w-[180px]"
                                        />
                                    </div>
                                    {currentTargetAudio.isVideo && (
                                        <p className="text-[11px] text-slate-500 flex items-center gap-1.5">
                                            <Volume2 className="w-3.5 h-3.5 text-[#C2410C] shrink-0" />
                                            <span>
                                                Video file ang na-upload — boses/audio lang nito ang tutugtog kasabay ng
                                                3D story video.
                                            </span>
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* RIGHT COLUMN: Editable Script Teleprompter + Timing Adjuster */}
                <div className="lg:col-span-5 rounded-xl border border-[#E5E7EB] bg-white p-3.5 space-y-3.5">
                    <div className="flex items-center justify-between border-b border-[#E5E7EB] pb-2">
                        <span className="text-xs font-bold text-[#1E293B]">
                            {voiceoverMode === 'per_scene' && activeScene
                                ? `Script & Timing — Eksena ${selectedSceneIdx + 1}`
                                : 'Editable Script Teleprompter'}
                        </span>
                        <span className="text-[10px] font-medium text-slate-400">
                            Puwedeng sundan o i-edit ng guro
                        </span>
                    </div>

                    {/* Per-Scene Active Teleprompter + Collapsible Advanced Timing */}
                    {voiceoverMode === 'per_scene' && activeScene ? (
                        <div className="space-y-3">
                            <div>
                                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                                    Pamagat ng Eksena / Scene Title
                                </label>
                                <input
                                    type="text"
                                    value={activeScene.scene_title || ''}
                                    onChange={(e) => onSceneUpdate(activeScene._idx, 'scene_title', e.target.value)}
                                    className="w-full rounded-lg border border-[#E5E7EB] px-2.5 py-1.5 text-xs font-semibold"
                                />
                            </div>

                            <div>
                                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                                    Script & Subtitles / Editable Teleprompter
                                </label>
                                <textarea
                                    rows={5}
                                    value={activeScene.dialogue || ''}
                                    onChange={(e) => onSceneUpdate(activeScene._idx, 'dialogue', e.target.value)}
                                    className={`w-full rounded-lg border px-3 py-2 text-sm leading-relaxed transition ${
                                        recording
                                            ? 'border-[#C2410C] bg-orange-50/50 text-slate-900'
                                            : 'border-[#E5E7EB] bg-white text-slate-800'
                                    }`}
                                />
                            </div>

                            {/* Collapsible Advanced Timing (hidden by default so built-in sync stays clean!) */}
                            <div className="rounded-lg border border-[#E5E7EB] bg-[#FAFAFA]">
                                <button
                                    type="button"
                                    onClick={() => setShowAdvancedTiming((v) => !v)}
                                    className="w-full px-3 py-2 flex items-center justify-between text-[11px] font-semibold text-slate-600 hover:text-[#1E293B] cursor-pointer"
                                >
                                    <span className="inline-flex items-center gap-1.5">
                                        <Sliders className="w-3.5 h-3.5 text-[#C2410C]" />
                                        <span>
                                            Advanced Timing (Optional) · {formatClock(activeScene._start)}–
                                            {formatClock(activeScene._end)}
                                        </span>
                                    </span>
                                    {showAdvancedTiming ? (
                                        <ChevronUp className="w-3.5 h-3.5" />
                                    ) : (
                                        <ChevronDown className="w-3.5 h-3.5" />
                                    )}
                                </button>

                                {showAdvancedTiming && (
                                    <div className="px-3 pb-3 pt-1 border-t border-[#E5E7EB] space-y-2.5">
                                        <div className="grid grid-cols-2 gap-2">
                                            <div>
                                                <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">
                                                    Simula / Start (sec)
                                                </label>
                                                <input
                                                    type="number"
                                                    step="0.5"
                                                    min={0}
                                                    value={activeScene._start}
                                                    onChange={(e) => {
                                                        const v = Math.max(0, Number(e.target.value) || 0);
                                                        onSceneUpdate(activeScene._idx, 'start_sec', v);
                                                        onSceneUpdate(
                                                            activeScene._idx,
                                                            'timestamp',
                                                            `${formatClock(v)}–${formatClock(activeScene._end)}`
                                                        );
                                                    }}
                                                    className="w-full rounded-md border border-[#E5E7EB] bg-white px-2 py-1 text-xs font-mono tabular-nums"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">
                                                    Dulo / End (sec)
                                                </label>
                                                <input
                                                    type="number"
                                                    step="0.5"
                                                    min={1}
                                                    value={activeScene._end}
                                                    onChange={(e) => {
                                                        const v = Math.max(
                                                            activeScene._start + 1,
                                                            Number(e.target.value) || 1
                                                        );
                                                        onSceneUpdate(activeScene._idx, 'end_sec', v);
                                                        onSceneUpdate(
                                                            activeScene._idx,
                                                            'timestamp',
                                                            `${formatClock(activeScene._start)}–${formatClock(v)}`
                                                        );
                                                    }}
                                                    className="w-full rounded-md border border-[#E5E7EB] bg-white px-2 py-1 text-xs font-mono tabular-nums"
                                                />
                                            </div>
                                        </div>

                                        <div>
                                            <div className="flex items-center justify-between mb-1">
                                                <label className="text-[10px] font-semibold text-slate-600 inline-flex items-center gap-1">
                                                    <Clock className="w-3 h-3" />
                                                    Audio Offset (s)
                                                </label>
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        onSceneUpdate(activeScene._idx, 'audio_offset_sec', 0)
                                                    }
                                                    className="text-[10px] font-semibold text-slate-500 hover:text-[#1E293B] inline-flex items-center gap-0.5 cursor-pointer"
                                                >
                                                    <RotateCcw className="w-2.5 h-2.5" /> Reset 0s
                                                </button>
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                                <button
                                                    type="button"
                                                    onClick={() => nudgeOffset(-0.2)}
                                                    className="px-2 py-1 rounded border border-[#E5E7EB] bg-white hover:bg-slate-50 text-[11px] font-mono font-semibold cursor-pointer"
                                                >
                                                    -0.2s
                                                </button>
                                                <input
                                                    type="number"
                                                    step="0.1"
                                                    min={-15}
                                                    max={15}
                                                    value={currentOffset}
                                                    onChange={(e) =>
                                                        onSceneUpdate(
                                                            activeScene._idx,
                                                            'audio_offset_sec',
                                                            Math.max(-15, Math.min(15, Number(e.target.value) || 0))
                                                        )
                                                    }
                                                    className="flex-1 rounded-md border border-[#E5E7EB] bg-white px-2 py-1 text-xs font-mono text-center tabular-nums"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => nudgeOffset(0.2)}
                                                    className="px-2 py-1 rounded border border-[#E5E7EB] bg-white hover:bg-slate-50 text-[11px] font-mono font-semibold cursor-pointer"
                                                >
                                                    +0.2s
                                                </button>
                                            </div>
                                            <p className="text-[10px] text-slate-500 mt-1">
                                                +0.5s = mas huli ang pasok / later; -0.5s = mas maaga / earlier.
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        /* Whole-Map OR Default Mode: Live Highlighted Teleprompter + Collapsible Whole Offset */
                        <div className="space-y-3">
                            {voiceoverMode === 'whole' && (
                                <div className="rounded-lg border border-[#E5E7EB] bg-[#FAFAFA]">
                                    <button
                                        type="button"
                                        onClick={() => setShowAdvancedTiming((v) => !v)}
                                        className="w-full px-3 py-2 flex items-center justify-between text-[11px] font-semibold text-slate-600 hover:text-[#1E293B] cursor-pointer"
                                    >
                                        <span className="inline-flex items-center gap-1.5">
                                            <Sliders className="w-3.5 h-3.5 text-[#C2410C]" />
                                            <span>
                                                Advanced Audio Offset (Optional) ·{' '}
                                                {currentOffset >= 0 ? `+${currentOffset}s` : `${currentOffset}s`}
                                            </span>
                                        </span>
                                        {showAdvancedTiming ? (
                                            <ChevronUp className="w-3.5 h-3.5" />
                                        ) : (
                                            <ChevronDown className="w-3.5 h-3.5" />
                                        )}
                                    </button>
                                    {showAdvancedTiming && (
                                        <div className="px-3 pb-3 pt-1 border-t border-[#E5E7EB] space-y-1.5">
                                            <div className="flex items-center justify-between">
                                                <span className="text-[10px] font-semibold text-slate-500">
                                                    Fine-tune pasok ng buong boses / Whole-map delay
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={() => onWholeOffsetChange(0)}
                                                    className="text-[10px] font-semibold text-slate-500 hover:text-[#1E293B] inline-flex items-center gap-0.5 cursor-pointer"
                                                >
                                                    <RotateCcw className="w-2.5 h-2.5" /> Reset 0s
                                                </button>
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                                <button
                                                    type="button"
                                                    onClick={() => nudgeOffset(-0.2)}
                                                    className="px-2 py-1 rounded border border-[#E5E7EB] bg-white hover:bg-slate-50 text-[11px] font-mono font-semibold cursor-pointer"
                                                >
                                                    -0.2s
                                                </button>
                                                <input
                                                    type="number"
                                                    step="0.1"
                                                    min={-30}
                                                    max={30}
                                                    value={currentOffset}
                                                    onChange={(e) =>
                                                        onWholeOffsetChange(
                                                            Math.max(-30, Math.min(30, Number(e.target.value) || 0))
                                                        )
                                                    }
                                                    className="flex-1 rounded-md border border-[#E5E7EB] bg-white px-2 py-1 text-xs font-mono text-center tabular-nums"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => nudgeOffset(0.2)}
                                                    className="px-2 py-1 rounded border border-[#E5E7EB] bg-white hover:bg-slate-50 text-[11px] font-mono font-semibold cursor-pointer"
                                                >
                                                    +0.2s
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                                {timedScenes.map((sc, idx) => {
                                    const isNow = activeTeleprompterIdx === idx && (recording || previewing);
                                    return (
                                        <div
                                            key={idx}
                                            className={`rounded-lg border p-2.5 space-y-1.5 transition ${
                                                isNow
                                                    ? 'border-[#C2410C] bg-orange-50/70'
                                                    : 'border-[#E5E7EB] bg-[#FAFAFA]'
                                            }`}
                                        >
                                            <div className="flex items-center justify-between gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => jumpVideoTo(sc._start)}
                                                    className="text-[11px] font-bold text-[#C2410C] hover:underline font-mono cursor-pointer"
                                                >
                                                    [{formatClock(sc._start)}–{formatClock(sc._end)}] {sc.scene_title}
                                                </button>
                                            </div>
                                            <textarea
                                                rows={2}
                                                value={sc.dialogue || ''}
                                                onChange={(e) => onSceneUpdate(idx, 'dialogue', e.target.value)}
                                                className="w-full rounded border border-[#E5E7EB] bg-white px-2 py-1.5 text-xs leading-relaxed text-slate-800"
                                            />
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Add / Manage Scenes footer */}
                    <div className="flex items-center justify-between pt-2 border-t border-[#E5E7EB]">
                        <button
                            type="button"
                            onClick={onAddScene}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[#F3F4F6] text-xs font-semibold hover:bg-slate-200 cursor-pointer"
                        >
                            <Plus className="w-3.5 h-3.5" /> Dagdagan ng Eksena
                        </button>
                        {voiceoverMode === 'per_scene' && timedScenes.length > 1 && activeScene && (
                            <button
                                type="button"
                                onClick={() => onRemoveScene?.(activeScene._idx)}
                                className="text-[11px] font-semibold text-rose-600 hover:underline cursor-pointer"
                            >
                                Tanggalin Eksena {selectedSceneIdx + 1}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
