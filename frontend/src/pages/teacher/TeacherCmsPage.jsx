import { useEffect, useState } from 'react';
import { Clock, Film, Mic, Music, Plus, Save, Trash2, Upload, Volume2, X } from 'lucide-react';
import { resolveStorageUrl } from '../../api/axiosClient';
import { teacherApi } from '../../api/teacherApi';
import AudioRecorderField from '../../components/teacher/AudioRecorderField';
import SyncedDubbingStudio from '../../components/teacher/SyncedDubbingStudio';
import TeacherLayout from './TeacherLayout';

const PER_QUESTION_PRESETS = [15, 20, 30, 45, 60];
const WHOLE_MAP_PRESETS = [60, 90, 120, 180, 300];

export default function TeacherCmsPage() {
    const [lesson, setLesson] = useState(null);
    const [selectedMapNum, setSelectedMapNum] = useState(1);
    const [notice, setNotice] = useState('');
    const [lessonForm, setLessonForm] = useState({
        title: '',
        description: '',
        video_source_type: 'placeholder',
        youtube_url: '',
        uploaded_video: null,
        praise_audio: null,
        wrong_audio: null,
        bgm_audio: null,
        remove_praise_audio: false,
        remove_wrong_audio: false,
        remove_bgm_audio: false,
    });
    const [savingLesson, setSavingLesson] = useState(false);

    const loadCms = async () => {
        const res = await teacherApi.getCms();
        if (res.lesson) {
            setLesson(res.lesson);
            setLessonForm({
                title: res.lesson.title || '',
                description: res.lesson.description || '',
                video_source_type: res.lesson.video_source_type || 'placeholder',
                youtube_url: res.lesson.youtube_url || '',
                uploaded_video: null,
                praise_audio: null,
                wrong_audio: null,
                bgm_audio: null,
                remove_praise_audio: false,
                remove_wrong_audio: false,
                remove_bgm_audio: false,
            });
        }
    };

    useEffect(() => {
        loadCms();
    }, []);

    const notify = (msg) => {
        setNotice(msg);
        setTimeout(() => setNotice(''), 2800);
    };

    const handleSaveLesson = async (e) => {
        e.preventDefault();
        if (!lesson) return;
        setSavingLesson(true);
        try {
            const fd = new FormData();
            fd.append('title', lessonForm.title);
            fd.append('description', lessonForm.description || '');
            fd.append('video_source_type', lessonForm.video_source_type);
            fd.append('youtube_url', lessonForm.youtube_url || '');
            if (lessonForm.uploaded_video) fd.append('uploaded_video', lessonForm.uploaded_video);
            if (lessonForm.praise_audio) fd.append('praise_audio', lessonForm.praise_audio);
            if (lessonForm.wrong_audio) fd.append('wrong_audio', lessonForm.wrong_audio);
            if (lessonForm.bgm_audio) fd.append('bgm_audio', lessonForm.bgm_audio);
            if (lessonForm.remove_praise_audio) fd.append('remove_praise_audio', '1');
            if (lessonForm.remove_wrong_audio) fd.append('remove_wrong_audio', '1');
            if (lessonForm.remove_bgm_audio) fd.append('remove_bgm_audio', '1');

            await teacherApi.updateLesson(lesson.id, fd);
            notify('Na-save ang aralin, video source, at default audio settings.');
            loadCms();
        } finally {
            setSavingLesson(false);
        }
    };

    const activeMap = lesson?.maps?.find((m) => m.map_number === selectedMapNum) || lesson?.maps?.[0];

    return (
        <TeacherLayout title="Dynamic Teacher CMS">
            {notice && (
                <div className="mb-4 px-4 py-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-[#15803D] text-xs font-semibold">
                    {notice}
                </div>
            )}

            {lesson && (
                <>
                    <form onSubmit={handleSaveLesson} className="border border-[#E5E7EB] rounded-xl p-5 mb-6 bg-white space-y-5">
                        <div className="flex items-center justify-between border-b border-[#E5E7EB] pb-3">
                            <div className="flex items-center gap-2">
                                <Film className="w-4 h-4 text-[#C2410C]" />
                                <h2 className="font-bold text-[#1E293B] text-sm">Aralin, Video Source & Default Audio</h2>
                            </div>
                            <button
                                type="submit"
                                disabled={savingLesson}
                                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#1E293B] text-white text-xs font-semibold hover:bg-slate-800 cursor-pointer disabled:opacity-60"
                            >
                                <Save className="w-3.5 h-3.5" />
                                {savingLesson ? 'Sine-save...' : 'I-save ang Aralin'}
                            </button>
                        </div>

                        <div className="grid md:grid-cols-3 gap-4">
                            <div>
                                <label className="block text-[11px] font-bold text-slate-600 mb-1">Pamagat ng Aralin</label>
                                <input
                                    type="text"
                                    value={lessonForm.title}
                                    onChange={(e) => setLessonForm({ ...lessonForm, title: e.target.value })}
                                    className="w-full rounded-lg border border-[#E5E7EB] px-3 py-2 text-xs"
                                />
                            </div>
                            <div>
                                <label className="block text-[11px] font-bold text-slate-600 mb-1">Video Source Type</label>
                                <select
                                    value={lessonForm.video_source_type}
                                    onChange={(e) => setLessonForm({ ...lessonForm, video_source_type: e.target.value })}
                                    className="w-full rounded-lg border border-[#E5E7EB] px-3 py-2 text-xs"
                                >
                                    <option value="placeholder">Scene Script Guide (Default)</option>
                                    <option value="youtube">YouTube Clip (Auto-Pause Timestamps)</option>
                                    <option value="upload">Uploaded MP4 Video</option>
                                </select>
                            </div>
                            {lessonForm.video_source_type === 'youtube' && (
                                <div>
                                    <label className="block text-[11px] font-bold text-slate-600 mb-1">YouTube URL</label>
                                    <input
                                        type="url"
                                        value={lessonForm.youtube_url}
                                        onChange={(e) => setLessonForm({ ...lessonForm, youtube_url: e.target.value })}
                                        placeholder="https://www.youtube.com/watch?v=..."
                                        className="w-full rounded-lg border border-[#E5E7EB] px-3 py-2 text-xs"
                                    />
                                </div>
                            )}
                            {lessonForm.video_source_type === 'upload' && (
                                <div>
                                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Mag-upload ng MP4</label>
                                    <input
                                        type="file"
                                        accept="video/mp4,video/webm"
                                        onChange={(e) => setLessonForm({ ...lessonForm, uploaded_video: e.target.files[0] })}
                                        className="w-full text-xs text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-[#F3F4F6] file:font-semibold"
                                    />
                                </div>
                            )}
                        </div>

                        {/* Global Default Audio (Praise / Wrong / BGM) */}
                        <div className="border-t border-[#E5E7EB] pt-4 space-y-3">
                            <div className="flex items-center gap-2">
                                <Volume2 className="w-4 h-4 text-[#C2410C]" />
                                <h3 className="text-xs font-bold text-[#1E293B]">
                                    Default Feedback Audio (Lahat ng Mapa)
                                </h3>
                                <span className="text-[11px] text-slate-500">
                                    Kung walang naka-upload, gagamit ng banayad na default sound chime.
                                </span>
                            </div>

                            <div className="grid md:grid-cols-3 gap-3">
                                <AudioSlotField
                                    label="Praise Audio (Tamang Sagot)"
                                    existingPath={lessonForm.remove_praise_audio ? null : lesson.praise_audio_path}
                                    selectedFile={lessonForm.praise_audio}
                                    onSelect={(file) =>
                                        setLessonForm({ ...lessonForm, praise_audio: file, remove_praise_audio: false })
                                    }
                                    onRemove={() =>
                                        setLessonForm({ ...lessonForm, praise_audio: null, remove_praise_audio: true })
                                    }
                                />
                                <AudioSlotField
                                    label="Wrong Audio (Maling Sagot)"
                                    existingPath={lessonForm.remove_wrong_audio ? null : lesson.wrong_audio_path}
                                    selectedFile={lessonForm.wrong_audio}
                                    onSelect={(file) =>
                                        setLessonForm({ ...lessonForm, wrong_audio: file, remove_wrong_audio: false })
                                    }
                                    onRemove={() =>
                                        setLessonForm({ ...lessonForm, wrong_audio: null, remove_wrong_audio: true })
                                    }
                                />
                                <AudioSlotField
                                    label="Background Music (Optional)"
                                    existingPath={lessonForm.remove_bgm_audio ? null : lesson.bgm_audio_path}
                                    selectedFile={lessonForm.bgm_audio}
                                    onSelect={(file) =>
                                        setLessonForm({ ...lessonForm, bgm_audio: file, remove_bgm_audio: false })
                                    }
                                    onRemove={() =>
                                        setLessonForm({ ...lessonForm, bgm_audio: null, remove_bgm_audio: true })
                                    }
                                />
                            </div>
                        </div>
                    </form>

                    {/* Map Selector Tabs */}
                    <div className="flex flex-wrap gap-2 mb-5">
                        {lesson.maps.map((m) => (
                            <button
                                key={m.id}
                                type="button"
                                onClick={() => setSelectedMapNum(m.map_number)}
                                className={`px-3.5 py-2 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                                    selectedMapNum === m.map_number
                                        ? 'bg-[#C2410C] text-white border-[#C2410C]'
                                        : 'bg-white text-[#1E293B] border-[#E5E7EB] hover:bg-[#F3F4F6]'
                                }`}
                            >
                                Mapa {m.map_number}: {m.title} ({m.time_limit_seconds}s)
                            </button>
                        ))}
                    </div>

                    {activeMap && <MapEditor key={activeMap.id} map={activeMap} onSaved={loadCms} notify={notify} />}
                </>
            )}
        </TeacherLayout>
    );
}

