import { useEffect, useRef, useState } from 'react';
import { Check, Mic, Pause, Play, RotateCcw, Save, Square, Upload, Volume2 } from 'lucide-react';
import { resolveMediaUrl } from '../../api/axiosClient';
import { teacherApi } from '../../api/teacherApi';
import { JUAN_INTRO_DEFAULTS, JUAN_OUTRO_DEFAULTS } from '../../utils/juanIntroDefaults';

function formatClock(sec) {
    const safe = Math.max(0, Math.floor(Number(sec) || 0));
    const m = Math.floor(safe / 60);
    const s = safe % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
}

function getSectionConfig(section) {
    if (section === 'outro') {
        return {
            defaults: JUAN_OUTRO_DEFAULTS,
            lessonKey: 'outro_voiceovers',
            audioField: 'outro_audios',
            textField: 'outro_texts',
            removeField: 'remove_outro_audios',
            filePrefix: 'juan-outro-step',
            heading: 'Outro ni Juan Osong',
            subtitle: 'Palitan ang boses at linya ni Juan pagkatapos matapos ng estudyante ang Mapa 5.',
            emptyVoiceLabel: 'Walang boses pa (Mag-record o mag-upload)',
            emptyBadge: 'Walang VO',
            revertTitle: 'Alisin ang boses ng guro',
        };
    }
    return {
        defaults: JUAN_INTRO_DEFAULTS,
        lessonKey: 'onboarding_voiceovers',
        audioField: 'onboarding_audios',
        textField: 'onboarding_texts',
        removeField: 'remove_onboarding_audios',
        filePrefix: 'juan-intro-step',
        heading: 'Intro ni Juan Osong',
        subtitle: 'Palitan ang boses at linya ni Juan sa 5 pagpapakilala pagkatapos ng 3D flyover.',
        emptyVoiceLabel: 'Default na boses ni Juan',
        emptyBadge: 'Default',
        revertTitle: 'Ibalik sa default na boses ni Juan',
    };
}

function buildInitialState(lesson, section) {
    const cfg = getSectionConfig(section);
    const saved = Array.isArray(lesson?.[cfg.lessonKey]) ? lesson[cfg.lessonKey] : [];
    return {
        texts: cfg.defaults.map((def, idx) => {
            const customText = saved[idx]?.text;
            return typeof customText === 'string' && customText.trim() !== '' ? customText : def.defaultText;
        }),
        pendingFiles: {},
        removedIndices: [],
        dirtyIndices: [],
    };
}

function pickRecorderMimeType() {
    if (typeof window === 'undefined' || typeof MediaRecorder === 'undefined') return '';
    const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
    return candidates.find((type) => MediaRecorder.isTypeSupported?.(type)) || '';
}

function isVideoUpload(file) {
    if (!file) return false;
    if (String(file.type || '').startsWith('video/')) return true;
    return /\.(mp4|mov|m4v|mkv|avi|3gp)$/i.test(String(file.name || ''));
}

