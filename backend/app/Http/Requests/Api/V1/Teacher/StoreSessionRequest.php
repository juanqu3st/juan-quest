<?php

namespace App\Http\Requests\Api\V1\Teacher;

use Illuminate\Foundation\Http\FormRequest;

class StoreSessionRequest extends FormRequest
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
            'class_name' => ['required', 'string', 'max:100'],
            'lesson_id' => ['required', 'exists:lessons,id'],
            'play_mode' => ['nullable', 'in:group,individual'],
            'members_per_group' => ['nullable', 'integer', 'min:1', 'max:30'],
            'join_code' => ['nullable', 'string', 'max:16', 'unique:game_sessions,join_code'],
        ];
    }
}