function AudioSlotField({ label, existingPath, selectedFile, onSelect, onRemove }) {
    const existingUrl = resolveStorageUrl(existingPath);

    return (
        <div className="rounded-lg border border-[#E5E7EB] bg-[#FAFAFA] p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
                    <Music className="w-3.5 h-3.5 text-slate-400" />
                    {label}
                </span>
                {(existingUrl || selectedFile) && (
                    <button
                        type="button"
                        onClick={onRemove}
                        className="text-[11px] font-semibold text-rose-600 hover:underline inline-flex items-center gap-0.5 cursor-pointer"
                    >
                        <X className="w-3 h-3" /> Alisin
                    </button>
                )}
            </div>

            {existingUrl && !selectedFile && (
                <audio controls src={existingUrl} className="w-full h-8" preload="none" />
            )}

            {selectedFile && (
                <p className="text-[11px] font-medium text-[#15803D] truncate">
                    Bagong file: {selectedFile.name}
                </p>
            )}

            <input
                type="file"
                accept="audio/mpeg,audio/wav,audio/ogg,audio/mp4,audio/x-m4a,audio/webm,.mp3,.wav,.ogg,.m4a"
                onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) onSelect(file);
                }}
                className="w-full text-[11px] text-slate-600 file:mr-2 file:py-1 file:px-2.5 file:rounded-md file:border file:border-[#E5E7EB] file:bg-white file:text-[11px] file:font-semibold file:text-slate-700 cursor-pointer"
            />
        </div>
    );
}

