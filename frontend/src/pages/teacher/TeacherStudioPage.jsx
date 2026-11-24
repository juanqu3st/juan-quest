import { useEffect, useState } from 'react';
import { Check, Save } from 'lucide-react';
import { teacherApi } from '../../api/teacherApi';
import { useToast } from '../../context/ToastContext';
import SyncedDubbingStudio from '../../components/teacher/SyncedDubbingStudio';
import TeacherLayout from './TeacherLayout';

const VOICEOVER_TAG = {
    default: 'Default',
    whole: 'Whole',
    per_scene: 'Per-Scene',
};

function buildInitialForm(map) {
    return {
        scene_script: Array.isArray(map.scene_script) ? map.scene_script : [],
        voiceover_mode: map.voiceover_mode || 'default',
        whole_voiceover_offset_sec: Number(map.whole_voiceover_offset_sec || 0),
        story_video: null,
        whole_voiceover: null,
        scene_audios: {},
        remove_story_video: false,
        remove_whole_voiceover: false,
        remove_scene_audios: [],
    };
}

export default function TeacherStudioPage() {
    const { showToast } = useToast();
    const [lesson, setLesson] = useState(null);
    const [selectedMapNum, setSelectedMapNum] = useState(1);
    const [hasUnsaved, setHasUnsaved] = useState(false);

    const loadCms = async () => {
        const res = await teacherApi.getCms();
        if (res.lesson) setLesson(res.lesson);
    };

    useEffect(() => {
        loadCms();
    }, []);

    const notify = (msg, type = 'success', title = 'Na-save.') => {
        showToast(type, msg, title);
    };

    const handleMapSaved = (updatedMap) => {
        if (updatedMap) {
            setLesson((prev) =>
                prev
                    ? {
                          ...prev,
                          maps: prev.maps.map((m) => (m.id === updatedMap.id ? { ...m, ...updatedMap } : m)),
                      }
                    : prev
            );
        }
        loadCms().catch(() => {});
    };

    const handleSelectMap = (mapNum) => {
        if (mapNum === selectedMapNum) return;
        if (hasUnsaved) {
            const ok = window.confirm(
                'May hindi ka pa na-save na recording o pagbabago sa mapang ito. Mawawala ito kung lilipat ka nang hindi nagse-save. Magpatuloy pa rin?'
            );
            if (!ok) return;
        }
        setHasUnsaved(false);
        setSelectedMapNum(mapNum);
    };

    const activeMap = lesson?.maps?.find((m) => m.map_number === selectedMapNum) || lesson?.maps?.[0];

    return (
        <TeacherLayout
            title="Video & Voice-Over Studio"
            subtitle="Palitan ang 3D story video, i-edit ang script/subtitles, o mag-record at mag-upload ng boses bawat eksena."
        >
            {!lesson ? (
                <div className="text-xs text-slate-500 py-12 text-center">Inihahanda ang Video &amp; Voice-Over Studio...</div>
            ) : (
                <div className="space-y-4">
                    {/* Single-row 5-map selector on desktop, responsive grid on mobile/tablet */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                        {lesson.maps.map((m) => {
                            const isSel = selectedMapNum === m.map_number;
                            return (
                                <button
                                    key={m.id}
                                    type="button"
                                    onClick={() => handleSelectMap(m.map_number)}
                                    className={`min-h-[42px] px-3 py-2 rounded-xl text-left border transition cursor-pointer flex items-center justify-between gap-2 ${
                                        isSel
                                            ? 'bg-[#C2410C] text-white border-[#C2410C] shadow-xs'
                                            : 'bg-white text-slate-700 border-slate-200/90 hover:bg-slate-50 hover:text-slate-900'
                                    }`}
                                >
                                    <span className="text-xs font-semibold truncate">
                                        Mapa {m.map_number}: {m.title}
                                    </span>
                                    <span
                                        className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded-md font-semibold ${
                                            isSel ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
                                        }`}
                                    >
                                        {VOICEOVER_TAG[m.voiceover_mode || 'default']}
                                    </span>
                                </button>
                            );
                        })}
                    </div>

                    {activeMap && (
                        <MapStudioPanel
                            key={activeMap.id}
                            map={activeMap}
                            onSaved={handleMapSaved}
                            onDirtyChange={setHasUnsaved}
                            notify={notify}
                        />
                    )}
                </div>
            )}
        </TeacherLayout>
    );
}

function MapStudioPanel({ map, onSaved, onDirtyChange, notify }) {
    const [savingTarget, setSavingTarget] = useState(null); // null | 'all' | number (sceneIdx)
    const [form, setForm] = useState(() => buildInitialForm(map));
    const [dirtyScenes, setDirtyScenes] = useState([]);
    const [dirtyMeta, setDirtyMeta] = useState(false);

    const pendingSceneIndices = Array.from(
        new Set([
            ...Object.keys(form.scene_audios || {})
                .filter((k) => Boolean(form.scene_audios[k]))
                .map(Number),
            ...(form.remove_scene_audios || []),
            ...dirtyScenes,
        ])
    );

    const hasMapLevelPending =
        dirtyMeta ||
        Boolean(form.story_video) ||
        form.remove_story_video ||
        Boolean(form.whole_voiceover) ||
        form.remove_whole_voiceover;

    const dirty = hasMapLevelPending || pendingSceneIndices.length > 0;
    const saving = savingTarget !== null;

    useEffect(() => {
        onDirtyChange?.(dirty);
    }, [dirty, onDirtyChange]);

    // Warn before closing/reloading browser tab if recordings haven't been uploaded yet
    useEffect(() => {
        if (!dirty) return undefined;
        const onBeforeUnload = (e) => {
            e.preventDefault();
            e.returnValue = '';
        };
        window.addEventListener('beforeunload', onBeforeUnload);
        return () => window.removeEventListener('beforeunload', onBeforeUnload);
    }, [dirty]);

    const markSceneDirty = (idx) => {
        setDirtyScenes((prev) => (prev.includes(idx) ? prev : [...prev, idx]));
    };

    const buildBaseFormData = (currentForm) => {
        const fd = new FormData();
        fd.append('title', map.title);
        fd.append('strategy_label', map.strategy_label);
        fd.append('pokus_na_kasanayan', map.pokus_na_kasanayan);
        fd.append('panuto', map.panuto);
        fd.append('youtube_start_sec', String(map.youtube_start_sec ?? 0));
        fd.append('youtube_end_sec', String(map.youtube_end_sec ?? 50));
        fd.append('max_hearts', String(map.max_hearts ?? 3));
        fd.append('time_limit_seconds', String(map.time_limit_seconds ?? 60));
        fd.append('allow_user_time_choice', '0');
        fd.append('feedback_correct', map.feedback_correct);
        fd.append('feedback_wrong', map.feedback_wrong);
        fd.append('scene_script', JSON.stringify(currentForm.scene_script));
        fd.append('voiceover_mode', currentForm.voiceover_mode || 'default');
        fd.append('whole_voiceover_offset_sec', String(currentForm.whole_voiceover_offset_sec ?? 0));
        return fd;
    };

    // Save strictly ONE scene (audio upload/removal + script/timing) while preserving other scenes' pending files!
    const handleSaveScene = async (sceneIdx) => {
        if (saving) return;
        setSavingTarget(sceneIdx);
        try {
            const fd = buildBaseFormData(form);
            const sceneFile = form.scene_audios?.[sceneIdx] || null;
            const shouldRemoveScene = (form.remove_scene_audios || []).includes(sceneIdx);

            if (sceneFile) fd.append(`scene_audios[${sceneIdx}]`, sceneFile);
            if (shouldRemoveScene) fd.append('remove_scene_audios', JSON.stringify([sceneIdx]));
            if (form.story_video) fd.append('story_video', form.story_video);
            if (form.remove_story_video) fd.append('remove_story_video', '1');

            const res = await teacherApi.updateMap(map.id, fd);
            const savedMap = res?.map || map;

            setForm((prev) => {
                const nextAudios = { ...prev.scene_audios };
                delete nextAudios[sceneIdx];
                return {
                    ...prev,
                    scene_script: Array.isArray(savedMap.scene_script) ? savedMap.scene_script : prev.scene_script,
                    voiceover_mode: savedMap.voiceover_mode || prev.voiceover_mode,
                    whole_voiceover_offset_sec: Number(
                        savedMap.whole_voiceover_offset_sec ?? prev.whole_voiceover_offset_sec ?? 0
                    ),
                    story_video: null,
                    remove_story_video: false,
                    scene_audios: nextAudios,
                    remove_scene_audios: (prev.remove_scene_audios || []).filter((i) => i !== sceneIdx),
                };
            });
            setDirtyScenes((prev) => prev.filter((i) => i !== sceneIdx));
            setDirtyMeta(false);

            notify(
                `Na-save na ang Eksena ${sceneIdx + 1} ng Mapa ${map.map_number}.`,
                'success',
                `Na-save — Eksena ${sceneIdx + 1}`
            );
            onSaved(savedMap);
        } catch (err) {
            const firstFieldErr = err?.response?.data?.errors
                ? Object.values(err.response.data.errors).flat()[0]
                : null;
            notify(
                firstFieldErr || err?.response?.data?.message || `Hindi na-save ang Eksena ${sceneIdx + 1}.`,
                'error',
                'May Error.'
            );
        } finally {
            setSavingTarget(null);
        }
    };

    // Save entire map (used in Default/Whole mode, or "I-save Lahat" when multiple scenes have pending uploads)
    const handleSaveAll = async (e) => {
        if (e) e.preventDefault();
        if (saving) return;
        setSavingTarget('all');
        try {
            const fd = buildBaseFormData(form);
            if (form.story_video) fd.append('story_video', form.story_video);
            if (form.whole_voiceover) fd.append('whole_voiceover', form.whole_voiceover);
            if (form.remove_story_video) fd.append('remove_story_video', '1');
            if (form.remove_whole_voiceover) fd.append('remove_whole_voiceover', '1');
            if (form.remove_scene_audios.length > 0) {
                fd.append('remove_scene_audios', JSON.stringify(form.remove_scene_audios));
            }
            Object.entries(form.scene_audios || {}).forEach(([idx, file]) => {
                if (file) fd.append(`scene_audios[${idx}]`, file);
            });

            const res = await teacherApi.updateMap(map.id, fd);
            const savedMap = res?.map || map;

            setForm(buildInitialForm(savedMap));
            setDirtyScenes([]);
            setDirtyMeta(false);

            notify(
                `Na-save na ang lahat ng pagbabago sa Mapa ${map.map_number}.`,
                'success',
                'Na-save.'
            );
            onSaved(savedMap);
        } catch (err) {
            const firstFieldErr = err?.response?.data?.errors
                ? Object.values(err.response.data.errors).flat()[0]
                : null;
            notify(
                firstFieldErr || err?.response?.data?.message || 'Hindi na-save ang Video & Voice-Over Studio.',
                'error',
                'May Error.'
            );
        } finally {
            setSavingTarget(null);
        }
    };

    const isPerScene = form.voiceover_mode === 'per_scene';

    return (
        <form
            onSubmit={handleSaveAll}
            className="border border-slate-200/90 rounded-2xl p-4 sm:p-5 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] space-y-4"
        >
            {/* Clean Compact Map Studio Header */}
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-sm font-bold text-slate-900">
                            Mapa {map.map_number}: {map.title}
                        </h2>
                        {dirty ? (
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-[11px] font-semibold">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                {isPerScene && pendingSceneIndices.length > 0
                                    ? `${pendingSceneIndices.length} eksena ang di pa na-save`
                                    : 'May di pa na-save'}
                            </span>
                        ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-semibold">
                                <Check className="w-3 h-3" />
                                Naka-save
                            </span>
                        )}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                        {isPerScene
                            ? 'I-save bawat eksena gamit ang "I-save Eksena" button sa ibaba ng video.'
                            : 'Ang anumang pagbabago sa video, script, o boses ay agad makikita ng mga estudyante pagkatapos i-save.'}
                    </p>
                </div>

                {/* Top Save button: Primary in Default/Whole mode; subtle "I-save Lahat" in Per-Scene only when needed */}
                {!isPerScene ? (
                    <button
                        type="submit"
                        disabled={saving}
                        className={`h-9 inline-flex items-center gap-1.5 px-4 rounded-lg text-white text-xs font-semibold transition cursor-pointer disabled:opacity-60 ${
                            dirty ? 'bg-[#C2410C] hover:bg-[#9A3412] shadow-xs' : 'bg-slate-900 hover:bg-slate-800'
                        }`}
                    >
                        <Save className="w-3.5 h-3.5" />
                        <span>{savingTarget === 'all' ? 'Sine-save...' : 'I-save ang Mapa'}</span>
                    </button>
                ) : (
                    (pendingSceneIndices.length > 1 || hasMapLevelPending) && (
                        <button
                            type="submit"
                            disabled={saving}
                            className="h-8 inline-flex items-center gap-1.5 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition cursor-pointer disabled:opacity-60"
                        >
                            <Save className="w-3.5 h-3.5 text-[#C2410C]" />
                            <span>{savingTarget === 'all' ? 'Sine-save Lahat...' : 'I-save Lahat'}</span>
                        </button>
                    )
                )}
            </div>

            <SyncedDubbingStudio
                mapNumber={map.map_number}
                mapStartSec={map.youtube_start_sec || 0}
                existingVideoPath={map.story_video_path}
                storyVideoFile={form.story_video}
                removeStoryVideo={form.remove_story_video}
                onStoryVideoSelect={(file) => {
                    setDirtyMeta(true);
                    setForm((prev) => ({ ...prev, story_video: file, remove_story_video: false }));
                }}
                onStoryVideoRemove={() => {
                    setDirtyMeta(true);
                    setForm((prev) => ({ ...prev, story_video: null, remove_story_video: true }));
                }}
                voiceoverMode={form.voiceover_mode}
                onModeChange={(mode) => {
                    setDirtyMeta(true);
                    setForm((prev) => ({ ...prev, voiceover_mode: mode }));
                }}
                existingWholePath={map.whole_voiceover_path}
                wholeVoiceoverFile={form.whole_voiceover}
                removeWholeVoiceover={form.remove_whole_voiceover}
                wholeOffsetSec={form.whole_voiceover_offset_sec}
                onWholeFileSelect={(file) => {
                    setDirtyMeta(true);
                    setForm((prev) => ({ ...prev, whole_voiceover: file, remove_whole_voiceover: false }));
                }}
                onWholeRemove={() => {
                    setDirtyMeta(true);
                    setForm((prev) => ({ ...prev, whole_voiceover: null, remove_whole_voiceover: true }));
                }}
                onWholeOffsetChange={(val) => {
                    setDirtyMeta(true);
                    setForm((prev) => ({ ...prev, whole_voiceover_offset_sec: val }));
                }}
                scenes={form.scene_script}
                sceneAudioFiles={form.scene_audios}
                removedSceneIndices={form.remove_scene_audios}
                dirtySceneIndices={pendingSceneIndices}
                savingSceneIdx={savingTarget}
                onSaveScene={handleSaveScene}
                onSceneUpdate={(idx, field, val) => {
                    markSceneDirty(idx);
                    setForm((prev) => {
                        const next = [...prev.scene_script];
                        next[idx] = { ...next[idx], [field]: val };
                        return { ...prev, scene_script: next };
                    });
                }}
                onSceneAudioSelect={(idx, file) => {
                    markSceneDirty(idx);
                    setForm((prev) => ({
                        ...prev,
                        scene_audios: { ...prev.scene_audios, [idx]: file },
                        remove_scene_audios: prev.remove_scene_audios.filter((i) => i !== idx),
                    }));
                }}
                onSceneAudioRemove={(idx) => {
                    markSceneDirty(idx);
                    setForm((prev) => {
                        const nextAudios = { ...prev.scene_audios };
                        delete nextAudios[idx];
                        return {
                            ...prev,
                            scene_audios: nextAudios,
                            remove_scene_audios: prev.remove_scene_audios.includes(idx)
                                ? prev.remove_scene_audios
                                : [...prev.remove_scene_audios, idx],
                        };
                    });
                }}
                onAddScene={() => {
                    setDirtyMeta(true);
                    setForm((prev) => {
                        const lastEnd = prev.scene_script[prev.scene_script.length - 1]?.end_sec ?? 30;
                        return {
                            ...prev,
                            scene_script: [
                                ...prev.scene_script,
                                {
                                    scene_title: `Eksena ${prev.scene_script.length + 1}`,
                                    timestamp: `0:${String(lastEnd).padStart(2, '0')}–0:${String(lastEnd + 15).padStart(2, '0')}`,
                                    start_sec: lastEnd,
                                    end_sec: lastEnd + 15,
                                    audio_offset_sec: 0,
                                    visual_guide: '',
                                    dialogue: '',
                                },
                            ],
                        };
                    });
                }}
                onRemoveScene={(idx) => {
                    setDirtyMeta(true);
                    setDirtyScenes((prev) => prev.filter((n) => n !== idx).map((n) => (n > idx ? n - 1 : n)));
                    setForm((prev) => {
                        const nextSceneAudios = {};
                        Object.entries(prev.scene_audios || {}).forEach(([k, f]) => {
                            const n = Number(k);
                            if (n < idx) nextSceneAudios[n] = f;
                            else if (n > idx) nextSceneAudios[n - 1] = f;
                        });
                        const nextRemoved = (prev.remove_scene_audios || [])
                            .filter((n) => n !== idx)
                            .map((n) => (n > idx ? n - 1 : n));
                        return {
                            ...prev,
                            scene_script: prev.scene_script.filter((_, i) => i !== idx),
                            scene_audios: nextSceneAudios,
                            remove_scene_audios: nextRemoved,
                        };
                    });
                }}
            />
        </form>
    );
}
