import { useEffect, useState } from 'react';
import { BookOpen, Film, Save, Volume2 } from 'lucide-react';
import { teacherApi } from '../../api/teacherApi';
import { useToast } from '../../context/ToastContext';
import AudioRecorderField from '../../components/teacher/AudioRecorderField';
import TeacherLayout from './TeacherLayout';

export default function TeacherLessonPage() {
    const { showToast } = useToast();
    const [lesson, setLesson] = useState(null);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({
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

    const loadLesson = async () => {
        const res = await teacherApi.getCms();
        if (res.lesson) {
            setLesson(res.lesson);
            setForm({
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
        loadLesson();
    }, []);

    const handleSave = async (e) => {
        e.preventDefault();
        if (!lesson) return;
        setSaving(true);
        try {
            const fd = new FormData();
            fd.append('title', form.title);
            fd.append('description', form.description || '');
            fd.append('video_source_type', form.video_source_type);
            fd.append('youtube_url', form.youtube_url || '');
            if (form.uploaded_video) fd.append('uploaded_video', form.uploaded_video);
            if (form.praise_audio) fd.append('praise_audio', form.praise_audio);
            if (form.wrong_audio) fd.append('wrong_audio', form.wrong_audio);
            if (form.bgm_audio) fd.append('bgm_audio', form.bgm_audio);
            if (form.remove_praise_audio) fd.append('remove_praise_audio', '1');
            if (form.remove_wrong_audio) fd.append('remove_wrong_audio', '1');
            if (form.remove_bgm_audio) fd.append('remove_bgm_audio', '1');

            await teacherApi.updateLesson(lesson.id, fd);
            showToast('success', 'Na-save ang detalye ng Aralin at Default Audio.', 'Na-save.');
            await loadLesson();
        } catch (err) {
            showToast(
                'error',
                err?.response?.data?.message || 'Hindi na-save ang mga pagbabago sa aralin.',
                'May Error.'
            );
        } finally {
            setSaving(false);
        }
    };

    return (
        <TeacherLayout
            title="Aralin & Tunog"
            subtitle="Pamagat ng aralin, default praise/wrong voice audio, at global video fallback."
            toolbarRight={
                <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving || !lesson}
                    className="w-full sm:w-auto min-h-[42px] sm:min-h-0 sm:h-9 inline-flex items-center justify-center gap-1.5 px-4 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 transition cursor-pointer disabled:opacity-60"
                >
                    <Save className="w-3.5 h-3.5" />
                    <span>{saving ? 'Sine-save...' : 'I-save'}</span>
                </button>
            }
        >
            {!lesson ? (
                <div className="text-xs text-slate-500 py-12 text-center">Kinukuha ang detalye ng aralin...</div>
            ) : (
                <form onSubmit={handleSave} className="space-y-5">
                    {/* Card 1: Lesson Metadata */}
                    <section className="border border-slate-200/90 rounded-2xl p-5 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] space-y-4">
                        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                            <BookOpen className="w-4 h-4 text-[#C2410C]" />
                            <h2 className="text-sm font-bold text-slate-900">
                                Impormasyon ng Aralin{' '}
                                <span className="font-normal text-slate-400">/ Lesson Details</span>
                            </h2>
                        </div>

                        <div className="grid md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-[11px] font-semibold text-slate-700 mb-1.5">
                                    Pamagat ng Aralin{' '}
                                    <span className="font-normal text-slate-400">/ Lesson Title</span>
                                </label>
                                <input
                                    type="text"
                                    value={form.title}
                                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                                    className="w-full h-9 rounded-lg border border-slate-200 bg-slate-50/50 px-3 text-xs text-slate-900 focus:bg-white focus:border-[#C2410C] outline-none"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-[11px] font-semibold text-slate-700 mb-1.5">
                                    Deskripsyon{' '}
                                    <span className="font-normal text-slate-400">/ Description</span>
                                </label>
                                <input
                                    type="text"
                                    value={form.description}
                                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                                    className="w-full h-9 rounded-lg border border-slate-200 bg-slate-50/50 px-3 text-xs text-slate-900 focus:bg-white focus:border-[#C2410C] outline-none"
                                />
                            </div>
                        </div>
                    </section>

                    {/* Card 2: Global Praise, Wrong & Background Music Audio (Direct Mic Record + Upload!) */}
                    <section className="border border-slate-200/90 rounded-2xl p-5 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                            <div className="flex items-center gap-2">
                                <Volume2 className="w-4 h-4 text-[#C2410C]" />
                                <h2 className="text-sm font-bold text-slate-900">
                                    Default Feedback & Music Audio{' '}
                                    <span className="font-normal text-slate-400">/ All Maps</span>
                                </h2>
                            </div>
                            <span className="text-[11px] text-slate-500">
                                Direktang i-record sa mikropono o mag-upload ng MP3/WAV.
                            </span>
                        </div>

                        <div className="grid md:grid-cols-3 gap-4">
                            <AudioRecorderField
                                label="Papuri kapag Tama / Praise Audio"
                                hint="Hal. 'Mahusay!' — maririnig kapag tama ang sagot ng estudyante."
                                existingPath={form.remove_praise_audio ? null : lesson.praise_audio_path}
                                selectedFile={form.praise_audio}
                                onSelect={(file) =>
                                    setForm({ ...form, praise_audio: file, remove_praise_audio: false })
                                }
                                onRemove={() =>
                                    setForm({ ...form, praise_audio: null, remove_praise_audio: true })
                                }
                            />
                            <AudioRecorderField
                                label="Gabay kapag Mali / Wrong Audio"
                                hint="Hal. 'Subukan muli!' — maririnig kapag mali ang sagot."
                                existingPath={form.remove_wrong_audio ? null : lesson.wrong_audio_path}
                                selectedFile={form.wrong_audio}
                                onSelect={(file) =>
                                    setForm({ ...form, wrong_audio: file, remove_wrong_audio: false })
                                }
                                onRemove={() =>
                                    setForm({ ...form, wrong_audio: null, remove_wrong_audio: true })
                                }
                            />
                            <AudioRecorderField
                                label="Background Music sa 3D Mapa / BGM (Optional)"
                                hint="Tumutugtog lamang sa 3D World Map (fly-over at habang nakatambay). Awtomatikong hihinto kapag naglalakad o naglalaro na — may built-in default kung walang naka-upload."
                                existingPath={form.remove_bgm_audio ? null : lesson.bgm_audio_path}
                                selectedFile={form.bgm_audio}
                                onSelect={(file) =>
                                    setForm({ ...form, bgm_audio: file, remove_bgm_audio: false })
                                }
                                onRemove={() =>
                                    setForm({ ...form, bgm_audio: null, remove_bgm_audio: true })
                                }
                            />
                        </div>
                    </section>

                    {/* Card 3: Optional Global Video Fallback (for maps without per-map 3D MP4) */}
                    <section className="border border-slate-200/90 rounded-2xl p-5 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                            <div className="flex items-center gap-2">
                                <Film className="w-4 h-4 text-[#C2410C]" />
                                <h2 className="text-sm font-bold text-slate-900">
                                    Global Video Fallback{' '}
                                    <span className="font-normal text-slate-400">(Optional)</span>
                                </h2>
                            </div>
                            <span className="text-[11px] text-slate-500">
                                Para sa bawat mapa, gamitin ang Video & Voice-Over Studio sa sidebar.
                            </span>
                        </div>

                        <div className="grid md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                                    Pinagmulan ng Video / Fallback Source
                                </label>
                                <select
                                    value={form.video_source_type}
                                    onChange={(e) => setForm({ ...form, video_source_type: e.target.value })}
                                    className="w-full rounded-lg border border-[#E5E7EB] px-3 py-2 text-xs bg-white"
                                >
                                    <option value="placeholder">Built-in 3D Videos / Scene Script (Recommended)</option>
                                    <option value="youtube">YouTube Link Fallback</option>
                                    <option value="upload">Single Uploaded MP4 Fallback</option>
                                </select>
                            </div>

                            {form.video_source_type === 'youtube' && (
                                <div>
                                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                                        YouTube URL
                                    </label>
                                    <input
                                        type="url"
                                        value={form.youtube_url}
                                        onChange={(e) => setForm({ ...form, youtube_url: e.target.value })}
                                        placeholder="https://www.youtube.com/watch?v=..."
                                        className="w-full rounded-lg border border-[#E5E7EB] px-3 py-2 text-xs"
                                    />
                                </div>
                            )}

                            {form.video_source_type === 'upload' && (
                                <div>
                                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                                        Mag-upload ng MP4 / Upload MP4
                                    </label>
                                    <input
                                        type="file"
                                        accept="video/mp4,video/webm"
                                        onChange={(e) => setForm({ ...form, uploaded_video: e.target.files?.[0] || null })}
                                        className="w-full text-xs text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-[#F3F4F6] file:font-semibold"
                                    />
                                </div>
                            )}
                        </div>
                    </section>
                </form>
            )}
        </TeacherLayout>
    );
}
