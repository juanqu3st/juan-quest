import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { teacherApi } from '../../api/teacherApi';
import { useToast } from '../../context/ToastContext';
import SyncedDubbingStudio from '../../components/teacher/SyncedDubbingStudio';
import TeacherLayout from './TeacherLayout';

const VOICEOVER_TAG = {
    default: 'Built-in VO',
    whole: 'Whole VO',
    per_scene: 'Per-Scene VO',
};

export default function TeacherStudioPage() {
    const { showToast } = useToast();
    const [lesson, setLesson] = useState(null);
    const [selectedMapNum, setSelectedMapNum] = useState(1);

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

    const activeMap = lesson?.maps?.find((m) => m.map_number === selectedMapNum) || lesson?.maps?.[0];

    return (
        <TeacherLayout
            title="Video & Voice-Over Studio"
            subtitle="Palitan ang 3D story video, i-edit ang script/subtitles, o i-record ang sarili mong boses habang naka-sync sa video."
        >
            {!lesson ? (
                <div className="text-xs text-slate-500 py-12 text-center">Inihahanda ang Video & Voice-Over Studio...</div>
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
                                    onClick={() => setSelectedMapNum(m.map_number)}
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
                        <MapStudioPanel key={activeMap.id} map={activeMap} onSaved={loadCms} notify={notify} />
                    )}
                </div>
            )}
        </TeacherLayout>
    );
}

function MapStudioPanel({ map, onSaved, notify }) {
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({
        scene_script: map.scene_script || [],
        voiceover_mode: map.voiceover_mode || 'default',
        whole_voiceover_offset_sec: Number(map.whole_voiceover_offset_sec || 0),
        story_video: null,
        whole_voiceover: null,
        scene_audios: {},
        remove_story_video: false,
        remove_whole_voiceover: false,
        remove_scene_audios: [],
    });

    const updateScene = (idx, field, val) => {
        const next = [...form.scene_script];
        next[idx] = { ...next[idx], [field]: val };
        setForm({ ...form, scene_script: next });
    };

    const handleSave = async (e) => {
        e.preventDefault();
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

            await teacherApi.updateMap(map.id, fd);
            notify(`Na-save ang Video, Script at Voice-Over ng Mapa ${map.map_number}.`, 'success', 'Na-save.');
            onSaved();
        } catch (err) {
            notify(
                err?.response?.data?.message || 'Hindi na-save ang Video & Voice-Over Studio.',
                'error',
                'May Error.'
            );
        } finally {
            setSaving(false);
        }
    };

    return (
        <form onSubmit={handleSave} className="border border-slate-200/90 rounded-2xl p-5 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
                <div>
                    <h2 className="text-sm font-bold text-slate-900">
                        Mapa {map.map_number}: {map.title}
                    </h2>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                        Ang anumang pagbabago sa video, script, o boses ng guro ay agad makikita ng mga estudyante.
                    </p>
                </div>
                <button
                    type="submit"
                    disabled={saving}
                    className="h-9 inline-flex items-center gap-1.5 px-4 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 transition cursor-pointer disabled:opacity-60"
                >
                    <Save className="w-3.5 h-3.5" />
                    <span>{saving ? 'Sine-save...' : 'I-save ang Studio'}</span>
                </button>
            </div>

            <SyncedDubbingStudio
                mapNumber={map.map_number}
                mapStartSec={map.youtube_start_sec || 0}
                existingVideoPath={map.story_video_path}
                storyVideoFile={form.story_video}
                removeStoryVideo={form.remove_story_video}
                onStoryVideoSelect={(file) => setForm({ ...form, story_video: file, remove_story_video: false })}
                onStoryVideoRemove={() => setForm({ ...form, story_video: null, remove_story_video: true })}
                voiceoverMode={form.voiceover_mode}
                onModeChange={(mode) => setForm({ ...form, voiceover_mode: mode })}
                existingWholePath={map.whole_voiceover_path}
                wholeVoiceoverFile={form.whole_voiceover}
                removeWholeVoiceover={form.remove_whole_voiceover}
                wholeOffsetSec={form.whole_voiceover_offset_sec}
                onWholeFileSelect={(file) =>
                    setForm({ ...form, whole_voiceover: file, remove_whole_voiceover: false })
                }
                onWholeRemove={() =>
                    setForm({ ...form, whole_voiceover: null, remove_whole_voiceover: true })
                }
                onWholeOffsetChange={(val) => setForm({ ...form, whole_voiceover_offset_sec: val })}
                scenes={form.scene_script}
                sceneAudioFiles={form.scene_audios}
                removedSceneIndices={form.remove_scene_audios}
                onSceneUpdate={updateScene}
                onSceneAudioSelect={(idx, file) =>
                    setForm({
                        ...form,
                        scene_audios: { ...form.scene_audios, [idx]: file },
                        remove_scene_audios: form.remove_scene_audios.filter((i) => i !== idx),
                    })
                }
                onSceneAudioRemove={(idx) =>
                    setForm({
                        ...form,
                        scene_audios: { ...form.scene_audios, [idx]: null },
                        remove_scene_audios: form.remove_scene_audios.includes(idx)
                            ? form.remove_scene_audios
                            : [...form.remove_scene_audios, idx],
                    })
                }
                onAddScene={() => {
                    const lastEnd = form.scene_script[form.scene_script.length - 1]?.end_sec ?? 30;
                    setForm({
                        ...form,
                        scene_script: [
                            ...form.scene_script,
                            {
                                scene_title: `Eksena ${form.scene_script.length + 1}`,
                                timestamp: `0:${String(lastEnd).padStart(2, '0')}–0:${String(lastEnd + 15).padStart(2, '0')}`,
                                start_sec: lastEnd,
                                end_sec: lastEnd + 15,
                                audio_offset_sec: 0,
                                visual_guide: '',
                                dialogue: '',
                            },
                        ],
                    });
                }}
                onRemoveScene={(idx) =>
                    setForm({
                        ...form,
                        scene_script: form.scene_script.filter((_, i) => i !== idx),
                    })
                }
            />
        </form>
    );
}
