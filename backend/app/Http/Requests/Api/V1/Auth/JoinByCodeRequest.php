<?php

namespace App\Http\Requests\Api\V1\Auth;

use Illuminate\Foundation\Http\FormRequest;

class JoinByCodeRequest extends FormRequest
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
            'join_code' => ['required', 'string', 'max:16'],
            'full_name' => ['nullable', 'string', 'min:2', 'max:100'],
            'group_name' => ['nullable', 'string', 'min:2', 'max:35'],
            'member_names' => ['nullable', 'string', 'max:400'],
        ];
    }
}
