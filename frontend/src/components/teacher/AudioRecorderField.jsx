import { useEffect, useRef, useState } from 'react';
import { Mic, Music, Square, Upload, X } from 'lucide-react';
import { resolveMediaUrl } from '../../api/axiosClient';

/**
 * Clean flat bilingual audio field supporting BOTH direct in-browser microphone recording
 * (MediaRecorder) and standard audio file upload (.mp3/.wav/.ogg/.m4a/.webm), with instant preview.
 */
export default function AudioRecorderField({
    label,
    hint,
    existingPath,
    selectedFile,
    onSelect,
    onRemove,
}) {
    const [recording, setRecording] = useState(false);
    const [seconds, setSeconds] = useState(0);
    const [recError, setRecError] = useState('');
    const [previewBlobUrl, setPreviewBlobUrl] = useState(null);

    const recorderRef = useRef(null);
    const streamRef = useRef(null);
    const chunksRef = useRef([]);
    const timerRef = useRef(null);

    const existingUrl = resolveMediaUrl(existingPath);

    useEffect(() => {
        if (!selectedFile) {
            setPreviewBlobUrl(null);
            return undefined;
        }
        const objUrl = URL.createObjectURL(selectedFile);
        setPreviewBlobUrl(objUrl);
        return () => URL.revokeObjectURL(objUrl);
    }, [selectedFile]);

    useEffect(() => {
        return () => {
            clearInterval(timerRef.current);
            if (streamRef.current) {
                streamRef.current.getTracks().forEach((t) => t.stop());
            }
        };
    }, []);

    const startRecording = async () => {
        setRecError('');
        if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
            setRecError('Hindi suportado ng browser ang mic recording / Mic recording unsupported. Gumamit ng Upload.');
            return;
        }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;
            chunksRef.current = [];

            const preferredTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
            const mimeType = preferredTypes.find((t) => MediaRecorder.isTypeSupported(t)) || '';
            const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
            recorderRef.current = recorder;

            recorder.ondataavailable = (e) => {
                if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
            };

            recorder.onstop = () => {
                clearInterval(timerRef.current);
                stream.getTracks().forEach((t) => t.stop());
                streamRef.current = null;

                const finalMime = recorder.mimeType || 'audio/webm';
                const ext = finalMime.includes('mp4') ? 'm4a' : finalMime.includes('ogg') ? 'ogg' : 'webm';
                const blob = new Blob(chunksRef.current, { type: finalMime });
                if (blob.size > 0) {
                    const file = new File([blob], `teacher_audio_${Date.now()}.${ext}`, {
                        type: finalMime.split(';')[0],
                    });
                    onSelect(file);
                }
                setRecording(false);
            };

            recorder.start();
            setSeconds(0);
            setRecording(true);
            timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
        } catch {
            setRecError('Hindi nabuksan ang mikropono / Allow browser microphone permission.');
        }
    };

    const stopRecording = () => {
        if (recorderRef.current && recorderRef.current.state !== 'inactive') {
            recorderRef.current.stop();
        }
    };

    const activePreviewUrl = previewBlobUrl || existingUrl;
    const mins = Math.floor(seconds / 60);
    const secs = String(seconds % 60).padStart(2, '0');

    return (
        <div className="rounded-lg border border-[#E5E7EB] bg-[#FAFAFA] p-3 space-y-2">
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <span className="text-[11px] font-bold text-slate-800 flex items-center gap-1.5">
                        <Music className="w-3.5 h-3.5 text-[#C2410C] shrink-0" />
                        <span className="truncate">{label}</span>
                    </span>
                    {hint && <p className="text-[10px] text-slate-500 mt-0.5 leading-snug">{hint}</p>}
                </div>
                {(existingUrl || selectedFile) && !recording && (
                    <button
                        type="button"
                        onClick={onRemove}
                        className="text-[11px] font-semibold text-rose-600 hover:underline inline-flex items-center gap-0.5 cursor-pointer shrink-0"
                    >
                        <X className="w-3 h-3" /> Alisin
                    </button>
                )}
            </div>

            {activePreviewUrl && !recording && (
                <audio controls src={activePreviewUrl} className="w-full h-8" preload="none" />
            )}

            {selectedFile && !recording && (
                <p className="text-[11px] font-medium text-[#15803D] truncate">
                    Nakahanda i-save / Ready: {selectedFile.name}
                </p>
            )}

            {recError && <p className="text-[11px] font-medium text-rose-600">{recError}</p>}

            <div className="flex flex-wrap items-center gap-2 pt-0.5">
                {recording ? (
                    <button
                        type="button"
                        onClick={stopRecording}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-semibold cursor-pointer tabular-nums"
                    >
                        <Square className="w-3 h-3 fill-current" />
                        <span>Ihinto / Stop ({mins}:{secs})</span>
                    </button>
                ) : (
                    <button
                        type="button"
                        onClick={startRecording}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#C2410C] hover:bg-[#9A3412] text-white text-[11px] font-semibold cursor-pointer"
                    >
                        <Mic className="w-3.5 h-3.5" />
                        <span>I-record / Record</span>
                    </button>
                )}

                {!recording && (
                    <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[#E5E7EB] bg-white hover:bg-slate-50 text-[11px] font-semibold text-slate-700 cursor-pointer">
                        <Upload className="w-3 h-3" />
                        <span>Mag-upload / Upload</span>
                        <input
                            type="file"
                            accept="audio/mpeg,audio/wav,audio/ogg,audio/mp4,audio/x-m4a,audio/webm,.mp3,.wav,.ogg,.m4a,.webm"
                            className="hidden"
                            onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) onSelect(file);
                            }}
                        />
                    </label>
                )}
            </div>
        </div>
    );
}