export default function JuanIntroStudioPanel({ lesson, onSaved, onDirtyChange, notify }) {
    const [section, setSection] = useState('intro'); // 'intro' | 'outro'
    const [form, setForm] = useState(() => buildInitialState(lesson, 'intro'));
    const [savingTarget, setSavingTarget] = useState(null); // null | 'all' | number
    const [recordingIdx, setRecordingIdx] = useState(null);
    const [recordingSec, setRecordingSec] = useState(0);
    const [playingIdx, setPlayingIdx] = useState(null);
    const [playProgress, setPlayProgress] = useState({ current: 0, duration: 0 });
    const [micError, setMicError] = useState('');

    const fileInputRefs = useRef({});
    const mediaRecorderRef = useRef(null);
    const streamRef = useRef(null);
    const chunksRef = useRef([]);
    const recordTimerRef = useRef(null);
    const previewAudioRef = useRef(null);
    const previewBlobUrlRef = useRef(null);
    const previewReqRef = useRef(0);

    const cfg = getSectionConfig(section);
    const savedList = Array.isArray(lesson?.[cfg.lessonKey]) ? lesson[cfg.lessonKey] : [];

    const introSavedCount = Array.isArray(lesson?.onboarding_voiceovers)
        ? lesson.onboarding_voiceovers.filter((i) => i && i.audio_path).length
        : 0;
    const outroSavedCount = Array.isArray(lesson?.outro_voiceovers)
        ? lesson.outro_voiceovers.filter((i) => i && i.audio_path).length
        : 0;

    const dirtyStepIndices = Array.from(
        new Set([
            ...Object.keys(form.pendingFiles || {})
                .filter((k) => Boolean(form.pendingFiles[k]))
                .map(Number),
            ...(form.removedIndices || []),
            ...(form.dirtyIndices || []),
        ])
    );
    const dirty = dirtyStepIndices.length > 0;
    const saving = savingTarget !== null;

    const customVoiceCount = cfg.defaults.reduce((count, _, idx) => {
        const hasPending = Boolean(form.pendingFiles[idx]);
        const removed = form.removedIndices.includes(idx);
        const hasSaved = Boolean(savedList[idx]?.audio_path);
        return count + (hasPending || (hasSaved && !removed) ? 1 : 0);
    }, 0);

    useEffect(() => {
        onDirtyChange?.(dirty);
    }, [dirty, onDirtyChange]);

    useEffect(() => {
        if (!dirty) return undefined;
        const onBeforeUnload = (e) => {
            e.preventDefault();
            e.returnValue = '';
        };
        window.addEventListener('beforeunload', onBeforeUnload);
        return () => window.removeEventListener('beforeunload', onBeforeUnload);
    }, [dirty]);

    const stopPreview = () => {
        previewReqRef.current += 1;
        const el = previewAudioRef.current;
        previewAudioRef.current = null;
        if (el) {
            el.onended = null;
            el.onerror = null;
            el.ontimeupdate = null;
            el.onloadedmetadata = null;
            try {
                el.pause();
                el.removeAttribute('src');
                el.load();
            } catch {
                // ignore
            }
        }
        if (previewBlobUrlRef.current) {
            try {
                URL.revokeObjectURL(previewBlobUrlRef.current);
            } catch {
                // ignore
            }
            previewBlobUrlRef.current = null;
        }
        setPlayingIdx(null);
        setPlayProgress({ current: 0, duration: 0 });
    };

    const stopActiveRecordingTracks = () => {
        clearInterval(recordTimerRef.current);
        recordTimerRef.current = null;
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((t) => t.stop());
            streamRef.current = null;
        }
    };

    useEffect(() => {
        return () => {
            stopPreview();
            if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
                try {
                    mediaRecorderRef.current.stop();
                } catch {
                    // ignore
                }
            }
            stopActiveRecordingTracks();
        };
    }, []);

    const handleSwitchSection = (nextSection) => {
        if (nextSection === section || saving || recordingIdx !== null) return;
        if (dirty) {
            const ok = window.confirm(
                'May hindi ka pa na-save na recording o pagbabago sa bahaging ito. Mawawala ito kung lilipat ka nang hindi nagse-save. Magpatuloy pa rin?'
            );
            if (!ok) return;
        }
        stopPreview();
        setMicError('');
        setSection(nextSection);
        setForm(buildInitialState(lesson, nextSection));
    };

    const handleStartRecording = async (idx) => {
        setMicError('');
        stopPreview();

        if (recordingIdx !== null) {
            handleStopRecording();
            if (recordingIdx === idx) return;
        }

        if (!navigator?.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
            setMicError('Hindi suportado ang live mic recording sa browser na ito. Gamitin ang "Mag-upload".');
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;
            chunksRef.current = [];
            const mimeType = pickRecorderMimeType();
            const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
            mediaRecorderRef.current = recorder;

            const activePrefix = cfg.filePrefix;

            recorder.ondataavailable = (ev) => {
                if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
            };

            recorder.onstop = () => {
                const rawMime = recorder.mimeType || mimeType || 'audio/webm';
                const cleanMime = rawMime.split(';')[0] || 'audio/webm';
                const ext = cleanMime.includes('mp4') ? 'm4a' : cleanMime.includes('ogg') ? 'ogg' : 'webm';
                const blob = new Blob(chunksRef.current, { type: cleanMime });
                chunksRef.current = [];
                stopActiveRecordingTracks();
                setRecordingIdx(null);
                setRecordingSec(0);

                if (blob.size < 400) {
                    setMicError('Masyadong maikli ang recording. Subukan ulit at magsalita malapit sa mic.');
                    return;
                }

                const file = new File([blob], `${activePrefix}-${idx + 1}.${ext}`, { type: cleanMime });
                setForm((prev) => ({
                    ...prev,
                    pendingFiles: { ...prev.pendingFiles, [idx]: file },
                    removedIndices: prev.removedIndices.filter((n) => n !== idx),
                    dirtyIndices: prev.dirtyIndices.includes(idx) ? prev.dirtyIndices : [...prev.dirtyIndices, idx],
                }));
            };

            recorder.start();
            setRecordingIdx(idx);
            setRecordingSec(0);
            const startedAt = Date.now();
            recordTimerRef.current = setInterval(() => {
                setRecordingSec(Math.floor((Date.now() - startedAt) / 1000));
            }, 250);
        } catch {
            stopActiveRecordingTracks();
            setRecordingIdx(null);
            setMicError('Hindi nabuksan ang mikropono. Tiyaking naka-allow ang microphone permission sa browser.');
        }
    };

    const handleStopRecording = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            try {
                mediaRecorderRef.current.stop();
            } catch {
                stopActiveRecordingTracks();
                setRecordingIdx(null);
                setRecordingSec(0);
            }
        } else {
            stopActiveRecordingTracks();
            setRecordingIdx(null);
            setRecordingSec(0);
        }
    };

    const handleFilePicked = (idx, file) => {
        if (!file) return;
        setMicError('');
        stopPreview();
        setForm((prev) => ({
            ...prev,
            pendingFiles: { ...prev.pendingFiles, [idx]: file },
            removedIndices: prev.removedIndices.filter((n) => n !== idx),
            dirtyIndices: prev.dirtyIndices.includes(idx) ? prev.dirtyIndices : [...prev.dirtyIndices, idx],
        }));
    };

    const handleRevertAudio = (idx) => {
        if (playingIdx === idx) stopPreview();
        setForm((prev) => {
            const nextPending = { ...prev.pendingFiles };
            delete nextPending[idx];
            const hadSaved = Boolean(savedList[idx]?.audio_path);
            const nextRemoved =
                hadSaved && !prev.removedIndices.includes(idx)
                    ? [...prev.removedIndices, idx]
                    : prev.removedIndices;
            const nextDirty = hadSaved
                ? prev.dirtyIndices.includes(idx)
                    ? prev.dirtyIndices
                    : [...prev.dirtyIndices, idx]
                : prev.dirtyIndices.filter(
                      (n) => n !== idx || prev.texts[idx].trim() !== cfg.defaults[idx].defaultText
                  );
            return {
                ...prev,
                pendingFiles: nextPending,
                removedIndices: nextRemoved,
                dirtyIndices: nextDirty,
            };
        });
    };

    const handleTextChange = (idx, nextVal) => {
        setForm((prev) => {
            const nextTexts = [...prev.texts];
            nextTexts[idx] = nextVal;
            return {
                ...prev,
                texts: nextTexts,
                dirtyIndices: prev.dirtyIndices.includes(idx) ? prev.dirtyIndices : [...prev.dirtyIndices, idx],
            };
        });
    };

    const handleResetText = (idx) => {
        handleTextChange(idx, cfg.defaults[idx].defaultText);
    };

    const handleTogglePreview = (idx) => {
        if (playingIdx === idx) {
            stopPreview();
            return;
        }
        stopPreview();

        const pendingFile = form.pendingFiles[idx];
        const isRemoved = form.removedIndices.includes(idx);
        const savedPath = !isRemoved ? savedList[idx]?.audio_path : null;
        const defaultAudio = cfg.defaults[idx].defaultAudio;

        let src = defaultAudio;
        if (pendingFile) {
            const blobUrl = URL.createObjectURL(pendingFile);
            previewBlobUrlRef.current = blobUrl;
            src = blobUrl;
        } else if (savedPath) {
            src = resolveMediaUrl(savedPath);
        }

        if (!src) return;

        const reqId = ++previewReqRef.current;
        const el = isVideoUpload(pendingFile) ? document.createElement('video') : new Audio();
        if (el.tagName === 'VIDEO') {
            el.playsInline = true;
            el.setAttribute('playsinline', '');
        }
        el.preload = 'auto';
        el.src = src;

        el.onloadedmetadata = () => {
            if (previewReqRef.current !== reqId) return;
            const dur = Number.isFinite(el.duration) ? el.duration : 0;
            setPlayProgress((prev) => ({ ...prev, duration: dur }));
        };

        el.ontimeupdate = () => {
            if (previewReqRef.current !== reqId) return;
            const dur = Number.isFinite(el.duration) ? el.duration : 0;
            setPlayProgress({ current: el.currentTime || 0, duration: dur });
        };

        el.onended = () => {
            if (previewReqRef.current !== reqId) return;
            stopPreview();
        };

        el.onerror = () => {
            if (previewReqRef.current !== reqId || previewAudioRef.current !== el) return;
            stopPreview();
            notify('Hindi ma-play ang audio file na ito. Subukan ang MP3, WAV, M4A, o mag-record ulit.', 'error', 'Preview Error.');
        };

        previewAudioRef.current = el;
        setPlayingIdx(idx);
        setPlayProgress({ current: 0, duration: 0 });

        const playPromise = el.play();
        if (playPromise && typeof playPromise.catch === 'function') {
            playPromise.catch((err) => {
                if (previewReqRef.current !== reqId) return;
                if (err?.name === 'AbortError') return;
                stopPreview();
                notify('Hindi ma-play ang audio preview. Pakisubukan muli.', 'error', 'Preview Error.');
            });
        }
    };

    const buildLessonFormData = (stepFilterIdx = null) => {
        const fd = new FormData();
        fd.append('title', lesson.title || 'Si Juan Osong');
        if (lesson.description) fd.append('description', lesson.description);
        fd.append('video_source_type', lesson.video_source_type || 'placeholder');
        if (lesson.youtube_url) fd.append('youtube_url', lesson.youtube_url);

        const textsPayload = cfg.defaults.map((def, idx) => {
            if (stepFilterIdx !== null && idx !== stepFilterIdx) {
                return savedList[idx]?.text ?? '';
            }
            const raw = String(form.texts[idx] ?? '').trim();
            return raw === def.defaultText ? '' : raw;
        });
        fd.append(cfg.textField, JSON.stringify(textsPayload));

        if (stepFilterIdx !== null) {
            if (form.pendingFiles[stepFilterIdx]) {
                fd.append(`${cfg.audioField}[${stepFilterIdx}]`, form.pendingFiles[stepFilterIdx]);
            }
            if (form.removedIndices.includes(stepFilterIdx)) {
                fd.append(cfg.removeField, JSON.stringify([stepFilterIdx]));
            }
        } else {
            Object.entries(form.pendingFiles || {}).forEach(([idx, file]) => {
                if (file) fd.append(`${cfg.audioField}[${idx}]`, file);
            });
            if (form.removedIndices.length > 0) {
                fd.append(cfg.removeField, JSON.stringify(form.removedIndices));
            }
        }
        return fd;
    };

    const handleSaveStep = async (idx) => {
        if (saving || recordingIdx !== null) return;
        setSavingTarget(idx);
        try {
            const fd = buildLessonFormData(idx);
            const res = await teacherApi.updateLesson(lesson.id, fd);
            const updatedLesson = res?.lesson || lesson;

            setForm((prev) => {
                const nextPending = { ...prev.pendingFiles };
                delete nextPending[idx];
                return {
                    ...prev,
                    pendingFiles: nextPending,
                    removedIndices: prev.removedIndices.filter((n) => n !== idx),
                    dirtyIndices: prev.dirtyIndices.filter((n) => n !== idx),
                };
            });

            notify(
                `Na-save na ang Step ${idx + 1} (${cfg.defaults[idx].subtitle}).`,
                'success',
                `Na-save ang Step ${idx + 1}`
            );
            onSaved?.(updatedLesson);
        } catch (err) {
            const firstErr = err?.response?.data?.errors
                ? Object.values(err.response.data.errors).flat()[0]
                : null;
            notify(
                firstErr || err?.response?.data?.message || `Hindi na-save ang Step ${idx + 1}.`,
                'error',
                'May Error.'
            );
        } finally {
            setSavingTarget(null);
        }
    };

    const handleSaveAll = async (e) => {
        if (e) e.preventDefault();
        if (saving || recordingIdx !== null) return;
        setSavingTarget('all');
        try {
            const fd = buildLessonFormData(null);
            const res = await teacherApi.updateLesson(lesson.id, fd);
            const updatedLesson = res?.lesson || lesson;

            setForm(buildInitialState(updatedLesson, section));
            notify(
                `Na-save na ang lahat ng boses at linya para sa ${cfg.heading}.`,
                'success',
                'Na-save.'
            );
            onSaved?.(updatedLesson);
        } catch (err) {
            const firstErr = err?.response?.data?.errors
                ? Object.values(err.response.data.errors).flat()[0]
                : null;
            notify(
                firstErr || err?.response?.data?.message || `Hindi na-save ang ${cfg.heading}.`,
                'error',
                'May Error.'
            );
        } finally {
            setSavingTarget(null);
        }
    };

    return (
        <form
            onSubmit={handleSaveAll}
            className="border border-slate-200/90 rounded-2xl p-4 sm:p-5 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] space-y-4"
        >
            {/* Segmented Intro / Outro Switcher */}
            <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-slate-100/90 border border-slate-200/70">
                <button
                    type="button"
                    disabled={saving || recordingIdx !== null}
                    onClick={() => handleSwitchSection('intro')}
                    className={`h-9 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50 ${
                        section === 'intro'
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                    }`}
                >
                    <span>Intro (5 Steps)</span>
                    <span
                        className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold tabular-nums ${
                            section === 'intro'
                                ? 'bg-orange-100 text-[#C2410C]'
                                : 'bg-slate-200/80 text-slate-600'
                        }`}
                    >
                        {introSavedCount}/5
                    </span>
                </button>

                <button
                    type="button"
                    disabled={saving || recordingIdx !== null}
                    onClick={() => handleSwitchSection('outro')}
                    className={`h-9 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50 ${
                        section === 'outro'
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                    }`}
                >
                    <span>Outro (4 Steps)</span>
                    <span
                        className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold tabular-nums ${
                            section === 'outro'
                                ? 'bg-orange-100 text-[#C2410C]'
                                : 'bg-slate-200/80 text-slate-600'
                        }`}
                    >
                        {outroSavedCount}/4
                    </span>
                </button>
            </div>

            {/* Clean Studio Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
                <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-[15px] font-bold text-slate-900 tracking-tight">
                            {cfg.heading}
                        </h2>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-50 border border-orange-200/80 text-[#C2410C] text-[11px] font-semibold">
                            <Volume2 className="w-3 h-3" />
                            {customVoiceCount > 0
                                ? `${customVoiceCount}/${cfg.defaults.length} Boses ng Guro`
                                : cfg.emptyBadge}
                        </span>
                        {dirty ? (
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-[11px] font-semibold">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                {dirtyStepIndices.length} di pa saved
                            </span>
                        ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-semibold">
                                <Check className="w-3 h-3" />
                                Naka-save
                            </span>
                        )}
                    </div>
                    <p className="text-xs text-slate-500 leading-relaxed">{cfg.subtitle}</p>
                </div>

                <button
                    type="submit"
                    disabled={saving || recordingIdx !== null}
                    className={`w-full sm:w-auto h-10 sm:h-9 inline-flex items-center justify-center gap-1.5 px-4 rounded-xl sm:rounded-lg text-white text-xs font-semibold transition cursor-pointer disabled:opacity-55 shrink-0 ${
                        dirty ? 'bg-[#C2410C] hover:bg-[#9A3412] shadow-xs' : 'bg-slate-900 hover:bg-slate-800'
                    }`}
                >
                    <Save className="w-3.5 h-3.5" />
                    <span>{savingTarget === 'all' ? 'Sine-save Lahat...' : 'I-save Lahat'}</span>
                </button>
            </div>

            {micError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-700">
                    {micError}
                </div>
            )}

            {/* Clean Structured Step Voice-Over Cards (1-col mobile, 2-col xl desktop) */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3.5">
                {cfg.defaults.map((def, idx) => {
                    const pendingFile = form.pendingFiles[idx] || null;
                    const isRemoved = form.removedIndices.includes(idx);
                    const savedAudioPath = !isRemoved ? savedList[idx]?.audio_path || null : null;
                    const hasCustomAudio = Boolean(pendingFile || savedAudioPath);
                    const hasPlayableAudio = hasCustomAudio || Boolean(def.defaultAudio);
                    const isStepDirty = dirtyStepIndices.includes(idx);
                    const isRecordingThis = recordingIdx === idx;
                    const isPlayingThis = playingIdx === idx;
                    const isTextEdited = form.texts[idx].trim() !== def.defaultText;
                    const progressPct =
                        isPlayingThis && playProgress.duration > 0
                            ? Math.min(100, (playProgress.current / playProgress.duration) * 100)
                            : 0;
                    const rowCount = def.defaultText.length > 135 ? 4 : 3;

                    const activeTrackLabel = pendingFile
                        ? `Bagong recording (${pendingFile.name})`
                        : savedAudioPath
                          ? 'Boses ng Guro (Aktibo)'
                          : cfg.emptyVoiceLabel;

                    return (
                        <div
                            key={`${section}-${def.id}`}
                            className={`rounded-2xl border p-4 flex flex-col justify-between gap-3.5 transition ${
                                isRecordingThis
                                    ? 'border-rose-300 bg-rose-50/40 ring-2 ring-rose-100'
                                    : isStepDirty
                                      ? 'border-amber-200 bg-amber-50/20'
                                      : 'border-slate-200/90 bg-white'
                            }`}
                        >
                            <div className="space-y-3">
                                {/* 1. Clean Single-Line Card Header */}
                                <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <span className="w-7 h-7 rounded-lg bg-[#C2410C] text-white text-xs font-extrabold inline-flex items-center justify-center shrink-0 tabular-nums">
                                            {def.id}
                                        </span>
                                        <h3 className="text-[13.5px] font-bold text-slate-900 truncate">
                                            {def.subtitle}
                                        </h3>
                                    </div>

                                    {pendingFile ? (
                                        <span className="shrink-0 px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10.5px] font-bold">
                                            Di pa saved
                                        </span>
                                    ) : savedAudioPath ? (
                                        <span className="shrink-0 px-2.5 py-0.5 rounded-full bg-orange-100 text-[#C2410C] text-[10.5px] font-bold">
                                            Boses ng Guro
                                        </span>
                                    ) : (
                                        <span className="shrink-0 px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-500 text-[10.5px] font-semibold">
                                            {cfg.emptyBadge}
                                        </span>
                                    )}
                                </div>

                                {/* 2. Readable Script Textarea */}
                                <div className="space-y-1.5">
                                    <div className="flex items-center justify-between gap-2">
                                        <label
                                            htmlFor={`juan-vo-script-${section}-${idx}`}
                                            className="text-[11px] font-semibold text-slate-500"
                                        >
                                            Linya / Subtitle ni Juan
                                        </label>
                                        {isTextEdited && (
                                            <button
                                                type="button"
                                                onClick={() => handleResetText(idx)}
                                                className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#C2410C] hover:underline cursor-pointer"
                                            >
                                                <RotateCcw className="w-3 h-3" />
                                                <span>Ibalik default</span>
                                            </button>
                                        )}
                                    </div>
                                    <textarea
                                        id={`juan-vo-script-${section}-${idx}`}
                                        rows={rowCount}
                                        maxLength={400}
                                        value={form.texts[idx]}
                                        onChange={(e) => handleTextChange(idx, e.target.value)}
                                        className="w-full rounded-xl border border-slate-200 bg-[#FAF8F5]/70 focus:bg-white px-3 py-2.5 text-[13px] text-slate-800 leading-relaxed focus:border-[#C2410C] focus:ring-2 focus:ring-orange-100 outline-none resize-none transition"
                                    />
                                </div>

                                {/* 3. Unified Inline Audio Player Dock */}
                                <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 px-3 py-2.5 flex items-center gap-3">
                                    <button
                                        type="button"
                                        disabled={recordingIdx !== null || !hasPlayableAudio}
                                        onClick={() => handleTogglePreview(idx)}
                                        aria-label={isPlayingThis ? 'Ihinto ang preview' : 'Pakinggan ang boses'}
                                        className={`w-9 h-9 rounded-full inline-flex items-center justify-center shrink-0 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 ${
                                            isPlayingThis
                                                ? 'bg-[#C2410C] text-white shadow-xs'
                                                : 'bg-white border border-slate-200 text-slate-800 hover:border-[#C2410C] hover:text-[#C2410C]'
                                        }`}
                                    >
                                        {isPlayingThis ? (
                                            <Pause className="w-4 h-4 fill-current" />
                                        ) : (
                                            <Play className="w-4 h-4 fill-current ml-0.5" />
                                        )}
                                    </button>

                                    <div className="flex-1 min-w-0 space-y-1.5">
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="text-[11.5px] font-semibold text-slate-700 truncate">
                                                {isRecordingThis ? 'Nagre-record ng boses...' : activeTrackLabel}
                                            </span>
                                            <span className="text-[10.5px] font-mono font-semibold text-slate-400 tabular-nums shrink-0">
                                                {isRecordingThis
                                                    ? formatClock(recordingSec)
                                                    : isPlayingThis && playProgress.duration > 0
                                                      ? `${formatClock(playProgress.current)} / ${formatClock(playProgress.duration)}`
                                                      : isPlayingThis
                                                        ? formatClock(playProgress.current)
                                                        : hasPlayableAudio
                                                          ? 'Preview'
                                                          : 'Tahimik'}
                                            </span>
                                        </div>
                                        <div className="h-1.5 w-full rounded-full bg-slate-200/90 overflow-hidden">
                                            <div
                                                className={`h-full rounded-full transition-all duration-150 ${
                                                    isRecordingThis
                                                        ? 'bg-rose-500 animate-pulse w-full'
                                                        : isPlayingThis && playProgress.duration <= 0
                                                          ? 'bg-[#C2410C] animate-pulse w-2/3'
                                                          : 'bg-[#C2410C]'
                                                }`}
                                                style={
                                                    isRecordingThis || (isPlayingThis && playProgress.duration <= 0)
                                                        ? undefined
                                                        : { width: `${progressPct}%` }
                                                }
                                            />
                                        </div>
                                    </div>

                                    {hasCustomAudio && !isRecordingThis && (
                                        <button
                                            type="button"
                                            disabled={saving || recordingIdx !== null}
                                            onClick={() => handleRevertAudio(idx)}
                                            aria-label={cfg.revertTitle}
                                            title={cfg.revertTitle}
                                            className="w-8 h-8 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 inline-flex items-center justify-center shrink-0 transition cursor-pointer disabled:opacity-45"
                                        >
                                            <RotateCcw className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* 4. Symmetric 50/50 Action Grid + Clean Full-Width Save Bar */}
                            <div className="space-y-2 pt-0.5">
                                <input
                                    ref={(el) => {
                                        fileInputRefs.current[idx] = el;
                                    }}
                                    type="file"
                                    accept="audio/*,.mp3,.wav,.m4a,.ogg,.webm,.mp4,.mov"
                                    className="hidden"
                                    onChange={(e) => {
                                        const f = e.target.files?.[0];
                                        if (f) handleFilePicked(idx, f);
                                        e.target.value = '';
                                    }}
                                />

                                {isRecordingThis ? (
                                    <button
                                        type="button"
                                        onClick={handleStopRecording}
                                        className="w-full h-10 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 active:scale-[0.99] text-white text-xs font-bold inline-flex items-center justify-center gap-2 transition cursor-pointer"
                                    >
                                        <Square className="w-3.5 h-3.5 fill-current" />
                                        <span className="tabular-nums">
                                            Ihinto ang Recording ({formatClock(recordingSec)})
                                        </span>
                                    </button>
                                ) : (
                                    <div className="grid grid-cols-2 gap-2">
                                        <button
                                            type="button"
                                            disabled={saving || recordingIdx !== null}
                                            onClick={() => handleStartRecording(idx)}
                                            className="h-10 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 active:scale-[0.99] text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-45"
                                        >
                                            <Mic className="w-3.5 h-3.5 shrink-0" />
                                            <span>{hasCustomAudio ? 'I-record Ulit' : 'I-record'}</span>
                                        </button>

                                        <button
                                            type="button"
                                            disabled={saving || recordingIdx !== null}
                                            onClick={() => fileInputRefs.current[idx]?.click()}
                                            className="h-10 px-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 active:scale-[0.99] text-slate-700 text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-45"
                                        >
                                            <Upload className="w-3.5 h-3.5 shrink-0" />
                                            <span>Mag-upload</span>
                                        </button>
                                    </div>
                                )}

                                {isStepDirty && !isRecordingThis && (
                                    <button
                                        type="button"
                                        disabled={saving || recordingIdx !== null}
                                        onClick={() => handleSaveStep(idx)}
                                        className="w-full h-10 px-4 rounded-xl bg-[#C2410C] hover:bg-[#9A3412] active:scale-[0.99] text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 shadow-xs transition cursor-pointer disabled:opacity-50"
                                    >
                                        <Save className="w-3.5 h-3.5" />
                                        <span>{savingTarget === idx ? 'Sine-save...' : `I-save ang Step ${def.id}`}</span>
                                    </button>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </form>
    );
}