function MapEditor({ map, onSaved, notify }) {
    const [form, setForm] = useState({
        title: map.title,
        strategy_label: map.strategy_label,
        pokus_na_kasanayan: map.pokus_na_kasanayan,
        panuto: map.panuto,
        scene_script: map.scene_script || [],
        youtube_start_sec: map.youtube_start_sec,
        youtube_end_sec: map.youtube_end_sec,
        max_hearts: map.max_hearts,
        time_limit_seconds: map.time_limit_seconds,
        feedback_correct: map.feedback_correct,
        feedback_wrong: map.feedback_wrong,
        voiceover_mode: map.voiceover_mode || 'default',
        whole_voiceover_offset_sec: Number(map.whole_voiceover_offset_sec || 0),
        story_video: null,
        whole_voiceover: null,
        scene_audios: {},
        remove_story_video: false,
        remove_whole_voiceover: false,
        remove_scene_audios: [],
        audio_prompt: null,
        praise_audio: null,
        wrong_audio: null,
        remove_audio_prompt: false,
        remove_praise_audio: false,
        remove_wrong_audio: false,
    });
    const [saving, setSaving] = useState(false);
    const [addingChallenge, setAddingChallenge] = useState(false);

    const handleSaveMap = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            const fd = new FormData();
            fd.append('title', form.title);
            fd.append('strategy_label', form.strategy_label);
            fd.append('pokus_na_kasanayan', form.pokus_na_kasanayan);
            fd.append('panuto', form.panuto);
            fd.append('scene_script', JSON.stringify(form.scene_script));
            fd.append('youtube_start_sec', String(form.youtube_start_sec));
            fd.append('youtube_end_sec', String(form.youtube_end_sec));
            fd.append('max_hearts', String(form.max_hearts));
            fd.append('time_limit_seconds', String(form.time_limit_seconds));
            fd.append('allow_user_time_choice', '0');
            fd.append('feedback_correct', form.feedback_correct);
            fd.append('feedback_wrong', form.feedback_wrong);
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
            if (form.audio_prompt) fd.append('audio_prompt', form.audio_prompt);
            if (form.praise_audio) fd.append('praise_audio', form.praise_audio);
            if (form.wrong_audio) fd.append('wrong_audio', form.wrong_audio);
            if (form.remove_audio_prompt) fd.append('remove_audio_prompt', '1');
            if (form.remove_praise_audio) fd.append('remove_praise_audio', '1');
            if (form.remove_wrong_audio) fd.append('remove_wrong_audio', '1');

            await teacherApi.updateMap(map.id, fd);
            notify(`Na-save ang Mapa ${map.map_number} (Video, Voice-Over at Timer: ${form.time_limit_seconds}s).`);
            onSaved();
        } finally {
            setSaving(false);
        }
    };

    const handleAddChallenge = async () => {
        setAddingChallenge(true);
        try {
            const fd = new FormData();
            const nextOrder = (map.challenges?.length || 0) + 1;
            fd.append('order_index', String(nextOrder));

            if (map.strategy_type === 'multiple_choice' || map.strategy_type === 'decision_quest') {
                const promptKey = map.strategy_type === 'decision_quest' ? 'scenario' : 'question';
                fd.append(`payload[${promptKey}]`, 'Bagong tanong — i-edit dito');
                ['A', 'B', 'C', 'D'].forEach((letter) => {
                    fd.append(`payload[choices][${letter}]`, `Opsyon ${letter}`);
                });
                fd.append('correct_answer[choice]', 'A');
            } else if (map.strategy_type === 'four_pics') {
                fd.append('payload[clue]', 'Bagong pahiwatig — i-edit dito');
                [0, 1, 2, 3].forEach((i) => {
                    fd.append(`payload[visual_hints][${i}]`, `Larawan ${i + 1}`);
                });
                fd.append('correct_answer[word]', 'JUAN');
            } else {
                return;
            }

            await teacherApi.storeChallenge(map.id, fd);
            notify(`Nadagdagan ng bagong hamon ang Mapa ${map.map_number}.`);
            onSaved();
        } finally {
            setAddingChallenge(false);
        }
    };

    const updateScene = (idx, field, val) => {
        const next = [...form.scene_script];
        next[idx] = { ...next[idx], [field]: val };
        setForm({ ...form, scene_script: next });
    };

    const canAddChallenges = ['multiple_choice', 'four_pics', 'decision_quest'].includes(map.strategy_type);
    const isPerQuestionMap = ['multiple_choice', 'four_pics', 'decision_quest'].includes(map.strategy_type);
    const timerPresets = isPerQuestionMap ? PER_QUESTION_PRESETS : WHOLE_MAP_PRESETS;

    return (
        <div className="space-y-6">
            <form onSubmit={handleSaveMap} className="border border-[#E5E7EB] rounded-xl p-5 bg-white space-y-5">
                <div className="flex items-center justify-between border-b border-[#E5E7EB] pb-3">
                    <div>
                        <h3 className="font-bold text-[#1E293B] text-sm">
                            Mapa {map.map_number}: {map.title}
                        </h3>
                        <p className="text-[11px] text-slate-500">Strategy: {map.strategy_type}</p>
                    </div>
                    <button
                        type="submit"
                        disabled={saving}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#1E293B] text-white text-xs font-semibold hover:bg-slate-800 cursor-pointer disabled:opacity-60"
                    >
                        <Save className="w-3.5 h-3.5" />
                        {saving ? 'Sine-save...' : 'I-save ang Mapa'}
                    </button>
                </div>

                {/* Title, Strategy, Video Timestamps */}
                <div className="grid md:grid-cols-3 gap-4">
                    <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">Pamagat</label>
                        <input
                            type="text"
                            value={form.title}
                            onChange={(e) => setForm({ ...form, title: e.target.value })}
                            className="w-full rounded-lg border border-[#E5E7EB] px-3 py-2 text-xs"
                        />
                    </div>
                    <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">Strategy Label</label>
                        <input
                            type="text"
                            value={form.strategy_label}
                            onChange={(e) => setForm({ ...form, strategy_label: e.target.value })}
                            className="w-full rounded-lg border border-[#E5E7EB] px-3 py-2 text-xs"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <label className="block text-[11px] font-bold text-slate-600 mb-1">Video Start (s)</label>
                            <input
                                type="number"
                                min={0}
                                value={form.youtube_start_sec}
                                onChange={(e) => setForm({ ...form, youtube_start_sec: Number(e.target.value) })}
                                className="w-full rounded-lg border border-[#E5E7EB] px-2.5 py-2 text-xs tabular-nums"
                            />
                        </div>
                        <div>
                            <label className="block text-[11px] font-bold text-slate-600 mb-1">Video End (s)</label>
                            <input
                                type="number"
                                min={1}
                                value={form.youtube_end_sec}
                                onChange={(e) => setForm({ ...form, youtube_end_sec: Number(e.target.value) })}
                                className="w-full rounded-lg border border-[#E5E7EB] px-2.5 py-2 text-xs tabular-nums"
                            />
                        </div>
                    </div>
                </div>

                {/* Teacher-Controlled Timer Per Map */}
                <div className="rounded-lg border border-[#E5E7EB] bg-[#FAFAFA] p-3.5 space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-bold text-[#1E293B] inline-flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-[#C2410C]" />
                            {isPerQuestionMap
                                ? 'Takdang Oras Bawat Tanong (Per-Question Timer)'
                                : 'Takdang Oras ng Buong Gawain (Whole-Map Timer)'}
                        </span>
                        <span className="text-[11px] text-slate-500">
                            {isPerQuestionMap
                                ? 'Babalik ang oras sa bawat bagong tanong kapag nakasagot nang tama.'
                                : 'Isang oras para sa buong gawain — maaaring taasan ng guro ayon sa pangangailangan.'}
                        </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        {timerPresets.map((sec) => (
                            <button
                                key={sec}
                                type="button"
                                onClick={() => setForm({ ...form, time_limit_seconds: sec })}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition cursor-pointer tabular-nums ${
                                    Number(form.time_limit_seconds) === sec
                                        ? 'bg-[#1E293B] text-white border-[#1E293B]'
                                        : 'bg-white text-slate-700 border-[#E5E7EB] hover:border-slate-400'
                                }`}
                            >
                                {sec}s
                            </button>
                        ))}
                        <div className="inline-flex items-center gap-1.5 ml-auto">
                            <label className="text-[11px] font-semibold text-slate-600">Custom (10–600s):</label>
                            <input
                                type="number"
                                min={10}
                                max={600}
                                value={form.time_limit_seconds}
                                onChange={(e) => setForm({ ...form, time_limit_seconds: Number(e.target.value) })}
                                className="w-20 rounded-lg border border-[#E5E7EB] bg-white px-2.5 py-1.5 text-xs font-semibold tabular-nums"
                            />
                        </div>
                    </div>
                </div>

                {/* Panuto & Pokus na Kasanayan */}
                <div className="grid md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">Panuto (Pormal na Gabay)</label>
                        <textarea
                            rows={2}
                            value={form.panuto}
                            onChange={(e) => setForm({ ...form, panuto: e.target.value })}
                            className="w-full rounded-lg border border-[#E5E7EB] px-3 py-2 text-xs"
                        />
                    </div>
                    <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">Pokus na Kasanayan</label>
                        <textarea
                            rows={2}
                            value={form.pokus_na_kasanayan}
                            onChange={(e) => setForm({ ...form, pokus_na_kasanayan: e.target.value })}
                            className="w-full rounded-lg border border-[#E5E7EB] px-3 py-2 text-xs"
                        />
                    </div>
                </div>

                {/* Feedback Messages (Correct / Wrong) */}
                <div className="grid md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">Mensahe kapag Tama ang Sagot</label>
                        <textarea
                            rows={2}
                            value={form.feedback_correct}
                            onChange={(e) => setForm({ ...form, feedback_correct: e.target.value })}
                            className="w-full rounded-lg border border-[#E5E7EB] px-3 py-2 text-xs"
                        />
                    </div>
                    <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">Mensahe kapag Mali ang Sagot</label>
                        <textarea
                            rows={2}
                            value={form.feedback_wrong}
                            onChange={(e) => setForm({ ...form, feedback_wrong: e.target.value })}
                            className="w-full rounded-lg border border-[#E5E7EB] px-3 py-2 text-xs"
                        />
                    </div>
                </div>

                {/* Per-Map Audio Overrides */}
                <div className="border-t border-[#E5E7EB] pt-4 space-y-3">
                    <div className="flex items-center gap-2">
                        <Volume2 className="w-4 h-4 text-[#C2410C]" />
                        <h4 className="text-xs font-bold text-[#1E293B]">
                            Audio para sa Mapa {map.map_number} (Optional Override)
                        </h4>
                    </div>
                    <div className="grid md:grid-cols-3 gap-3">
                        <AudioSlotField
                            label="Panuto / Narration Audio"
                            existingPath={form.remove_audio_prompt ? null : map.audio_prompt_path}
                            selectedFile={form.audio_prompt}
                            onSelect={(file) => setForm({ ...form, audio_prompt: file, remove_audio_prompt: false })}
                            onRemove={() => setForm({ ...form, audio_prompt: null, remove_audio_prompt: true })}
                        />
                        <AudioSlotField
                            label="Praise Audio (Tamang Sagot)"
                            existingPath={form.remove_praise_audio ? null : map.praise_audio_path}
                            selectedFile={form.praise_audio}
                            onSelect={(file) => setForm({ ...form, praise_audio: file, remove_praise_audio: false })}
                            onRemove={() => setForm({ ...form, praise_audio: null, remove_praise_audio: true })}
                        />
                        <AudioSlotField
                            label="Wrong Audio (Maling Sagot)"
                            existingPath={form.remove_wrong_audio ? null : map.wrong_audio_path}
                            selectedFile={form.wrong_audio}
                            onSelect={(file) => setForm({ ...form, wrong_audio: file, remove_wrong_audio: false })}
                            onRemove={() => setForm({ ...form, wrong_audio: null, remove_wrong_audio: true })}
                        />
                    </div>
                </div>

                {/* Video-Synced Dubbing Studio (Default / Whole-Map / Per-Scene + Live Timing Preview) */}
                <SyncedDubbingStudio
                    mapNumber={map.map_number}
                    mapStartSec={form.youtube_start_sec || 0}
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

            {/* Dynamic Questions / Challenges Editor */}
            <div className="border border-[#E5E7EB] rounded-xl p-5 bg-white">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="font-bold text-[#1E293B] text-sm">Mga Tanong at Hamon ({map.challenges.length})</h3>
                    {canAddChallenges && (
                        <button
                            type="button"
                            disabled={addingChallenge}
                            onClick={handleAddChallenge}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#C2410C] hover:bg-[#9A3412] text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
                        >
                            <Plus className="w-3.5 h-3.5" />
                            {addingChallenge ? 'Nagdadagdag...' : 'Magdagdag ng Tanong'}
                        </button>
                    )}
                </div>
                <div className="space-y-4">
                    {map.challenges.map((ch) => (
                        <ChallengeItemEditor key={ch.id} map={map} challenge={ch} onSaved={onSaved} notify={notify} />
                    ))}
                </div>
            </div>
        </div>
    );
}

function ChallengeItemEditor({ map, challenge, onSaved, notify }) {
    const [payload, setPayload] = useState(challenge.payload);
    const [correctAnswer, setCorrectAnswer] = useState(challenge.correct_answer);
    const [singleImageFile, setSingleImageFile] = useState(null);
    const [imageFiles, setImageFiles] = useState([null, null, null, null]);
    const [saving, setSaving] = useState(false);

    const handleSave = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            const fd = new FormData();
            fd.append('order_index', challenge.order_index);
            const appendNested = (prefix, obj) => {
                if (Array.isArray(obj)) {
                    obj.forEach((v, i) => appendNested(`${prefix}[${i}]`, v));
                } else if (obj !== null && typeof obj === 'object') {
                    Object.entries(obj).forEach(([k, v]) => appendNested(`${prefix}[${k}]`, v));
                } else {
                    fd.append(prefix, obj ?? '');
                }
            };
            appendNested('payload', payload);
            appendNested('correct_answer', correctAnswer);
            if (singleImageFile) {
                fd.append('image', singleImageFile);
            }
            imageFiles.forEach((file, idx) => {
                if (file) fd.append(`images[${idx}]`, file);
            });
            await teacherApi.updateChallenge(challenge.id, fd);
            setSingleImageFile(null);
            notify(`Na-save ang Hamon #${challenge.order_index}.`);
            onSaved();
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        await teacherApi.deleteChallenge(challenge.id);
        notify('Natanggal ang hamon.');
        onSaved();
    };

    const singleImageUrl = resolveStorageUrl(payload.image);

    return (
        <form onSubmit={handleSave} className="p-4 rounded-xl border border-[#E5E7EB] bg-[#FAFAFA] space-y-3">
            <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#1E293B] tabular-nums">Hamon #{challenge.order_index}</span>
                <div className="flex items-center gap-2">
                    <button
                        type="submit"
                        disabled={saving}
                        className="px-3 py-1 rounded-md bg-[#1E293B] text-white text-xs font-semibold hover:bg-slate-800 cursor-pointer"
                    >
                        {saving ? 'Sine-save...' : 'I-save'}
                    </button>
                    <button
                        type="button"
                        onClick={handleDelete}
                        className="p-1.5 rounded-md text-rose-600 hover:bg-rose-50 cursor-pointer"
                        title="Tanggalin"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {map.strategy_type !== 'four_pics' && (
                <div className="flex items-center gap-3">
                    {singleImageUrl && (
                        <img
                            src={singleImageUrl}
                            alt=""
                            className="w-24 aspect-video object-cover rounded-lg border border-[#E5E7EB] shrink-0"
                        />
                    )}
                    <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[#E5E7EB] bg-white text-[11px] font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer">
                        <Upload className="w-3.5 h-3.5" />
                        <span>{singleImageFile ? singleImageFile.name : 'Palitan ang Larawan'}</span>
                        <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => setSingleImageFile(e.target.files?.[0] || null)}
                        />
                    </label>
                </div>
            )}

            {(map.strategy_type === 'multiple_choice' || map.strategy_type === 'decision_quest') && (
                <div className="space-y-2">
                    <input
                        type="text"
                        value={payload.question || payload.scenario || ''}
                        onChange={(e) =>
                            setPayload({
                                ...payload,
                                [map.strategy_type === 'decision_quest' ? 'scenario' : 'question']: e.target.value,
                            })
                        }
                        className="w-full rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-xs font-medium"
                    />
                    <div className="grid md:grid-cols-2 gap-2">
                        {Object.entries(payload.choices || {}).map(([letter, text]) => (
                            <div key={letter} className="flex items-center gap-2">
                                <input
                                    type="radio"
                                    name={`ans-${challenge.id}`}
                                    checked={correctAnswer.choice === letter}
                                    onChange={() => setCorrectAnswer({ choice: letter })}
                                />
                                <span className="text-xs font-bold w-4">{letter}.</span>
                                <input
                                    type="text"
                                    value={text}
                                    onChange={(e) =>
                                        setPayload({
                                            ...payload,
                                            choices: { ...payload.choices, [letter]: e.target.value },
                                        })
                                    }
                                    className="flex-1 rounded border border-[#E5E7EB] bg-white px-2.5 py-1.5 text-xs"
                                />
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {map.strategy_type === 'four_pics' && (
                <div className="space-y-3">
                    <div className="grid md:grid-cols-2 gap-3">
                        <input
                            type="text"
                            value={payload.clue || ''}
                            onChange={(e) => setPayload({ ...payload, clue: e.target.value })}
                            className="w-full rounded-lg border border-[#E5E7EB] bg-white px-3 py-1.5 text-xs"
                        />
                        <input
                            type="text"
                            value={correctAnswer.word || ''}
                            onChange={(e) => setCorrectAnswer({ word: e.target.value.toUpperCase() })}
                            className="w-full rounded-lg border border-[#E5E7EB] bg-white px-3 py-1.5 text-xs font-bold uppercase"
                        />
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        {[0, 1, 2, 3].map((i) => {
                            const url = resolveStorageUrl(payload.images?.[i]);
                            return (
                                <label
                                    key={i}
                                    className="block border border-dashed border-[#E5E7EB] rounded-lg p-2 bg-white text-center cursor-pointer hover:border-[#C2410C]"
                                >
                                    {url ? (
                                        <img src={url} alt="" className="h-16 w-full object-cover rounded mb-1" />
                                    ) : (
                                        <div className="h-16 flex flex-col items-center justify-center text-slate-400 text-[11px]">
                                            <Upload className="w-4 h-4 mb-1" />
                                            Larawan {i + 1}
                                        </div>
                                    )}
                                    <input
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={(e) => {
                                            const next = [...imageFiles];
                                            next[i] = e.target.files[0];
                                            setImageFiles(next);
                                        }}
                                    />
                                </label>
                            );
                        })}
                    </div>
                </div>
            )}

            {map.strategy_type === 'sequence' && (
                <div className="space-y-1.5">
                    <p className="text-[11px] text-slate-500">
                        Tamang Pagkakasunod-sunod: <strong className="font-mono">{JSON.stringify(correctAnswer.order)}</strong>
                    </p>
                    {(payload.events || []).map((ev, idx) => (
                        <div key={ev.id} className="flex items-center gap-2">
                            <span className="text-xs font-mono font-bold text-slate-500 w-8">#{ev.id}</span>
                            <input
                                type="text"
                                value={ev.text}
                                onChange={(e) => {
                                    const next = [...payload.events];
                                    next[idx] = { ...ev, text: e.target.value };
                                    setPayload({ ...payload, events: next });
                                }}
                                className="flex-1 rounded border border-[#E5E7EB] bg-white px-2.5 py-1.5 text-xs"
                            />
                        </div>
                    ))}
                </div>
            )}

            {map.strategy_type === 'matching' && (
                <div className="grid md:grid-cols-2 gap-3 text-xs">
                    <div className="space-y-1.5">
                        <span className="font-bold text-slate-600">Hanay A</span>
                        {(payload.column_a || []).map((item, idx) => (
                            <div key={item.id} className="flex items-center gap-1.5">
                                <span className="font-bold w-4">{item.id}.</span>
                                <input
                                    type="text"
                                    value={item.text}
                                    onChange={(e) => {
                                        const next = [...payload.column_a];
                                        next[idx] = { ...item, text: e.target.value };
                                        setPayload({ ...payload, column_a: next });
                                    }}
                                    className="flex-1 rounded border border-[#E5E7EB] bg-white px-2 py-1"
                                />
                            </div>
                        ))}
                    </div>
                    <div className="space-y-1.5">
                        <span className="font-bold text-slate-600">
                            Hanay B ({JSON.stringify(correctAnswer.pairs)})
                        </span>
                        {(payload.column_b || []).map((item, idx) => (
                            <div key={item.id} className="flex items-center gap-1.5">
                                <span className="font-bold w-4">{item.id}.</span>
                                <input
                                    type="text"
                                    value={item.text}
                                    onChange={(e) => {
                                        const next = [...payload.column_b];
                                        next[idx] = { ...item, text: e.target.value };
                                        setPayload({ ...payload, column_b: next });
                                    }}
                                    className="flex-1 rounded border border-[#E5E7EB] bg-white px-2 py-1"
                                />
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </form>
    );
}
