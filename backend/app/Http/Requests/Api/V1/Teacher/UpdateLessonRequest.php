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
        return [
            'title' => ['required', 'string', 'max:200'],
            'description' => ['nullable', 'string'],
            'video_source_type' => ['required', 'in:placeholder,youtube,upload'],
            'youtube_url' => ['nullable', 'string', 'max:500'],
            'uploaded_video' => ['nullable', 'file', 'mimetypes:video/mp4,video/webm', 'max:102400'],
            'praise_audio' => ['nullable', 'file', 'mimes:mp3,wav,ogg,m4a,webm', 'max:15360'],
            'wrong_audio' => ['nullable', 'file', 'mimes:mp3,wav,ogg,m4a,webm', 'max:15360'],
            'bgm_audio' => ['nullable', 'file', 'mimes:mp3,wav,ogg,m4a,webm', 'max:15360'],
            'remove_praise_audio' => ['nullable', 'boolean'],
            'remove_wrong_audio' => ['nullable', 'boolean'],
            'remove_bgm_audio' => ['nullable', 'boolean'],
        ];
    }
}
