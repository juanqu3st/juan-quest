import { useEffect, useState } from 'react';
import { ArrowRight, Award, Clock, Heart, Play, RotateCcw, Square, Volume2 } from 'lucide-react';
import { resolveStorageUrl } from '../../api/axiosClient';
import { stopAllFeedbackAudio, togglePromptAudio } from '../../utils/gameAudio';

/**
 * Clean, flat, formal game briefing with clear Heart Lifeline ("Taga-Ligtas") instructions.
 */
export default function PreGameTimerLobby({ map, onStart, loading }) {
    const [playingAudio, setPlayingAudio] = useState(false);
    const hearts = map.max_hearts ?? 3;
    const seconds = map.time_limit_seconds ?? 60;
    const perfectScore = map.perfect_score ?? 10;
    const floorScore = map.min_floor_score ?? 2;
    const isPerQuestion = ['multiple_choice', 'four_pics', 'decision_quest'].includes(map.strategy_type);
    const promptAudioUrl = resolveStorageUrl(map.audio_prompt_path);

    useEffect(() => {
        return () => stopAllFeedbackAudio();
    }, []);

    const handleToggleAudio = () => {
        if (!promptAudioUrl) return;
        const started = togglePromptAudio(promptAudioUrl, () => setPlayingAudio(false));
        setPlayingAudio(started);
    };

    const formatDuration = (sec) => {
        if (sec < 60) return `${sec} segundo`;
        const m = Math.floor(sec / 60);
        const r = sec % 60;
        return r === 0 ? `${m} minuto` : `${m}m ${r}s`;
    };

    return (
        <div className="max-w-xl mx-auto w-full">
            <div className="bg-white border border-stone-200 rounded-2xl p-5 sm:p-8 space-y-5 sm:space-y-6">
                <div className="space-y-2">
                    <p className="text-xs font-semibold text-stone-500">
                        Panuto · Mapa {map.map_number}
                    </p>
                    <h3 className="text-xl sm:text-2xl font-bold text-stone-900 tracking-tight">
                        {map.title}
                    </h3>
                    <p className="text-[15px] sm:text-base text-stone-700 leading-relaxed pt-1">
                        {map.panuto}
                    </p>
                </div>

                {promptAudioUrl && (
                    <div>
                        <button
                            type="button"
                            onClick={handleToggleAudio}
                            className="min-h-[42px] inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-stone-200 bg-stone-50 hover:bg-stone-100 text-xs font-semibold text-stone-800 transition cursor-pointer"
                        >
                            {playingAudio ? (
                                <>
                                    <Square className="w-3.5 h-3.5 fill-current text-[#C2410C]" />
                                    <span>Ihinto ang audio</span>
                                </>
                            ) : (
                                <>
                                    <Volume2 className="w-4 h-4 text-[#C2410C]" />
                                    <span>Pakinggan ang panuto</span>
                                </>
                            )}
                        </button>
                    </div>
                )}

                <div className="border-t border-stone-200 pt-5 space-y-4">
                    <div className="grid grid-cols-3 gap-3 sm:gap-4 text-left">
                        <div>
                            <p className="text-xs text-stone-500 flex items-center gap-1.5">
                                <Clock className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                                <span>{isPerQuestion ? 'Oras / tanong' : 'Buong oras'}</span>
                            </p>
                            <p className="text-sm font-semibold text-stone-900 mt-0.5 tabular-nums">
                                {formatDuration(seconds)}
                            </p>
                        </div>
                        <div>
                            <p className="text-xs text-stone-500 flex items-center gap-1.5">
                                <Heart className="w-3.5 h-3.5 text-rose-500 fill-rose-500 shrink-0" />
                                <span>Taga-Ligtas</span>
                            </p>
                            <p className="text-sm font-semibold text-stone-900 mt-0.5 tabular-nums">
                                {hearts} puso
                            </p>
                        </div>
                        <div>
                            <p className="text-xs text-stone-500 flex items-center gap-1.5">
                                <Award className="w-3.5 h-3.5 text-[#15803D] shrink-0" />
                                <span>Puntos</span>
                            </p>
                            <p className="text-sm font-semibold text-stone-900 mt-0.5 tabular-nums">
                                Hanggang {perfectScore}
                            </p>
                        </div>
                    </div>

                    {/* Clear Dedicated Heart Lifeline ("Taga-Ligtas") Instruction Box */}
                    <div className="rounded-xl bg-[#FAF8F5] border border-stone-200/90 p-3.5 sm:p-4 space-y-2.5">
                        <div className="flex items-center gap-2">
                            <Heart className="w-4 h-4 text-rose-600 fill-rose-600 shrink-0" />
                            <p className="text-xs font-bold text-stone-900">
                                Paano Gumagana ang {hearts} Puso (Taga-Ligtas)
                            </p>
                        </div>
                        <ul className="space-y-2 text-xs text-stone-600 leading-relaxed">
                            <li className="flex items-start gap-2">
                                <Award className="w-3.5 h-3.5 text-[#15803D] shrink-0 mt-0.5" />
                                <span>
                                    <strong className="text-stone-800">Puntos:</strong>{' '}
                                    {map.strategy_type === 'multiple_choice'
                                        ? `1 attempt bawat tanong (+1 pt bawat tama, hanggang ${perfectScore} pts).`
                                        : isPerQuestion
                                          ? `1 attempt bawat tanong (+2 pts bawat tama, hanggang ${perfectScore} pts).`
                                          : `+2 pts bawat tamang posisyon o tugma (hanggang ${perfectScore} pts).`}
                                </span>
                            </li>
                            <li className="flex items-start gap-2">
                                <RotateCcw className="w-3.5 h-3.5 text-[#C2410C] shrink-0 mt-0.5" />
                                <span>
                                    <strong className="text-stone-800">Gamitin o Itabi ang Puso:</strong> Kapag nagkamali habang may puso pa, tatanungin ka kung <strong>gagamit ng 1 puso</strong> upang sumagot muli nang walang bawas sa puntos, o <strong>itatabi ang puso</strong> (0 pts sa tanong na iyon).
                                </span>
                            </li>
                            <li className="flex items-start gap-2">
                                <ArrowRight className="w-3.5 h-3.5 text-stone-500 shrink-0 mt-0.5" />
                                <span>
                                    <strong className="text-stone-800">Kapag 0 na ang Puso o Naubos ang Oras:</strong> Awtomatikong 0 pts sa maling sagot at tutuloy agad sa susunod. Kapag naubos ang oras, 0 puso ang natitira at may minimum na <strong>{floorScore} pts</strong> upang makapagpatuloy.
                                </span>
                            </li>
                        </ul>
                    </div>
                </div>

                <div className="pt-1">
                    <button
                        type="button"
                        disabled={loading}
                        onClick={() => {
                            stopAllFeedbackAudio();
                            onStart();
                        }}
                        className="w-full sm:w-auto min-h-[48px] px-7 py-2.5 rounded-xl bg-[#15803D] hover:bg-[#166534] disabled:bg-stone-200 disabled:text-stone-500 text-white font-semibold text-sm inline-flex items-center justify-center gap-2 transition cursor-pointer disabled:cursor-not-allowed"
                    >
                        <Play className="w-4 h-4 fill-current" />
                        <span>{loading ? 'Inihahanda...' : 'Simulan'}</span>
                    </button>
                </div>
            </div>
        </div>
    );
}
