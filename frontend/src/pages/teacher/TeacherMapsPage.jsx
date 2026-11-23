import { useEffect, useState } from 'react';
import { Clock, HelpCircle, Plus, Save, Settings2, Trash2, Upload, Volume2 } from 'lucide-react';
import { resolveStorageUrl } from '../../api/axiosClient';
import { teacherApi } from '../../api/teacherApi';
import { useToast } from '../../context/ToastContext';
import AudioRecorderField from '../../components/teacher/AudioRecorderField';
import TeacherLayout from './TeacherLayout';

const PER_QUESTION_PRESETS = [15, 20, 30, 45, 60];
const WHOLE_MAP_PRESETS = [60, 90, 120, 180, 300];

const STRATEGY_NAMES = {
    multiple_choice: 'Multiple Choice (1 pt / tanong)',
    sequence: 'Sequencing / Ayusin ang Banghay (2 pts / posisyon)',
    matching: 'Matching / Sanhi at Bunga (2 pts / pares)',
    four_pics: '4 Pics, 1 Word (2 pts / salita)',
    decision_quest: 'Decision Quest / Sitwasyon (2 pts / tanong)',
};

export default function TeacherMapsPage() {
    const { showToast } = useToast();
    const [lesson, setLesson] = useState(null);
    const [selectedMapNum, setSelectedMapNum] = useState(1);
    const [activeSubTab, setActiveSubTab] = useState('settings'); // 'settings' | 'questions'

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
            title="Mga Mapa & Tanong"
            subtitle="Pamahalaan ang pamagat, panuto, timer, boses ng papuri, at mga tanong ng bawat mapa."
        >
            {!lesson ? (
                <div className="text-xs text-slate-500 py-12 text-center">Kinukuha ang mga mapa at tanong...</div>
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
                                        className={`text-[10px] px-1.5 py-0.5 rounded-md font-mono ${
                                            isSel ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
                                        }`}
                                    >
                                        {m.time_limit_seconds}s
                                    </span>
                                </button>
                            );
                        })}
                    </div>

                    {activeMap && (
                        <>
                            {/* Clean 2-Tab Sub-Navigation (Full width on phone, compact inline on sm+) */}
                            <div className="grid grid-cols-2 sm:inline-flex rounded-xl bg-slate-100 p-1 border border-slate-200/70">
                                <button
                                    type="button"
                                    onClick={() => setActiveSubTab('settings')}
                                    className={`min-h-[38px] sm:min-h-0 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                                        activeSubTab === 'settings'
                                            ? 'bg-white text-slate-900 shadow-xs'
                                            : 'text-slate-500 hover:text-slate-900'
                                    }`}
                                >
                                    <Settings2 className="w-3.5 h-3.5" />
                                    <span>Detalye & Timer</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setActiveSubTab('questions')}
                                    className={`min-h-[38px] sm:min-h-0 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                                        activeSubTab === 'questions'
                                            ? 'bg-white text-slate-900 shadow-xs'
                                            : 'text-slate-500 hover:text-slate-900'
                                    }`}
                                >
                                    <HelpCircle className="w-3.5 h-3.5" />
                                    <span>Mga Tanong ({activeMap.challenges?.length || 0})</span>
                                </button>
                            </div>

                            {activeSubTab === 'settings' ? (
                                <MapSettingsPanel
                                    key={`set-${activeMap.id}`}
                                    map={activeMap}
                                    onSaved={loadCms}
                                    notify={notify}
                                />
                            ) : (
                                <MapQuestionsPanel
                                    key={`q-${activeMap.id}`}
                                    map={activeMap}
                                    onSaved={loadCms}
                                    notify={notify}
                                />
                            )}
                        </>
                    )}
                </div>
            )}
        </TeacherLayout>
    );
}

