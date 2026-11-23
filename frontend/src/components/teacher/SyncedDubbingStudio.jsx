import { useEffect, useMemo, useRef, useState } from 'react';
import {
    ChevronDown,
    ChevronUp,
    Clock,
    Mic,
    Play,
    Plus,
    RotateCcw,
    Sliders,
    Square,
    Trash2,
    Upload,
    Video,
    Volume2,
} from 'lucide-react';
import { resolveMediaUrl } from '../../api/axiosClient';
import { buildTimedCues } from '../../utils/subtitleCues';

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
    const previewRangeRef = useRef({ active: false, start: 0, end: 50, offset: 0, mode: 'whole' });

    const [selectedSceneIdx, setSelectedSceneIdx] = useState(0);
    const [videoDuration, setVideoDuration] = useState(50);
    const [videoTime, setVideoTime] = useState(0);
    const [countdown, setCountdown] = useState(0);
    const [recording, setRecording] = useState(false);
    const [recordSeconds, setRecordSeconds] = useState(0);
    const [previewing, setPreviewing] = useState(false);
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
        if (wholeVoiceoverFile) return { url: URL.createObjectURL(wholeVoiceoverFile), isBlob: true, label: wholeVoiceoverFile.name };
        if (!removeWholeVoiceover && existingWholePath) {
            return { url: resolveMediaUrl(existingWholePath), isBlob: false, label: 'Naka-save na Buong Voice-Over' };
        }
        return null;
    }, [wholeVoiceoverFile, removeWholeVoiceover, existingWholePath]);

    useEffect(() => {
        return () => {
            if (wholeAudioObj?.isBlob) URL.revokeObjectURL(wholeAudioObj.url);
        };
    }, [wholeAudioObj]);

    const activeSceneAudioObj = useMemo(() => {
        if (!activeScene) return null;
        const idx = activeScene._idx;
        const picked = sceneAudioFiles?.[idx];
        if (picked) return { url: URL.createObjectURL(picked), isBlob: true, label: picked.name };
        if (!removedSceneIndices?.includes(idx) && activeScene.audio_path) {
            return { url: resolveMediaUrl(activeScene.audio_path), isBlob: false, label: `Naka-save (Eksena ${idx + 1})` };
        }
        return null;
    }, [activeScene, sceneAudioFiles, removedSceneIndices]);

    useEffect(() => {
        return () => {
            if (activeSceneAudioObj?.isBlob) URL.revokeObjectURL(activeSceneAudioObj.url);
        };
    }, [activeSceneAudioObj]);

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
        previewRangeRef.current.active = false;
        setPreviewing(false);
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
            setMicError('Hindi suportado ng browser ang mic recording. Gumamit na lang ng Mag-upload ng Audio.');
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

            const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
                ? 'audio/webm;codecs=opus'
                : MediaRecorder.isTypeSupported('audio/webm')
                  ? 'audio/webm'
                  : '';
            const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
            chunksRef.current = [];
            recorder.ondataavailable = (ev) => {
                if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
            };
            recorder.onstop = () => {
                const blobType = recorder.mimeType || 'audio/webm';
                const blob = new Blob(chunksRef.current, { type: blobType });
                const ext = blobType.includes('ogg') ? 'ogg' : 'webm';
                const { target, sceneIdx } = recordRangeRef.current;
                const fileName =
                    target === 'whole'
                        ? `mapa${mapNumber}_whole_vo.${ext}`
                        : `mapa${mapNumber}_scene${sceneIdx + 1}_vo.${ext}`;
                const file = new File([blob], fileName, { type: blobType.split(';')[0] });
                if (target === 'whole') {
                    onWholeFileSelect(file);
                } else {
                    onSceneAudioSelect(sceneIdx, file);
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
            recorder.start();

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

    // Preview teacher's audio layered directly on top of the 3D video at exact offset!
    const startSyncedPreview = () => {
        if (!videoRef.current || !currentTargetAudio) return;
        if (recording) stopRecording();
        stopSyncedPreview();

        const video = videoRef.current;
        const audio = new Audio(currentTargetAudio.url);
        audio.preload = 'auto';
        previewAudioRef.current = audio;

        previewRangeRef.current = {
            active: true,
            start: targetStart,
            end: targetEnd,
            offset: currentOffset,
            mode: voiceoverMode,
        };

        video.muted = true;
        try {
            video.currentTime = targetStart;
        } catch {
            // ignore
        }

        const initialAudioTime = -currentOffset;
        const beginPlayback = () => {
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
        };

        if (audio.readyState >= 1) beginPlayback();
        else audio.addEventListener('loadedmetadata', beginPlayback, { once: true });
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

            // Keep preview audio tightly synced using offset formula identical to Student Player
            if (previewRangeRef.current.active && previewAudioRef.current) {
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

        const onEnded = () => {
            if (recording) stopRecording();
            if (previewRangeRef.current.active) stopSyncedPreview();
        };

        video.addEventListener('loadedmetadata', onLoadedMetadata);
        video.addEventListener('timeupdate', onTimeUpdate);
        video.addEventListener('ended', onEnded);
        return () => {
            video.removeEventListener('loadedmetadata', onLoadedMetadata);
            video.removeEventListener('timeupdate', onTimeUpdate);
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

    const recordingPct = Math.min(
        100,
        Math.max(0, ((videoTime - targetStart) / Math.max(1, targetDuration)) * 100)
    );

    const activeTeleprompterIdx = timedScenes.findIndex((s) => videoTime >= s._start && videoTime < s._end);
    const liveStudioCues = useMemo(() => buildTimedCues(timedScenes), [timedScenes]);
    const activeStudioCue = liveStudioCues.find((c) => videoTime >= c.start && videoTime <= c.end) || null;

    return (
        <div className="border-t border-[#E5E7EB] pt-4 space-y-4">
            {/* Header + 3-Way Voice-Over Mode Switch */}
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    <Mic className="w-4 h-4 text-[#C2410C]" />
                    <h4 className="text-xs font-bold text-[#1E293B]">
                        Voice-Over Mode / Boses ng Video (Mapa {mapNumber})
                    </h4>
                </div>
                <div className="inline-flex rounded-lg bg-[#F3F4F6] p-0.5 border border-[#E5E7EB]">
                    {[
                        { id: 'default', label: 'Default ng Video / Built-in' },
                        { id: 'whole', label: 'Buong Mapa / Whole' },
                        { id: 'per_scene', label: 'Bawat Eksena / Per-Scene' },
                    ].map((opt) => (
                        <button
                            key={opt.id}
                            type="button"
                            onClick={() => {
                                stopSyncedPreview();
                                if (recording) stopRecording();
                                onModeChange(opt.id);
                            }}
                            className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition cursor-pointer ${
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

            {/* Per-Scene Selector Pills (when in per_scene mode) */}
            {voiceoverMode === 'per_scene' && timedScenes.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                    {timedScenes.map((sc, i) => {
                        const hasAudio =
                            Boolean(sceneAudioFiles?.[i]) ||
                            (!removedSceneIndices?.includes(i) && Boolean(sc.audio_path));
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
                                        ? 'bg-[#1E293B] text-white border-[#1E293B]'
                                        : 'bg-white text-slate-700 border-[#E5E7EB] hover:border-slate-400'
                                }`}
                            >
                                <span
                                    className={`w-2 h-2 rounded-full ${
                                        hasAudio ? 'bg-emerald-500' : isSel ? 'bg-slate-400' : 'bg-slate-300'
                                    }`}
                                />
                                <span>Eksena {i + 1}</span>
                                <span className={`text-[10px] font-mono ${isSel ? 'text-slate-300' : 'text-slate-400'}`}>
                                    {formatClock(sc._start)}–{formatClock(sc._end)}
                                </span>
                            </button>
                        );
                    })}
                    <span className="text-[11px] text-slate-500 ml-auto">
                        Berdeng tuldok = may boses ng guro; bakante = boses ng video ang gagamitin.
                    </span>
                </div>
            )}

            {/* Main 2-Column Synced Dubbing Deck */}
            <div className="grid lg:grid-cols-12 gap-4 items-start">
                {/* LEFT COLUMN: 3D Video Monitor + Synced Record & Preview Controls */}
                <div className="lg:col-span-7 rounded-xl border border-[#E5E7EB] bg-[#FAFAFA] p-3.5 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[11px] font-bold text-slate-700 inline-flex items-center gap-1.5">
                            <Video className="w-3.5 h-3.5 text-[#C2410C]" />
                            <span>3D Story-Animation MP4</span>
                            {videoSrc && (
                                <span className="font-mono text-slate-400 font-normal">
                                    ({formatClock(videoTime)} / {formatClock(videoDuration)})
                                </span>
                            )}
                        </span>
                        <div className="flex items-center gap-2">
                            <label className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-[#E5E7EB] bg-white hover:bg-slate-50 text-[11px] font-semibold text-slate-700 cursor-pointer">
                                <Upload className="w-3 h-3" />
                                <span>{storyVideoFile ? storyVideoFile.name : 'Palitan MP4'}</span>
                                <input
                                    type="file"
                                    accept="video/mp4,video/webm"
                                    className="hidden"
                                    onChange={(e) => {
                                        const f = e.target.files?.[0];
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
                                <span>Preview: Boses ng Guro (Offset {currentOffset >= 0 ? `+${currentOffset}` : currentOffset}s)</span>
                            </div>
                        )}

                        {/* Live In-Video Subtitle Preview (same modern bottom-center style students see!) */}
                        {videoSrc && countdown === 0 && activeStudioCue && (
                            <div className="pointer-events-none absolute inset-x-3 bottom-11 z-10 flex justify-center">
                                <div className="max-w-[90%] rounded-md bg-black/78 px-3 py-1 text-center">
                                    <p className="text-[11px] sm:text-xs font-medium text-white leading-snug">
                                        {activeStudioCue.who && (
                                            <span className="font-bold text-amber-300 mr-1">
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
                                <span>Simula: {formatClock(targetStart)}</span>
                                <span>Kasalukuyan: {formatClock(videoTime)}</span>
                                <span>Dulo: {formatClock(targetEnd)}</span>
                            </div>
                        </div>
                    )}

                    {/* Recording / Preview / Upload Action Bar (shown in whole or per_scene mode) */}
                    {voiceoverMode !== 'default' && (
                        <div className="space-y-2.5 pt-1 border-t border-[#E5E7EB]">
                            <div className="flex flex-wrap items-center gap-2">
                                {!recording && countdown === 0 ? (
                                    <button
                                        type="button"
                                        onClick={startSyncedRecording}
                                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#C2410C] hover:bg-[#9A3412] text-white text-xs font-semibold transition cursor-pointer"
                                    >
                                        <Mic className="w-3.5 h-3.5" />
                                        <span>
                                            {videoSrc
                                                ? voiceoverMode === 'whole'
                                                    ? 'I-record Buong Mapa kasabay ng Video'
                                                    : `I-record Eksena ${selectedSceneIdx + 1} kasabay ng Video`
                                                : 'I-record ang Boses'}
                                        </span>
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={stopRecording}
                                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold transition cursor-pointer"
                                    >
                                        <Square className="w-3.5 h-3.5 fill-current" />
                                        <span>Ihinto ang Recording ({formatClock(recordSeconds)})</span>
                                    </button>
                                )}

                                {currentTargetAudio && videoSrc && !recording && countdown === 0 && (
                                    <button
                                        type="button"
                                        onClick={previewing ? stopSyncedPreview : startSyncedPreview}
                                        className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-semibold transition cursor-pointer ${
                                            previewing
                                                ? 'bg-slate-900 text-white border-slate-900'
                                                : 'bg-white text-[#1E293B] border-[#E5E7EB] hover:border-slate-400'
                                        }`}
                                    >
                                        {previewing ? (
                                            <>
                                                <Square className="w-3 h-3 fill-current" />
                                                <span>Ihinto Preview</span>
                                            </>
                                        ) : (
                                            <>
                                                <Play className="w-3.5 h-3.5 fill-current text-[#C2410C]" />
                                                <span>I-preview kasabay ng Video</span>
                                            </>
                                        )}
                                    </button>
                                )}

                                <label className="inline-flex items-center gap-1.5 px-2.5 py-2 rounded-lg border border-[#E5E7EB] bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer">
                                    <Upload className="w-3.5 h-3.5" />
                                    <span>Mag-upload Audio</span>
                                    <input
                                        type="file"
                                        accept="audio/mpeg,audio/mp3,audio/wav,audio/ogg,audio/mp4,audio/x-m4a,audio/webm"
                                        className="hidden"
                                        onChange={(e) => {
                                            const f = e.target.files?.[0];
                                            if (!f) return;
                                            if (voiceoverMode === 'whole') onWholeFileSelect(f);
                                            else onSceneAudioSelect(selectedSceneIdx, f);
                                        }}
                                    />
                                </label>

                                {currentTargetAudio && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            stopSyncedPreview();
                                            if (voiceoverMode === 'whole') onWholeRemove();
                                            else onSceneAudioRemove(selectedSceneIdx);
                                        }}
                                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600 hover:underline ml-auto cursor-pointer"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                        <span>Alisin Audio</span>
                                    </button>
                                )}
                            </div>

                            {micError && <p className="text-[11px] text-rose-600 font-medium">{micError}</p>}

                            {currentTargetAudio && (
                                <div className="rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 flex flex-wrap items-center justify-between gap-2">
                                    <span className="text-[11px] font-semibold text-emerald-700 truncate max-w-[200px]">
                                        {currentTargetAudio.label}
                                    </span>
                                    <audio controls src={currentTargetAudio.url} className="h-8 flex-1 min-w-[180px]" />
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
