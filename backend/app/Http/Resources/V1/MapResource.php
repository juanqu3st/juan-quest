<?php

namespace App\Http\Resources\V1;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class MapResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $student = $request->user();
        $progress = $this->additional['progress'] ?? null;

        return [
            'id' => $this->id,
            'lesson_id' => $this->lesson_id,
            'map_number' => $this->map_number,
            'title' => $this->title,
            'strategy_type' => $this->strategy_type,
            'strategy_label' => $this->strategy_label,
            'pokus_na_kasanayan' => $this->pokus_na_kasanayan,
            'panuto' => $this->panuto,
            'audio_prompt_path' => $this->audio_prompt_path,
            'story_video_path' => $this->story_video_path,
            'voiceover_mode' => $this->voiceover_mode ?? 'default',
            'whole_voiceover_path' => $this->whole_voiceover_path,
            'whole_voiceover_offset_sec' => (float) ($this->whole_voiceover_offset_sec ?? 0),
            'scene_script' => $this->scene_script,
            'youtube_start_sec' => $this->youtube_start_sec,
            'youtube_end_sec' => $this->youtube_end_sec,
            'max_hearts' => $this->max_hearts,
            'perfect_score' => $this->perfect_score,
            'min_floor_score' => $this->min_floor_score,
            'time_limit_seconds' => $this->time_limit_seconds,
            'allow_user_time_choice' => false,
            'feedback_correct' => $this->feedback_correct,
            'praise_audio_path' => $this->praise_audio_path,
            'feedback_wrong' => $this->feedback_wrong,
            'wrong_audio_path' => $this->wrong_audio_path,
            'is_unlocked' => $student ? ($this->map_number <= $student->current_map_number) : false,
            'challenges' => ChallengeResource::collection($this->whenLoaded('challenges')),
            'progress' => $progress ? new ProgressResource($progress) : null,
        ];
    }
}
