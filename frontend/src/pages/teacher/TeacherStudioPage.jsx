import { useEffect, useState } from 'react';
import { AlertCircle, Save } from 'lucide-react';
import { teacherApi } from '../../api/teacherApi';
import { useToast } from '../../context/ToastContext';
import SyncedDubbingStudio from '../../components/teacher/SyncedDubbingStudio';
import TeacherLayout from './TeacherLayout';

const VOICEOVER_TAG = {
    default: 'Built-in VO',
    whole: 'Whole VO',
    per_scene: 'Per-Scene VO',
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
        setHasUnsaved(false);
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
            subtitle="Palitan ang 3D story video, i-edit ang script/subtitles, o i-record ang sarili mong boses habang naka-sync sa video."
        >
            {!lesson ? (
                <div className="text-xs text-slate-500 py-12 text-center">Inihahanda ang Video &amp; Voice-Over Studio...</div>
            ) : (
                <div className="space-y-5">
                    {/* Horizontally scrollable Map Selector Strip on mobile, wrapped on sm+ */}
                    <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 sm:flex-wrap">
                        {lesson.maps.map((m) => {
                            const isSel = selectedMapNum === m.map_number;
                            return (
                                <button
                                    key={m.id}
                                    type="button"
                                    onClick={() => handleSelectMap(m.map_number)}
                                    className={`shrink-0 min-h-[40px] inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                                        isSel
                                            ? 'bg-[#C2410C] text-white border-[#C2410C] shadow-xs'
                                            : 'bg-white text-slate-700 border-slate-200/90 hover:bg-slate-50 hover:text-slate-900'
                                    }`}
                                >
                                    <span>
                                        Mapa {m.map_number}: {m.title}
                                    </span>
                                    <span
                                        className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium ${
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
    const [saving, setSaving] = useState(false);
    const [dirty, setDirty] = useState(false);
    const [form, setForm] = useState(() => buildInitialForm(map));

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

    const pendingSceneAudioCount = Object.values(form.scene_audios || {}).filter(Boolean).length;
    const pendingUploadCount =
        pendingSceneAudioCount + (form.whole_voiceover ? 1 : 0) + (form.story_video ? 1 : 0);

    const updateForm = (updater) => {
        setDirty(true);
        setForm((prev) => (typeof updater === 'function' ? updater(prev) : { ...prev, ...updater }));
    };

    const updateScene = (idx, field, val) => {
        updateForm((prev) => {
            const next = [...prev.scene_script];
            next[idx] = { ...next[idx], [field]: val };
            return { ...prev, scene_script: next };
        });
    };

    const handleSave = async (e) => {
        e.preventDefault();
        if (saving) return;
        setSaving(true);
        try {
            const fd = new FormData();
            // Preserve existing map metadata fields seamlessly when saving from Studio
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

            // Updated studio fields
            fd.append('scene_script', JSON.stringify(form.scene_script));
            fd.append('voiceover_mode', form.voiceover_mode || 'default');
            fd.append('whole_voiceover_offset_sec', String(form.whole_voiceover_offset_sec ?? 0));
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

            // Immediately sync form with fresh server URLs and clear uploaded pending Files!
            setForm(buildInitialForm(savedMap));
            setDirty(false);

            notify(
                pendingSceneAudioCount > 0
                    ? `Na-upload at na-save na ang ${pendingSceneAudioCount} per-scene audio ng Mapa ${map.map_number}!`
                    : `Na-save ang Video, Script at Voice-Over ng Mapa ${map.map_number}.`,
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
            setSaving(false);
        }
    };

    return (
        <form
            onSubmit={handleSave}
            className="border border-slate-200/90 rounded-2xl p-4 sm:p-5 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] space-y-4"
        >
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
                <div>
                    <h2 className="text-sm font-bold text-slate-900">
                        Mapa {map.map_number}: {map.title}
                    </h2>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                        Ang anumang pagbabago sa video, script, o boses ng guro ay agad makikita ng mga estudyante pagkatapos i-save.
                    </p>
                </div>
                <button
                    type="submit"
                    disabled={saving}
                    className={`h-9 inline-flex items-center gap-1.5 px-4 rounded-lg text-white text-xs font-semibold transition cursor-pointer disabled:opacity-60 ${
                        dirty
                            ? 'bg-[#C2410C] hover:bg-[#9A3412] shadow-xs'
                            : 'bg-slate-900 hover:bg-slate-800'
                    }`}
                >
                    <Save className="w-3.5 h-3.5" />
                    <span>
                        {saving
                            ? 'Ina-upload at Sine-save...'
                            : pendingUploadCount > 0
                              ? `I-save ang Studio (${pendingUploadCount} audio/video)`
                              : 'I-save ang Studio'}
                    </span>
                </button>
            </div>

            {dirty && (
                <div className="rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2.5 text-xs text-amber-950">
                    <span className="inline-flex items-center gap-2 font-semibold">
                        <AlertCircle className="w-4 h-4 text-[#C2410C] shrink-0" />
                        <span>
                            {pendingSceneAudioCount > 0
                                ? `May ${pendingSceneAudioCount} per-scene recording/audio na hindi pa naa-upload. Pindutin ang "I-save ang Studio" para hindi ito mawala.`
                                : 'May mga pagbabagong hindi pa na-save. Pindutin ang "I-save ang Studio" bago umalis.'}
                        </span>
                    </span>
                    <button
                        type="submit"
                        disabled={saving}
                        className="h-8 px-3 rounded-lg bg-[#C2410C] hover:bg-[#9A3412] text-white text-[11px] font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60 shrink-0"
                    >
                        <Save className="w-3 h-3" />
                        <span>{saving ? 'Sine-save...' : 'I-save Ngayon'}</span>
                    </button>
                </div>
            )}

            <SyncedDubbingStudio
                mapNumber={map.map_number}
                mapStartSec={map.youtube_start_sec || 0}
                existingVideoPath={map.story_video_path}
                storyVideoFile={form.story_video}
                removeStoryVideo={form.remove_story_video}
                onStoryVideoSelect={(file) =>
                    updateForm((prev) => ({ ...prev, story_video: file, remove_story_video: false }))
                }
                onStoryVideoRemove={() =>
                    updateForm((prev) => ({ ...prev, story_video: null, remove_story_video: true }))
                }
                voiceoverMode={form.voiceover_mode}
                onModeChange={(mode) => updateForm((prev) => ({ ...prev, voiceover_mode: mode }))}
                existingWholePath={map.whole_voiceover_path}
                wholeVoiceoverFile={form.whole_voiceover}
                removeWholeVoiceover={form.remove_whole_voiceover}
                wholeOffsetSec={form.whole_voiceover_offset_sec}
                onWholeFileSelect={(file) =>
                    updateForm((prev) => ({ ...prev, whole_voiceover: file, remove_whole_voiceover: false }))
                }
                onWholeRemove={() =>
                    updateForm((prev) => ({ ...prev, whole_voiceover: null, remove_whole_voiceover: true }))
                }
                onWholeOffsetChange={(val) =>
                    updateForm((prev) => ({ ...prev, whole_voiceover_offset_sec: val }))
                }
                scenes={form.scene_script}
                sceneAudioFiles={form.scene_audios}
                removedSceneIndices={form.remove_scene_audios}
                onSceneUpdate={updateScene}
                onSceneAudioSelect={(idx, file) =>
                    updateForm((prev) => ({
                        ...prev,
                        scene_audios: { ...prev.scene_audios, [idx]: file },
                        remove_scene_audios: prev.remove_scene_audios.filter((i) => i !== idx),
                    }))
                }
                onSceneAudioRemove={(idx) =>
                    updateForm((prev) => {
                        const nextAudios = { ...prev.scene_audios };
                        delete nextAudios[idx];
                        return {
                            ...prev,
                            scene_audios: nextAudios,
                            remove_scene_audios: prev.remove_scene_audios.includes(idx)
                                ? prev.remove_scene_audios
                                : [...prev.remove_scene_audios, idx],
                        };
                    })
                }
                onAddScene={() => {
                    updateForm((prev) => {
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
                onRemoveScene={(idx) =>
                    updateForm((prev) => {
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
                    })
                }
            />
        </form>
    );
}
