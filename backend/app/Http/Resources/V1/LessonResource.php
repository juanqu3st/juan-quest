<?php

namespace App\Http\Resources\V1;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class LessonResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'title' => $this->title,
            'description' => $this->description,
            'video_source_type' => $this->video_source_type,
            'youtube_url' => $this->youtube_url,
            'youtube_video_id' => $this->youtube_video_id,
            'uploaded_video_path' => $this->uploaded_video_path,
            'praise_audio_path' => $this->praise_audio_path,
            'wrong_audio_path' => $this->wrong_audio_path,
            'bgm_audio_path' => $this->bgm_audio_path,
            'onboarding_voiceovers' => $this->onboarding_voiceovers,
            'outro_voiceovers' => $this->outro_voiceovers,
            'is_active' => $this->is_active,
        ];
    }
}