function MapSettingsPanel({ map, onSaved, notify }) {
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({
        title: map.title,
        strategy_label: map.strategy_label,
        pokus_na_kasanayan: map.pokus_na_kasanayan,
        panuto: map.panuto,
        time_limit_seconds: map.time_limit_seconds,
        feedback_correct: map.feedback_correct,
        feedback_wrong: map.feedback_wrong,
        audio_prompt: null,
        praise_audio: null,
        wrong_audio: null,
        remove_audio_prompt: false,
        remove_praise_audio: false,
        remove_wrong_audio: false,
    });

    const isPerQuestionMap = ['multiple_choice', 'four_pics', 'decision_quest'].includes(map.strategy_type);
    const timerPresets = isPerQuestionMap ? PER_QUESTION_PRESETS : WHOLE_MAP_PRESETS;

    const handleSave = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            const fd = new FormData();
            fd.append('title', form.title);
            fd.append('strategy_label', form.strategy_label);
            fd.append('pokus_na_kasanayan', form.pokus_na_kasanayan);
            fd.append('panuto', form.panuto);
            fd.append('scene_script', JSON.stringify(map.scene_script || []));
            fd.append('youtube_start_sec', String(map.youtube_start_sec ?? 0));
            fd.append('youtube_end_sec', String(map.youtube_end_sec ?? 50));
            fd.append('max_hearts', String(map.max_hearts ?? 3));
            fd.append('time_limit_seconds', String(form.time_limit_seconds));
            fd.append('allow_user_time_choice', '0');
            fd.append('feedback_correct', form.feedback_correct);
            fd.append('feedback_wrong', form.feedback_wrong);
            fd.append('voiceover_mode', map.voiceover_mode || 'default');
            fd.append('whole_voiceover_offset_sec', String(map.whole_voiceover_offset_sec ?? 0));

            if (form.audio_prompt) fd.append('audio_prompt', form.audio_prompt);
            if (form.praise_audio) fd.append('praise_audio', form.praise_audio);
            if (form.wrong_audio) fd.append('wrong_audio', form.wrong_audio);
            if (form.remove_audio_prompt) fd.append('remove_audio_prompt', '1');
            if (form.remove_praise_audio) fd.append('remove_praise_audio', '1');
            if (form.remove_wrong_audio) fd.append('remove_wrong_audio', '1');

            await teacherApi.updateMap(map.id, fd);
            notify(`Na-save ang Mapa ${map.map_number} (Timer: ${form.time_limit_seconds}s).`, 'success', 'Na-save.');
            onSaved();
        } catch (err) {
            notify(
                err?.response?.data?.message || 'Hindi na-save ang settings ng mapa.',
                'error',
                'May Error.'
            );
        } finally {
            setSaving(false);
        }
    };

    return (
        <form onSubmit={handleSave} className="border border-slate-200/90 rounded-2xl p-5 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3.5">
                <div>
                    <h2 className="text-sm font-bold text-slate-900">
                        Mapa {map.map_number}: {map.title}
                    </h2>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                        {STRATEGY_NAMES[map.strategy_type] || map.strategy_type} · 10 pts max
                    </p>
                </div>
                <button
                    type="submit"
                    disabled={saving}
                    className="h-9 inline-flex items-center gap-1.5 px-4 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 transition cursor-pointer disabled:opacity-60"
                >
                    <Save className="w-3.5 h-3.5" />
                    <span>{saving ? 'Sine-save...' : 'I-save ang Mapa'}</span>
                </button>
            </div>

            {/* Title & Activity Label */}
            <div className="grid md:grid-cols-2 gap-4">
                <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                        Pamagat ng Mapa / Map Title
                    </label>
                    <input
                        type="text"
                        value={form.title}
                        onChange={(e) => setForm({ ...form, title: e.target.value })}
                        className="w-full rounded-lg border border-[#E5E7EB] px-3 py-2 text-xs"
                        required
                    />
                </div>
                <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                        Uri ng Gawain / Activity Label
                    </label>
                    <input
                        type="text"
                        value={form.strategy_label}
                        onChange={(e) => setForm({ ...form, strategy_label: e.target.value })}
                        className="w-full rounded-lg border border-[#E5E7EB] px-3 py-2 text-xs"
                        required
                    />
                </div>
            </div>

            {/* Teacher-Controlled Timer */}
            <div className="rounded-lg border border-[#E5E7EB] bg-[#FAFAFA] p-4 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold text-[#1E293B] inline-flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-[#C2410C]" />
                        {isPerQuestionMap
                            ? 'Takdang Oras Bawat Tanong / Per-Question Timer'
                            : 'Takdang Oras ng Buong Gawain / Whole-Map Timer'}
                    </span>
                    <span className="text-[11px] text-slate-500">
                        {isPerQuestionMap
                            ? 'Babalik ang oras sa bawat bagong tanong / Resets every question.'
                            : 'Isang oras para sa buong gawain / Single timer for full board.'}
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

            {/* Instructions & Learning Focus */}
            <div className="grid md:grid-cols-2 gap-4">
                <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                        Panuto / Instructions
                    </label>
                    <textarea
                        rows={3}
                        value={form.panuto}
                        onChange={(e) => setForm({ ...form, panuto: e.target.value })}
                        className="w-full rounded-lg border border-[#E5E7EB] px-3 py-2 text-xs leading-relaxed"
                    />
                </div>
                <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                        Pokus na Kasanayan / Learning Focus
                    </label>
                    <textarea
                        rows={3}
                        value={form.pokus_na_kasanayan}
                        onChange={(e) => setForm({ ...form, pokus_na_kasanayan: e.target.value })}
                        className="w-full rounded-lg border border-[#E5E7EB] px-3 py-2 text-xs leading-relaxed"
                    />
                </div>
            </div>

            {/* Correct & Wrong Feedback Text */}
            <div className="grid md:grid-cols-2 gap-4">
                <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                        Mensahe sa Tamang Sagot / Correct Answer Message
                    </label>
                    <textarea
                        rows={2}
                        value={form.feedback_correct}
                        onChange={(e) => setForm({ ...form, feedback_correct: e.target.value })}
                        className="w-full rounded-lg border border-[#E5E7EB] px-3 py-2 text-xs leading-relaxed"
                    />
                </div>
                <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                        Mensahe sa Maling Sagot / Wrong Answer Message
                    </label>
                    <textarea
                        rows={2}
                        value={form.feedback_wrong}
                        onChange={(e) => setForm({ ...form, feedback_wrong: e.target.value })}
                        className="w-full rounded-lg border border-[#E5E7EB] px-3 py-2 text-xs leading-relaxed"
                    />
                </div>
            </div>

            {/* Per-Map Direct Mic Recording & Upload Audio Overrides */}
            <div className="border-t border-[#E5E7EB] pt-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                        <Volume2 className="w-4 h-4 text-[#C2410C]" />
                        <h3 className="text-xs font-bold text-[#1E293B]">
                            Boses at Tunog ng Mapa {map.map_number} / Per-Map Voice Overrides (Optional)
                        </h3>
                    </div>
                    <span className="text-[11px] text-slate-500">
                        Direktang mag-record sa mic o mag-upload; kung bakante, gagamitin ang Default Global Audio.
                    </span>
                </div>
                <div className="grid md:grid-cols-3 gap-3">
                    <AudioRecorderField
                        label="Boses ng Panuto / Instructions Audio"
                        hint="Babasa ng panuto sa simula ng mapang ito."
                        existingPath={form.remove_audio_prompt ? null : map.audio_prompt_path}
                        selectedFile={form.audio_prompt}
                        onSelect={(file) => setForm({ ...form, audio_prompt: file, remove_audio_prompt: false })}
                        onRemove={() => setForm({ ...form, audio_prompt: null, remove_audio_prompt: true })}
                    />
                    <AudioRecorderField
                        label="Papuri kapag Tama / Praise Audio"
                        hint="Sariling papuri ng guro para sa mapang ito."
                        existingPath={form.remove_praise_audio ? null : map.praise_audio_path}
                        selectedFile={form.praise_audio}
                        onSelect={(file) => setForm({ ...form, praise_audio: file, remove_praise_audio: false })}
                        onRemove={() => setForm({ ...form, praise_audio: null, remove_praise_audio: true })}
                    />
                    <AudioRecorderField
                        label="Gabay kapag Mali / Wrong Audio"
                        hint="Sariling paalala kapag nagkamali sa mapang ito."
                        existingPath={form.remove_wrong_audio ? null : map.wrong_audio_path}
                        selectedFile={form.wrong_audio}
                        onSelect={(file) => setForm({ ...form, wrong_audio: file, remove_wrong_audio: false })}
                        onRemove={() => setForm({ ...form, wrong_audio: null, remove_wrong_audio: true })}
                    />
                </div>
            </div>
        </form>
    );
}

