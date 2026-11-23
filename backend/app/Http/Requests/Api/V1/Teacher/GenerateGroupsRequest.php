<?php

namespace App\Http\Requests\Api\V1\Teacher;

use Illuminate\Foundation\Http\FormRequest;

class GenerateGroupsRequest extends FormRequest
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
            'members_per_group' => ['required', 'integer', 'min:1', 'max:30'],
            'shuffle' => ['sometimes', 'boolean'],
        ];
    }
}
