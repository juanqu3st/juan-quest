<?php

namespace App\Http\Requests\Api\V1\Teacher;

use Illuminate\Foundation\Http\FormRequest;

class UpdateMapRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        if (is_string($this->input('scene_script'))) {
            $decoded = json_decode($this->input('scene_script'), true);
            if (is_array($decoded)) {
                $this->merge(['scene_script' => $decoded]);
            }
        }
        if (is_string($this->input('remove_scene_audios'))) {
            $decoded = json_decode($this->input('remove_scene_audios'), true);
            if (is_array($decoded)) {
                $this->merge(['remove_scene_audios' => $decoded]);
            }
        }
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        $audioMimeRule = 'mimetypes:audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/wave,audio/ogg,audio/mp4,video/mp4,video/quicktime,video/x-m4v,video/x-matroska,video/x-msvideo,video/mpeg,audio/m4a,audio/x-m4a,audio/aac,audio/x-aac,audio/webm,video/webm,audio/3gpp,video/3gpp,audio/3gpp2,video/3gpp2,audio/amr,audio/flac,application/ogg';

        return [
            'title' => ['required', 'string', 'max:150'],
            'strategy_label' => ['required', 'string', 'max:150'],
            'pokus_na_kasanayan' => ['required', 'string'],
            'panuto' => ['required', 'string'],
            'scene_script' => ['required', 'array', 'min:1'],
            'youtube_start_sec' => ['required', 'integer', 'min:0'],
            'youtube_end_sec' => ['required', 'integer', 'min:1'],
            'max_hearts' => ['required', 'integer', 'min:1', 'max:5'],
            'time_limit_seconds' => ['required', 'integer', 'min:10', 'max:600'],
            'allow_user_time_choice' => ['nullable', 'boolean'],
            'feedback_correct' => ['required', 'string'],
            'feedback_wrong' => ['required', 'string'],
            'voiceover_mode' => ['nullable', 'in:default,whole,per_scene'],
            'whole_voiceover_offset_sec' => ['nullable', 'numeric', 'min:-30', 'max:30'],
            'story_video' => ['nullable', 'file', 'mimetypes:video/mp4,video/webm,video/quicktime,video/x-m4v', 'max:102400'],
            'whole_voiceover' => ['nullable', 'file', $audioMimeRule, 'max:51200'],
            'scene_audios' => ['nullable', 'array'],
            'scene_audios.*' => ['nullable', 'file', $audioMimeRule, 'max:51200'],
            'audio_prompt' => ['nullable', 'file', $audioMimeRule, 'max:20480'],
            'praise_audio' => ['nullable', 'file', $audioMimeRule, 'max:20480'],
            'wrong_audio' => ['nullable', 'file', $audioMimeRule, 'max:20480'],
            'remove_story_video' => ['nullable', 'boolean'],
            'remove_whole_voiceover' => ['nullable', 'boolean'],
            'remove_scene_audios' => ['nullable', 'array'],
            'remove_audio_prompt' => ['nullable', 'boolean'],
            'remove_praise_audio' => ['nullable', 'boolean'],
            'remove_wrong_audio' => ['nullable', 'boolean'],
        ];
    }
}