function MapQuestionsPanel({ map, onSaved, notify }) {
    const [addingChallenge, setAddingChallenge] = useState(false);
    const canAddChallenges = ['multiple_choice', 'four_pics', 'decision_quest'].includes(map.strategy_type);

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
            notify(`Nadagdagan ng bagong tanong ang Mapa ${map.map_number}.`, 'success', 'Naidagdag.');
            onSaved();
        } catch (err) {
            notify(
                err?.response?.data?.message || 'Hindi naidagdag ang bagong tanong.',
                'error',
                'May Error.'
            );
        } finally {
            setAddingChallenge(false);
        }
    };

    return (
        <div className="border border-slate-200/90 rounded-2xl p-5 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3.5">
                <div>
                    <h2 className="text-sm font-bold text-slate-900">
                        Mga Tanong at Hamon{' '}
                        <span className="font-normal text-slate-400">
                            / Questions ({map.challenges.length})
                        </span>
                    </h2>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                        {STRATEGY_NAMES[map.strategy_type] || map.strategy_type}
                    </p>
                </div>
                {canAddChallenges && (
                    <button
                        type="button"
                        disabled={addingChallenge}
                        onClick={handleAddChallenge}
                        className="h-9 inline-flex items-center gap-1.5 px-3.5 rounded-lg bg-[#C2410C] hover:bg-[#9A3412] text-white text-xs font-semibold transition cursor-pointer disabled:opacity-60"
                    >
                        <Plus className="w-3.5 h-3.5" />
                        <span>{addingChallenge ? 'Nagdadagdag...' : 'Magdagdag ng Tanong'}</span>
                    </button>
                )}
            </div>
            <div className="space-y-4">
                {map.challenges.map((ch) => (
                    <ChallengeItemEditor key={ch.id} map={map} challenge={ch} onSaved={onSaved} notify={notify} />
                ))}
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
            if (singleImageFile) fd.append('image', singleImageFile);
            imageFiles.forEach((file, idx) => {
                if (file) fd.append(`images[${idx}]`, file);
            });
            await teacherApi.updateChallenge(challenge.id, fd);
            setSingleImageFile(null);
            notify(`Na-save ang Tanong #${challenge.order_index}.`, 'success', 'Na-save.');
            onSaved();
        } catch (err) {
            notify(
                err?.response?.data?.message || 'Hindi na-save ang tanong.',
                'error',
                'May Error.'
            );
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        try {
            await teacherApi.deleteChallenge(challenge.id);
            notify(`Natanggal ang Tanong #${challenge.order_index}.`, 'info', 'Natanggal.');
            onSaved();
        } catch {
            notify('Hindi natanggal ang tanong.', 'error', 'May Error.');
        }
    };

    const singleImageUrl = resolveStorageUrl(payload.image);

    return (
        <form onSubmit={handleSave} className="p-4 rounded-xl border border-[#E5E7EB] bg-[#FAFAFA] space-y-3">
            <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#1E293B] tabular-nums">
                    Tanong / Item #{challenge.order_index}
                </span>
                <div className="flex items-center gap-2">
                    <button
                        type="submit"
                        disabled={saving}
                        className="px-3 py-1 rounded-md bg-[#1E293B] text-white text-xs font-semibold hover:bg-slate-800 cursor-pointer"
                    >
                        {saving ? 'Sine-save...' : 'I-save / Save'}
                    </button>
                    <button
                        type="button"
                        onClick={handleDelete}
                        className="p-1.5 rounded-md text-rose-600 hover:bg-rose-50 cursor-pointer"
                        title="Tanggalin / Delete"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {map.strategy_type !== 'four_pics' && (
                <div className="flex flex-wrap items-center gap-3">
                    {singleImageUrl && (
                        <img
                            src={singleImageUrl}
                            alt=""
                            className="w-24 aspect-video object-cover rounded-lg border border-[#E5E7EB] shrink-0"
                        />
                    )}
                    <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[#E5E7EB] bg-white text-[11px] font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer">
                        <Upload className="w-3.5 h-3.5" />
                        <span>{singleImageFile ? singleImageFile.name : 'Palitan Larawan / Change Image'}</span>
                        <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => setSingleImageFile(e.target.files?.[0] || null)}
                        />
                    </label>
                    {(singleImageUrl || singleImageFile) && (
                        <button
                            type="button"
                            onClick={() => {
                                setSingleImageFile(null);
                                setPayload({ ...payload, image: '' });
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-rose-200 bg-rose-50/70 hover:bg-rose-100 text-[11px] font-semibold text-rose-700 cursor-pointer transition"
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Alisin / Remove</span>
                        </button>
                    )}
                </div>
            )}

            {(map.strategy_type === 'multiple_choice' || map.strategy_type === 'decision_quest') && (
                <div className="space-y-2">
                    <label className="block text-[10px] font-bold text-slate-500">
                        {map.strategy_type === 'decision_quest'
                            ? 'Sitwasyon / Scenario'
                            : 'Tanong / Question'}
                    </label>
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
                    <div className="grid md:grid-cols-2 gap-2 pt-1">
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
                        <div>
                            <label className="block text-[10px] font-bold text-slate-500 mb-1">
                                Pahiwatig / Clue
                            </label>
                            <input
                                type="text"
                                value={payload.clue || ''}
                                onChange={(e) => setPayload({ ...payload, clue: e.target.value })}
                                className="w-full rounded-lg border border-[#E5E7EB] bg-white px-3 py-1.5 text-xs"
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-slate-500 mb-1">
                                Tamang Salita / Correct Word
                            </label>
                            <input
                                type="text"
                                value={correctAnswer.word || ''}
                                onChange={(e) => setCorrectAnswer({ word: e.target.value.toUpperCase() })}
                                className="w-full rounded-lg border border-[#E5E7EB] bg-white px-3 py-1.5 text-xs font-bold uppercase"
                            />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        {[0, 1, 2, 3].map((i) => {
                            const url = resolveStorageUrl(payload.images?.[i]);
                            return (
                                <div key={i} className="relative group">
                                    <label className="block border border-dashed border-[#E5E7EB] rounded-lg p-2 bg-white text-center cursor-pointer hover:border-[#C2410C]">
                                        {url ? (
                                            <img src={url} alt="" className="h-16 w-full object-cover rounded mb-1" />
                                        ) : (
                                            <div className="h-16 flex flex-col items-center justify-center text-slate-400 text-[11px]">
                                                <Upload className="w-4 h-4 mb-1" />
                                                Larawan {i + 1}
                                            </div>
                                        )}
                                        <span className="text-[10px] text-slate-500 block truncate">
                                            {imageFiles[i]?.name || `Image ${i + 1}`}
                                        </span>
                                        <input
                                            type="file"
                                            accept="image/*"
                                            className="hidden"
                                            onChange={(e) => {
                                                const next = [...imageFiles];
                                                next[i] = e.target.files?.[0] || null;
                                                setImageFiles(next);
                                            }}
                                        />
                                    </label>
                                    {(url || imageFiles[i]) && (
                                        <button
                                            type="button"
                                            title="Alisin ang larawan"
                                            onClick={() => {
                                                const nextFiles = [...imageFiles];
                                                nextFiles[i] = null;
                                                setImageFiles(nextFiles);
                                                const nextImgs = [...(payload.images || [null, null, null, null])];
                                                nextImgs[i] = '';
                                                setPayload({ ...payload, images: nextImgs });
                                            }}
                                            className="absolute top-1.5 right-1.5 w-6 h-6 rounded-md bg-white/95 border border-rose-200 text-rose-600 hover:bg-rose-50 inline-flex items-center justify-center shadow-xs cursor-pointer"
                                        >
                                            <Trash2 className="w-3 h-3" />
                                        </button>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {map.strategy_type === 'sequence' && (
                <div className="space-y-1.5">
                    <p className="text-[11px] text-slate-500">
                        Tamang Pagkakasunod-sunod / Correct Order:{' '}
                        <strong className="font-mono">{JSON.stringify(correctAnswer.order)}</strong>
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
                        <span className="font-bold text-slate-600">Hanay A / Column A</span>
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
                            Hanay B / Column B ({JSON.stringify(correctAnswer.pairs)})
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
