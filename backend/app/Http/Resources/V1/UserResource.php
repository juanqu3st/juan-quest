<?php

namespace App\Http\Resources\V1;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class UserResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'email' => $this->email,
            'role' => $this->role,
            'section' => $this->section,
            'selected_character' => $this->selected_character,
            'current_map_number' => $this->current_map_number,
            'activity_status' => $this->activity_status,
        ];
    }
}
