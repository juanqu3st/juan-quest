<?php

namespace App\Http\Requests\Api\V1\Teacher;

use Illuminate\Foundation\Http\FormRequest;

class UpdateLessonRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        $audioMimeRule = 'mimetypes:audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/wave,audio/ogg,audio/mp4,video/mp4,video/quicktime,video/x-m4v,video/x-matroska,video/x-msvideo,video/mpeg,audio/m4a,audio/x-m4a,audio/aac,audio/x-aac,audio/webm,video/webm,audio/3gpp,video/3gpp,audio/3gpp2,video/3gpp2,audio/amr,audio/flac,application/ogg';

        return [
            'title' => ['required', 'string', 'max:200'],
            'description' => ['nullable', 'string'],
            'video_source_type' => ['required', 'in:placeholder,youtube,upload'],
            'youtube_url' => ['nullable', 'string', 'max:500'],
            'uploaded_video' => ['nullable', 'file', 'mimetypes:video/mp4,video/webm', 'max:102400'],
            'remove_uploaded_video' => ['nullable', 'boolean'],
            'praise_audio' => ['nullable', 'file', $audioMimeRule, 'max:20480'],
            'wrong_audio' => ['nullable', 'file', $audioMimeRule, 'max:20480'],
            'bgm_audio' => ['nullable', 'file', $audioMimeRule, 'max:20480'],
            'remove_praise_audio' => ['nullable', 'boolean'],
            'remove_wrong_audio' => ['nullable', 'boolean'],
            'remove_bgm_audio' => ['nullable', 'boolean'],
        ];
    }
}
