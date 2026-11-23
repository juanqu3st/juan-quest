<?php

namespace App\Http\Resources\V1;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class GameSessionResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'join_code' => $this->join_code,
            'class_name' => $this->class_name,
            'play_mode' => $this->play_mode ?? 'group',
            'lesson_id' => $this->lesson_id,
            'members_per_group' => $this->members_per_group,
            'groups_locked' => $this->groups_locked,
            'status' => $this->status,
            'lesson_title' => $this->whenLoaded('lesson', fn () => $this->lesson?->title),
        ];
    }
}
