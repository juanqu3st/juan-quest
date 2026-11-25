<?php

namespace App\Http\Requests\Api\V1\Teacher;

use Illuminate\Foundation\Http\FormRequest;

class StoreSessionRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        if ($this->has('join_code') && is_string($this->input('join_code'))) {
            $normalized = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', trim($this->input('join_code'))));
            $this->merge([
                'join_code' => $normalized !== '' ? $normalized : null,
            ]);
        }
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
